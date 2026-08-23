import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  role: text("role").notNull().default("citizen"), // "citizen" or "authority"
});

export const wards = pgTable("wards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),

  // Pollution Metrics
  aqi: integer("aqi").notNull(),
  pm25: real("pm25").notNull(),
  pm10: real("pm10").notNull(),
  no2: real("no2").notNull(),
  so2: real("so2").notNull().default(0),
  co: real("co").notNull().default(0),
  o3: real("o3").notNull().default(0),

  // Derived Metrics
  wprs: integer("wprs").notNull(),
  co2_budget_remaining: real("co2_budget_remaining").notNull(),

  // Status
  emergency_mode: boolean("emergency_mode").default(false).notNull(),

  // Controls & Simulation
  active_controls: jsonb("active_controls").$type<string[]>().notNull().default([]),
  dominant_source: text("dominant_source").notNull().default("Traffic"),

  // Dynamic Intelligence Layer
  intelligence_data: jsonb("intelligence_data").$type<{
    ward: string;
    primary_pollutant: string;
    severity: string;
    analysis_summary: string;
    execution_plan_90_days: {
      days_0_30: string[];
      days_31_60: string[];
      days_61_90: string[];
    };
    confidence_level: string;
    allowed_controls: string[];
    predicted_aqi?: number;
    prediction_horizon?: string;
    prediction_confidence?: number;
  }>(),

  // Credit Point System (New)
  mitigation_effort: integer("mitigation_effort").notNull().default(0), // 0-100
  citizen_credits: integer("citizen_credits").notNull().default(0), // Total aggregated per ward
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  wardId: integer("wardId").notNull(),
  pollutionType: text("pollutionType").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  mediaHash: text("mediaHash").notNull(),
  txHash: text("txHash"),
  verified: boolean("verified").default(false).notNull(),
  imageUrl: text("image_url"),
  status: text("status").default("pending").notNull(),
  description: text("description"),
  aiConfidence: integer("ai_confidence").default(0),
  aiExplanation: text("ai_explanation"),
});

// === NEW: SECURE EVIDENCE TABLE ===
export const evidence = pgTable("evidence", {
  id: serial("id").primaryKey(),
  wardId: integer("ward_id").notNull(),
  actionType: text("action_type").notNull(),
  imageUrl: text("image_url").notNull(),
  // Use double precision for higher accuracy in geofencing
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  aiScore: integer("ai_score").default(0), // 0-100 confidence that image is real
  manipulationScore: integer("manipulation_score").default(0),
  facialMatchScore: integer("facial_match_score").default(0),
  verificationStatus: text("verification_status").default("pending"),
  actionChallengesCompleted: jsonb("action_challenges_completed").$type<string[]>(),
  metadata: jsonb("metadata").$type<{
    device?: string;
    exif?: Record<string, any>;
    livenessScore?: number;
    watermarkHash?: string;
    securityNotes?: string[];
    serverProcessedAt?: string;
  }>(),
});

// === SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertWardSchema = createInsertSchema(wards);
export const insertReportSchema = createInsertSchema(reports).omit({ 
  id: true, 
  timestamp: true, 
  verified: true 
}).extend({
  wardId: z.number().optional(),
  pollutionType: z.string().optional(),
  mediaHash: z.string().optional(),
  status: z.string().optional(),
  imageUrl: z.string().optional().nullable(),
  txHash: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  aiConfidence: z.number().optional().nullable(),
  aiExplanation: z.string().optional().nullable()
});
export const insertEvidenceSchema = createInsertSchema(evidence).omit({ id: true, timestamp: true, isVerified: true, aiScore: true, verificationStatus: true, manipulationScore: true, facialMatchScore: true });

// === EXPLICIT API TYPES ===
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Ward = typeof wards.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Evidence = typeof evidence.$inferSelect;
export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;

// Simulation Types
export type ControlType =
  | "traffic_odd_even"
  | "traffic_heavy_ban"
  | "construction_halt"
  | "dust_sprinkling"
  | "industry_shutdown"
  | "waste_burning_ban";

export interface UpdateControlsRequest {
  controls: ControlType[];
}

export interface SimulationRequest {
  trafficReduction: number; // 0-100%
  constructionHalt: boolean;
  dustSuppression: number; // 0-100%
}

export const simulationResultSchema = z.object({
  currentAqi: z.number(),
  projectedAqi: z.number(),
  absoluteImprovement: z.number(),
  percentageImprovement: z.number(),
  breakdown: z.object({
    dust: z.number(),
    traffic: z.number(),
    construction: z.number()
  }),
  summary: z.string()
});

export type SimulationResult = z.infer<typeof simulationResultSchema>;

// AQI trend history — served per ward for the trend chart. Kept in-memory
// alongside the rest of ward state (see server/storage.ts); not a DB table
// since this project runs entirely off MemStorage.
export interface AqiHistoryPoint {
  timestamp: string; // ISO 8601
  aqi: number;
  pm25: number;
  pm10: number;
}

export interface CitizenPlanRequest {
  ageGroup: "child" | "adult" | "elderly";
  condition: "healthy" | "asthma" | "sensitive";
  outdoorHours: number;
}

export interface CitizenPlanResponse {
  safeTimeWindow: string;
  avoidTimeWindow: string;
  maskLevel: "None" | "Cloth" | "N95" | "Surgical" | "Avoid Outdoors";
  advice: string;
  preventiveMeasures: {
    personal: string[];
    lifestyle: string[];
    community: string[];
  };
  checklist: {
    do: string[];
    avoid: string[];
  };
}
