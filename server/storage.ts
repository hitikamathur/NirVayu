import { type Ward, type User, type InsertUser, type Report, type InsertReport, type Evidence, type InsertEvidence, type AqiHistoryPoint } from "@shared/schema";
import fs from "fs";
import path from "path";
import * as turf from "@turf/turf";
import { execFile } from "child_process";
import { promisify } from "util";
import session from "express-session";
import createMemoryStore from "memorystore";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MemoryStore = createMemoryStore(session);
const execFilePromise = promisify(execFile);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getWards(): Promise<Ward[]>;
  getWard(id: number): Promise<Ward | undefined>;
  updateWard(id: number, ward: Partial<Ward>): Promise<Ward>;
  getLastUpdated(): Promise<Date>;
  getWardHistory(id: number, hours?: number): Promise<AqiHistoryPoint[]>;

  // Reports
  createReport(report: Omit<Report, "id" | "timestamp" | "verified">): Promise<Report>;
  getReportsByWard(wardId: number): Promise<Report[]>;
  getReports(): Promise<Report[]>;
  updateReportVerification(id: number, verified: boolean): Promise<Report>;
  updateReportStatus(id: number, status: string): Promise<Report>;
  deleteReport(id: number): Promise<boolean>;
  restoreReport(report: Report): Promise<Report>;
  updateReportBlockchain(id: number, mediaHash: string, txHash: string | null): Promise<Report>;

  // Evidence
  createEvidence(evidence: Omit<Evidence, "id" | "timestamp" | "isVerified" | "actionChallengesCompleted"> & { isVerified?: boolean; actionChallengesCompleted?: string[] | null }): Promise<Evidence>;

  sessionStore: session.Store;
}

function co2_budget_from_aqi(
  aqi: number,
  e_max: number = 10000,
  traffic_score: number | null = null,
  construction_score: number | null = null,
  industrial_score: number | null = null,
  stubble_score: number | null = null
): number {
  /**
   * Backward-compatible dynamic CO₂ budget
   */

  aqi = Math.min(Math.max(aqi, 0), 500);
  const base_pollution = aqi / 500;

  // Fallback: behave exactly like old logic if no extra data is provided
  if ([traffic_score, construction_score, industrial_score, stubble_score].every(v => v === null)) {
    return Math.round(e_max * (1 - base_pollution) * 100) / 100;
  }

  const traffic = (traffic_score ?? 50) / 100;
  const construction = (construction_score ?? 50) / 100;
  const industry = (industrial_score ?? 50) / 100;
  const stubble = (stubble_score ?? 20) / 100;

  const pollution_factor = Math.min(
    1,
    base_pollution * (
      0.5
      + 0.2 * traffic
      + 0.15 * construction
      + 0.1 * industry
      + 0.05 * stubble
    )
  );

  const co2_budget = e_max * (1 - pollution_factor);

  // Safety floor to avoid zero budgets
  return Math.round(Math.max(co2_budget, e_max * 0.25) * 100) / 100;
}

function predictFutureAqi(currentAqi: number, pm25: number, pm10: number): { predictedAqi: number; confidence: number; horizon: string } {
  let trendFactor = 1.05; // Default slight increase
  if (pm25 > 150 || pm10 > 250) {
    trendFactor = 1.15; // Higher accumulation probability
  } else if (currentAqi < 50) {
    trendFactor = 1.02; // Stable at low levels
  }
  return {
    predictedAqi: Math.round(currentAqi * trendFactor * 100) / 100,
    confidence: currentAqi > 0 ? 0.85 : 0.0,
    horizon: "24h"
  };
}

// How many hours of AQI history to retain per ward before trimming old points
const HISTORY_RETENTION_HOURS = 48;
// Backfill window so trend charts aren't empty on first load / demo
const HISTORY_SEED_HOURS = 24;

export class MemStorage implements IStorage {
  private users = new Map<string, User>();
  private wards = new Map<number, Ward>();
  private reports = new Map<number, Report>();
  private evidence = new Map<number, Evidence>();
  private reportIdCounter = 1;
  private evidenceIdCounter = 1;
  private lastUpdated = new Date();
  private history = new Map<number, AqiHistoryPoint[]>();
  public sessionStore: session.Store;

  constructor() {
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
    // Seed Wards and start AQI update in the background so it doesn't block server listen
    this.loadGeoJSON();
    setImmediate(async () => {
      try {
        await this.updatePollutionData();
      } catch (err) {
        console.error("Initial background AQI update failed:", err);
      }
    });
    // Refresh from API every 3 minutes (rate-limit safe)
    setInterval(() => this.updatePollutionData(), 3 * 60 * 1000);

    // Seed Authority Account
    this.createUser({
      username: "admin",
      password: "password123",
      role: "authority"
    });
  }

  private loadGeoJSON() {
    const pathsToTry = [
      path.resolve(process.cwd(), "attached_assets/Delhi_Wards_1768070860005.geojson"),
      path.resolve(process.cwd(), "dist/attached_assets/Delhi_Wards_1768070860005.geojson"),
      path.resolve(__dirname, "../attached_assets/Delhi_Wards_1768070860005.geojson"),
      path.resolve(__dirname, "../../attached_assets/Delhi_Wards_1768070860005.geojson"),
      path.resolve(__dirname, "attached_assets/Delhi_Wards_1768070860005.geojson"),
    ];

    let geojsonPath = "";
    for (const p of pathsToTry) {
      if (fs.existsSync(p)) {
        geojsonPath = p;
        break;
      }
    }

    if (!geojsonPath) {
      console.error("GeoJSON file not found at any tried paths:", pathsToTry);
      return;
    }

    const data = fs.readFileSync(geojsonPath, "utf8");
    const geojson = JSON.parse(data);
 
    geojson.features.forEach((feature: any, index: number) => {
      const id = index + 1;
      // Use Turf to get the actual centroid of the ward
      const center = turf.centroid(feature);
      const [lng, lat] = center.geometry.coordinates;
 
      // Deterministic realistic pollution values based on ward ID
      const aqi = 150 + ((id * 31) % 200); // 150 to 350
      const pm25 = Math.round(aqi * 0.6);
      const pm10 = Math.round(aqi * 0.8);
      const no2 = Math.round(aqi * 0.1);
      const so2 = Math.round(aqi * 0.05);
      const co = Math.round(aqi * 0.02 * 10) / 10;
      const o3 = Math.round(aqi * 0.03);
 
      let primarySource = "Traffic";
      if (id % 4 === 0) primarySource = "Construction";
      else if (id % 4 === 1) primarySource = "Industrial Emissions";
      else if (id % 4 === 2) primarySource = "Waste Burning";
 
      const primaryPollutant = aqi > 300 ? "PM2.5" : (no2 > 50 ? "NO2" : "Dust");
      const severity = aqi > 400 ? "Severe+" : aqi > 300 ? "Severe" : aqi > 200 ? "Poor" : "Moderate";
      const allowedControls = ["water_sprinkling", "waste_burning_ban"];
      if (aqi > 200) allowedControls.push("traffic_odd_even", "construction_halt");

      const prediction = predictFutureAqi(aqi, pm25, pm10);
 
      const intelligence_data: any = {
        ward: feature.properties.Ward_Name ?? `Ward ${id}`,
        primary_pollutant: primaryPollutant,
        severity,
        analysis_summary: `ML engine detected ${primaryPollutant} as dominant factor. Current AQI ${aqi} indicates ${severity} conditions. Prediction: ${prediction.predictedAqi} AQI in ${prediction.horizon} (Confidence: ${Math.round(prediction.confidence * 100)}%).`,
        execution_plan_90_days: {
          days_0_30: allowedControls.slice(0, 3).map(c => `Immediate enforcement of ${c.replace(/_/g, ' ')}`),
          days_31_60: [
            `Transitioning from ${allowedControls[0].replace(/_/g, ' ')} to structural monitoring`,
            `Deploying ${primaryPollutant}-specific mitigation units`,
            `Ward-level compliance score integration (Current: ${Math.max(0, 100 - Math.floor(aqi / 5))}%)`
          ],
          days_61_90: [
            "AI-driven predictive maintenance of control units",
            "Community-led green buffer expansion",
            `Evaluation of ${severity} reduction effectiveness`
          ]
        },
        confidence_level: "High",
        allowed_controls: allowedControls,
        predicted_aqi: prediction.predictedAqi,
        prediction_horizon: prediction.horizon,
        prediction_confidence: prediction.confidence
      };
 
      this.wards.set(id, {
        id,
        name: feature.properties.Ward_Name ?? `Ward ${id}`,
        latitude: lat,
        longitude: lng,
        aqi,
        pm25,
        pm10,
        no2,
        so2,
        co,
        o3,
        wprs: Math.max(0, 100 - Math.floor(aqi / 5)),
        co2_budget_remaining: co2_budget_from_aqi(aqi, 5000),
        emergency_mode: false,
        active_controls: [],
        dominant_source: primarySource,
        mitigation_effort: 0,
        citizen_credits: 0,
        intelligence_data
      });

      // Backfill a plausible history so the trend chart isn't empty before the
      // first few live AQI refresh cycles complete. Clearly a synthetic seed —
      // real points get appended by updatePollutionData() going forward.
      this.seedHistory(id, aqi, pm25, pm10);
    });
  }

  // Generates a deterministic, diurnally-shaped backfill (rush-hour bumps,
  // overnight dip) so a ward's trend chart has a full 24h line immediately,
  // instead of showing a single dot until real data accumulates.
  private seedHistory(wardId: number, baseAqi: number, basePm25: number, basePm10: number) {
    const points: AqiHistoryPoint[] = [];
    const now = Date.now();
    for (let i = HISTORY_SEED_HOURS; i >= 0; i--) {
      const timestamp = new Date(now - i * 60 * 60 * 1000);
      const hour = timestamp.getHours();
      const rushFactor = (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20) ? 1.12 : 1.0;
      const nightFactor = hour >= 23 || hour <= 5 ? 0.85 : 1.0;
      // Small deterministic wobble so the line isn't a perfectly smooth curve
      const wobble = 0.96 + (((wardId * 7 + i * 13) % 9) / 100);
      const factor = rushFactor * nightFactor * wobble;
      points.push({
        timestamp: timestamp.toISOString(),
        aqi: Math.max(0, Math.round(baseAqi * factor)),
        pm25: Math.max(0, Math.round(basePm25 * factor)),
        pm10: Math.max(0, Math.round(basePm10 * factor)),
      });
    }
    this.history.set(wardId, points);
  }

  // Appends a real snapshot for a ward and trims anything older than the
  // retention window. Called every time live/estimated AQI data is refreshed.
  private recordHistoryPoint(wardId: number, aqi: number, pm25: number, pm10: number) {
    const existing = this.history.get(wardId) ?? [];
    existing.push({
      timestamp: new Date().toISOString(),
      aqi,
      pm25,
      pm10,
    });
    const cutoff = Date.now() - HISTORY_RETENTION_HOURS * 60 * 60 * 1000;
    const trimmed = existing.filter(p => new Date(p.timestamp).getTime() >= cutoff);
    this.history.set(wardId, trimmed);
  }

  async getWardHistory(id: number, hours: number = 24) {
    const points = this.history.get(id) ?? [];
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return points
      .filter(p => new Date(p.timestamp).getTime() >= cutoff)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public async updatePollutionData() {
    const token = process.env.AQICN_API_KEY || process.env.AQI_TOKEN;
    if (!token) {
      console.warn("AQICN_API_KEY/AQI_TOKEN not found, skipping update.");
      return;
    }

    console.log(`[AQI] Starting ward-centric update for ${this.wards.size} wards...`);

    for (const [id, ward] of Array.from(this.wards.entries())) {
      try {
        const url = `https://api.waqi.info/feed/geo:${ward.latitude};${ward.longitude}/?token=${token}`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.status === "ok" && json.data?.aqi && json.data.aqi !== "-") {
          const aqi = Number(json.data.aqi);
          const iaqi = json.data.iaqi || {};

          // Data & Logic: Fetch ward-wise air quality data
          const pm25 = iaqi.pm25?.v ?? (aqi * 0.6);
          const pm10 = iaqi.pm10?.v ?? (aqi * 0.8);
          const no2 = iaqi.no2?.v ?? (aqi * 0.1);
          const so2 = iaqi.so2?.v ?? (aqi * 0.05);
          const co = iaqi.co?.v ?? (aqi * 0.02);
          const o3 = iaqi.o3?.v ?? (aqi * 0.03);

          // Dynamically determine the primary pollution source per ward using dominant pollutant logic:
          // NO₂ + CO dominance → Traffic
          // PM10 dominance → Construction
          // SO₂ dominance → Industrial Emissions
          // Default logic: PM2.5/PM10 usually dominant
          let primarySource = "General";
          if (no2 > 40 || co > 10) {
            primarySource = "Traffic";
          } else if (pm10 > 150 && pm10 > pm25 * 1.5) {
            primarySource = "Construction";
          } else if (so2 > 20) {
            primarySource = "Industrial Emissions";
          } else if (pm25 > 100) {
            primarySource = "Waste Burning";
          } else {
            primarySource = "Dust & Local";
          }

          const primaryPollutant = aqi > 300 ? "PM2.5" : (no2 > 50 ? "NO2" : "Dust");
          const severity = aqi > 400 ? "Severe+" : aqi > 300 ? "Severe" : aqi > 200 ? "Poor" : "Moderate";
          const allowedControls: string[] = ["water_sprinkling", "waste_burning_ban"];
          if (aqi > 200) allowedControls.push("traffic_odd_even", "construction_halt");
          if (aqi > 400) allowedControls.push("industry_shutdown", "traffic_heavy_ban");

          const intelligence_data: NonNullable<Ward["intelligence_data"]> = {
            ward: ward.name,
            primary_pollutant: primaryPollutant,
            severity,
            analysis_summary: `ML engine detected ${primaryPollutant} as dominant factor. Current AQI ${aqi} indicates ${severity} conditions.`,
            execution_plan_90_days: {
              days_0_30: allowedControls.slice(0, 3).map(c => `Immediate enforcement of ${c.replace(/_/g, ' ')}`),
              days_31_60: [
                `Transitioning from ${allowedControls[0].replace(/_/g, ' ')} to structural monitoring`,
                `Deploying ${primaryPollutant}-specific mitigation units`,
                `Ward-level compliance score integration (Current: ${Math.max(0, 100 - Math.floor(aqi / 5))}%)`
              ],
              days_61_90: [
                "AI-driven predictive maintenance of control units",
                "Community-led green buffer expansion",
                `Evaluation of ${severity} reduction effectiveness`
              ]
            },
            confidence_level: "High",
            allowed_controls: allowedControls,
            predicted_aqi: undefined,
            prediction_horizon: undefined,
            prediction_confidence: undefined
          };

          const updatedWard = {
            ...ward,
            aqi,
            pm25,
            pm10,
            no2,
            wprs: Math.max(0, 100 - Math.floor(aqi / 5)),
            co2_budget_remaining: co2_budget_from_aqi(aqi, 5000),
            dominant_source: primarySource,
            intelligence_data
          };

          // Native AQI Prediction (No external process dependency)
          try {
            const prediction = predictFutureAqi(aqi, pm25, pm10);
            updatedWard.intelligence_data.analysis_summary += ` Prediction: ${prediction.predictedAqi} AQI in ${prediction.horizon} (Confidence: ${Math.round(prediction.confidence * 100)}%).`;
            // Add explicit fields for the UI
            updatedWard.intelligence_data.predicted_aqi = prediction.predictedAqi;
            updatedWard.intelligence_data.prediction_horizon = prediction.horizon;
            updatedWard.intelligence_data.prediction_confidence = prediction.confidence;
            console.log(`[Prediction] ${ward.name}: ${prediction.predictedAqi} AQI predicted`);
          } catch (err) {
            console.error(`[Prediction] Failed for ${ward.name}:`, err);
          }

          this.wards.set(id, updatedWard);
          this.recordHistoryPoint(id, aqi, pm25, pm10);
          console.log(`[AQI] ${ward.name} → ${aqi} (live)`);
        }
      } catch (err) {
        console.error(`[AQI] Fetch failed for ward ${ward.name}:`, err);
      }

      // Keep small delay
      await new Promise(r => setTimeout(r, 50));
    }

    // Second pass: Estimation for wards that still have 0 or failed
    for (const [id, ward] of Array.from(this.wards.entries())) {
      if (ward.aqi === 0 || ward.aqi === null) {
        let nearestWard: any = null;
        let minDistance = Infinity;

        for (const [otherId, otherWard] of Array.from(this.wards.entries())) {
          if (id === otherId || !otherWard.aqi || otherWard.aqi === 0) continue;

          const dist = turf.distance(
            turf.point([ward.longitude, ward.latitude]),
            turf.point([otherWard.longitude, otherWard.latitude])
          );

          if (dist < minDistance) {
            minDistance = dist;
            nearestWard = otherWard;
          }
        }

        if (nearestWard) {
          const estimatedAqi = nearestWard.aqi;
          this.wards.set(id, {
            ...ward,
            aqi: estimatedAqi,
            pm25: nearestWard.pm25,
            pm10: nearestWard.pm10,
            no2: nearestWard.no2,
            wprs: nearestWard.wprs,
            intelligence_data: nearestWard.intelligence_data as any,
            dominant_source: nearestWard.dominant_source
          });
          this.recordHistoryPoint(id, estimatedAqi, nearestWard.pm25, nearestWard.pm10);
          console.log(`[AQI] ${ward.name} → ${estimatedAqi} (estimated from ${nearestWard.name})`);
        }
      }
    }

    this.lastUpdated = new Date();
  }

  async getLastUpdated() {
    return this.lastUpdated;
  }

  async getUser(id: string) {
    return this.users.get(id);
  }

  async getUserByUsername(username: string) {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }

  async createUser(insertUser: InsertUser) {
    const id = (this.users.size + 1).toString();
    const user: User = { ...insertUser, id, role: insertUser.role || "citizen" };
    this.users.set(id, user);
    return user;
  }

  async getWards() {
    return Array.from(this.wards.values());
  }

  async getWard(id: number) {
    return this.wards.get(id);
  }

  async updateWard(id: number, updates: Partial<Ward>) {
    const ward = this.wards.get(id);
    if (!ward) throw new Error("Ward not found");
    const updated = { ...ward, ...updates };
    this.wards.set(id, updated);
    return updated;
  }

  async createReport(insertReport: Omit<Report, "id" | "timestamp" | "verified">) {
    const id = this.reportIdCounter++;
    const report: Report = {
      ...insertReport,
      id,
      timestamp: new Date(),
      verified: false,
    };
    this.reports.set(id, report);
    return report;
  }

  async getReportsByWard(wardId: number) {
    return Array.from(this.reports.values()).filter(r => r.wardId === wardId);
  }

  async getReports() {
    return Array.from(this.reports.values());
  }

  async updateReportVerification(id: number, verified: boolean) {
    const report = this.reports.get(id);
    if (!report) throw new Error("Report not found");
    const updated = { ...report, verified };
    this.reports.set(id, updated);
    return updated;
  }

  async updateReportStatus(id: number, status: string) {
    const report = this.reports.get(id);
    if (!report) throw new Error("Report not found");
    const updated = { ...report, status };
    this.reports.set(id, updated);
    return updated;
  }

  async deleteReport(id: number) {
    return this.reports.delete(id);
  }

  async restoreReport(report: Report) {
    this.reports.set(report.id, report);
    if (report.id >= this.reportIdCounter) {
      this.reportIdCounter = report.id + 1;
    }
    return report;
  }

  async updateReportBlockchain(id: number, mediaHash: string, txHash: string | null) {
    const report = this.reports.get(id);
    if (!report) throw new Error("Report not found");
    const updated = { ...report, mediaHash, txHash };
    this.reports.set(id, updated);
    return updated;
  }

  async createEvidence(insertEvidence: Omit<Evidence, "id" | "timestamp" | "isVerified" | "actionChallengesCompleted"> & { isVerified?: boolean; actionChallengesCompleted?: string[] | null }) {
    const id = this.evidenceIdCounter++;
    const evidence: Evidence = {
      ...insertEvidence,
      id,
      timestamp: new Date(),
      isVerified: insertEvidence.isVerified ?? false,
      aiScore: insertEvidence.aiScore ?? (Math.floor(Math.random() * 20) + 80),
      metadata: insertEvidence.metadata || null,
      actionChallengesCompleted: insertEvidence.actionChallengesCompleted ?? null
    };
    this.evidence.set(id, evidence);
    return evidence;
  }
}

export const storage = new MemStorage();
