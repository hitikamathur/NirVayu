import { useState, useEffect } from "react";
import { useWards, useGeneratePlan, useAddCredit, useSubmitReport } from "@/hooks/use-wards";
import { MapPin, Clock, AlertTriangle, Leaf, ShieldCheck, HeartPulse, Camera, Trash2, ShieldAlert, CheckCircle2, Upload, Car, Construction, Factory, Wind, Trees, Loader2, Search, LineChart as LineChartIcon } from "lucide-react";
import { pollutionBlockchain } from "@/lib/blockchain";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { WardMap } from "./WardMap";
import { StatusBadge } from "./StatusBadge";
import { AqiTrendChart } from "./AqiTrendChart";
import { CaptureEvidence } from "./CaptureEvidence";
import { apiRequest } from "@/lib/queryClient";

function SourceIcon({ source }: { source: string }) {
  switch (source) {
    case "Traffic": return <Car className="w-4 h-4 text-blue-500" />;
    case "Construction": return <Construction className="w-4 h-4 text-orange-500" />;
    case "Industrial Emissions": return <Factory className="w-4 h-4 text-red-500" />;
    case "Waste Burning": return <Trees className="w-4 h-4 text-amber-600" />;
    default: return <Wind className="w-4 h-4 text-gray-500" />;
  }
}

export function CitizenDashboard() {
  const { data, isLoading } = useWards();
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const handleOutsideClick = () => setShowSuggestions(false);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  if (isLoading) return (
    <div className="flex items-center justify-center h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );

  if (!data) return null;
  const { wards, lastUpdated } = data;

  const selectedWard = wards.find(w => w.id === selectedWardId);

  // Dynamic Averages
  const avgAqi = Math.round(wards.reduce((acc, w) => acc + w.aqi, 0) / wards.length);
  const avgPm25 = Math.round(wards.reduce((acc, w) => acc + w.pm25, 0) / wards.length);
  const avgPm10 = Math.round(wards.reduce((acc, w) => acc + w.pm10, 0) / wards.length);
  const avgNo2 = Math.round(wards.reduce((acc, w) => acc + w.no2, 0) / wards.length);
  const avgCo2Budget = Math.round(wards.reduce((acc, w) => acc + w.co2_budget_remaining, 0) / wards.length);

  const filteredWards = searchQuery
    ? wards.filter(w => w.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  return (
    <div className="space-y-8">
      {/* Row 1: Key Cards Section */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard
          label={selectedWard ? "AQI" : "Delhi Avg AQI"}
          value={selectedWard ? selectedWard.aqi : avgAqi}
          unit=""
          color={selectedWard ? (selectedWard.aqi > 200 ? "text-red-500" : "text-primary") : (avgAqi > 200 ? "text-red-500" : "text-primary")}
        />
        <MetricCard
          label={selectedWard ? "PM 2.5" : "Delhi Avg PM 2.5"}
          value={selectedWard ? selectedWard.pm25 : avgPm25}
          unit="µg/m³"
        />
        <MetricCard
          label={selectedWard ? "PM 10" : "Delhi Avg PM 10"}
          value={selectedWard ? selectedWard.pm10 : avgPm10}
          unit="µg/m³"
        />
        <MetricCard
          label={selectedWard ? "NO2" : "Delhi Avg NO2"}
          value={selectedWard ? selectedWard.no2 : avgNo2}
          unit="ppb"
        />
        <MetricCard
          label={selectedWard ? "CO2 Budget" : "Delhi Avg CO2 Budget"}
          value={selectedWard ? selectedWard.co2_budget_remaining : avgCo2Budget}
          unit="tons"
          color="text-green-600"
        />
      </div>

      {/* Row 2: Map / Chart tabs + Report Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Map / Chart Column */}
        <Tabs defaultValue="map" className="lg:col-span-8 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 mb-3">
            <TabsTrigger value="map" className="gap-2">
              <MapPin className="w-4 h-4" /> Map View
            </TabsTrigger>
            <TabsTrigger value="chart" className="gap-2">
              <LineChartIcon className="w-4 h-4" /> AQI Trend Chart
            </TabsTrigger>
          </TabsList>

          {/* Map Tab */}
          <TabsContent value="map" className="mt-0">
            <Card className="border-border shadow-sm overflow-hidden h-[560px] flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <MapPin className="text-primary" /> Interactive Ward Map
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Search your neighborhood or click on the map.
                    </CardDescription>
                  </div>
                  <div className="relative w-full md:w-64" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="Search ward..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        className="w-full pl-9 h-9 text-sm"
                      />
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    </div>
                    {showSuggestions && filteredWards.length > 0 && (
                      <div className="absolute z-[1000] w-full bg-popover border rounded-md shadow-lg max-h-52 overflow-y-auto mt-1">
                        {filteredWards.map(w => (
                          <button
                            key={w.id}
                            onClick={() => {
                              setSelectedWardId(w.id);
                              setSearchQuery(w.name);
                              setShowSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors block border-b last:border-b-0"
                          >
                            {w.name} (AQI: {w.aqi})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0">
                <div className="relative h-full w-full border-t">
                  <WardMap
                    wards={wards}
                    selectedWardId={selectedWardId || undefined}
                    onSelectWard={(id) => {
                      setSelectedWardId(id);
                      const w = wards.find(x => x.id === id);
                      if (w) setSearchQuery(w.name);
                    }}
                    className="absolute inset-0"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Chart Tab — its own dedicated section, always available */}
          <TabsContent value="chart" className="mt-0">
            {selectedWard ? (
              <AqiTrendChart
                wardId={selectedWard.id}
                wardName={selectedWard.name}
                currentAqi={selectedWard.aqi}
              />
            ) : (
              <Card className="border-dashed border-2 border-border h-[560px] flex flex-col items-center justify-center bg-muted/10">
                <CardContent className="text-center p-8">
                  <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <h3 className="text-base font-bold mb-1">No Ward Selected</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Select a ward from the Map View tab or the search bar to view its AQI trend chart.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Report Panel Column */}
        <div className="lg:col-span-4 h-[560px] lg:mt-[52px]">
          {selectedWard ? (
            <ReportPollutionModule selectedWard={selectedWard} />
          ) : (
            <Card className="border-dashed border-2 border-border h-full min-h-[460px] flex flex-col items-center justify-center bg-muted/10">
              <CardContent className="text-center p-8">
                <Camera className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-base font-bold mb-1">Report Pollution</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Select a ward from the map or search bar to enable pollution reporting.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Row 3: Lower Section - Health Info + Daily Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column - Ward Info & Safe Life Planner */}
        <div className="lg:col-span-5 space-y-6">
                    {selectedWard ? (
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 space-y-6">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1 mb-2">
                  <Clock className="w-3 h-3" /> Updated: {new Date(lastUpdated).toLocaleTimeString()}
                </div>
                <h2 className="text-3xl font-display font-bold text-primary mb-1">{selectedWard.name}</h2>
                <div className="flex flex-wrap items-center gap-3 text-muted-foreground mt-2">
                  <StatusBadge aqi={selectedWard.aqi} />
                  <div className="flex items-center gap-2 bg-muted/50 px-3 py-1 rounded-full border border-border/50">
                    <SourceIcon source={selectedWard.dominant_source} />
                    <span className="text-sm font-medium">Primary Source: {selectedWard.dominant_source}</span>
                  </div>
                </div>
              </div>

              {selectedWard.emergency_mode && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 shadow-sm relative overflow-hidden"
                >
                  <h3 className="text-lg font-bold text-red-800 flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5" /> Emergency Declared!
                  </h3>
                  <p className="text-red-700 text-sm mb-3">
                    Severe pollution levels detected in {selectedWard.name}. Immediate precautions required.
                  </p>
                  <ul className="text-xs text-red-800 space-y-1 font-medium">
                    <li>• Avoid all outdoor activities</li>
                    <li>• Wear N95 masks if stepping out</li>
                    <li>• Use air purifiers indoors</li>
                  </ul>
                </motion.div>
              )}

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <HeartPulse className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold">Personalized Safe Life Planner</h3>
                </div>
                <SafeLifePlanner wardId={selectedWard.id} />
              </div>
            </div>
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-border rounded-3xl bg-muted/20">
              <MapPin className="w-8 h-8 text-muted-foreground mb-4" />
              <h3 className="text-lg font-bold mb-2">No Ward Selected</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                Select your neighborhood from the search bar or map to see localized health advice and tools.
              </p>
            </div>
          )}
        </div>

        {/* Right Column - Daily Actions Checklist */}
        <div className="lg:col-span-7">
          {selectedWard ? (
            <DailyPreventionModule selectedWard={selectedWard} />
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-border rounded-3xl bg-muted/20">
              <ShieldCheck className="w-8 h-8 text-muted-foreground mb-4" />
              <h3 className="text-lg font-bold mb-2">Action Center Locked</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                Select a ward to participate in local environment actions and earn citizen credits.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DailyPreventionModule({ selectedWard }: { selectedWard: any }) {
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
  const addCreditMutation = useAddCredit();
  const aqi = selectedWard.aqi;

  const checklist = {
    do: ["Check AQI before going out", "Stay hydrated"],
    avoid: ["Outdoor exercise during peak pollution", "Using wood-burning stoves"]
  };

  if (aqi < 100) {
    checklist.do.push("Enjoy outdoor parks", "Natural ventilation");
  } else if (aqi < 200) {
    checklist.do.push("Use a cloth mask");
    checklist.avoid.push("Heavy outdoor exertion");
  } else {
    checklist.do.push("Seal window gaps", "Run air purifier");
    checklist.avoid.push("Stepping outside for any reason");
  }

  const toggleAction = (item: string) => {
    if (completedActions.has(item)) return;

    setCompletedActions(prev => new Set(prev).add(item));
    // Each checklist action adds 10 credits to the ward
    addCreditMutation.mutate({ id: selectedWard.id, action: "carpooling" }); // Using carpooling as a proxy for "general green action"
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> Preventive Measures Module
        </CardTitle>
        <CardDescription>Daily ward-specific actions for {selectedWard.name}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <h4 className="text-xs font-bold text-blue-700 uppercase mb-2">Personal</h4>
            <ul className="text-xs space-y-1 text-blue-800">
              <li>• Wear {aqi > 200 ? "N95" : "cloth"} mask</li>
              <li>• {aqi > 150 ? "Close windows" : "Moderate ventilation"}</li>
            </ul>
          </div>
          <div className="p-3 bg-green-50 border border-green-100 rounded-lg">
            <h4 className="text-xs font-bold text-green-700 uppercase mb-2">Lifestyle</h4>
            <ul className="text-xs space-y-1 text-green-800">
              <li>• Prefer {aqi > 150 ? "Indoor" : "Public"} transport</li>
              <li>• Zero idling policy</li>
            </ul>
          </div>
          <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg">
            <h4 className="text-xs font-bold text-orange-700 uppercase mb-2">Community</h4>
            <ul className="text-xs space-y-1 text-orange-800">
              <li>• Participate in dust control</li>
              <li>• Report waste burning</li>
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-bold">Daily Prevention Checklist (Complete to earn Credits)</h4>
          <div className="space-y-2">
            {checklist.do.map((item, i) => {
              const isDone = completedActions.has(item);
              return (
                <div
                  key={i}
                  onClick={() => toggleAction(item)}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer",
                    isDone ? "bg-green-50 border-green-200 text-green-700" : "hover:bg-muted/50"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                    isDone ? "bg-green-500 border-green-500" : "border-primary/50"
                  )}>
                    {isDone && <ShieldCheck className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm">{item}</span>
                  {isDone && <span className="ml-auto text-[10px] font-bold">+10 Credits</span>}
                </div>
              );
            })}
            {checklist.avoid.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-red-700 p-2">
                <AlertTriangle className="w-4 h-4" /> {item}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, unit, color = "text-foreground" }: { label: string, value: number, unit: string, color?: string }) {
  return (
    <div className="bg-card p-4 rounded-xl border border-border/50 shadow-sm hover:shadow-md transition-shadow">
      <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-2xl font-bold font-display", color)}>{value}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function SafeLifePlanner({ wardId }: { wardId: number }) {
  const [formData, setFormData] = useState({
    ageGroup: "adult" as "child" | "adult" | "elderly",
    condition: "healthy" as "healthy" | "asthma" | "sensitive",
    outdoorHours: "2"
  });

  const { mutate, data: plan, isPending } = useGeneratePlan();

  const handleSubmit = () => {
    mutate({
      id: wardId,
      params: {
        ...formData,
        outdoorHours: Number(formData.outdoorHours)
      }
    });
  };

  return (
    <Card className="border-primary/10 shadow-lg">
      <CardHeader className="bg-primary/5 pb-4">
        <CardTitle className="flex items-center gap-2 text-primary">
          <HeartPulse className="w-5 h-5" /> Safe Life Planner
        </CardTitle>
        <CardDescription>Get a personalized schedule based on your health profile.</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {!plan ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Age Group</Label>
                <Select value={formData.ageGroup} onValueChange={(v: any) => setFormData(p => ({ ...p, ageGroup: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="child">Child (0-12)</SelectItem>
                    <SelectItem value="adult">Adult (13-60)</SelectItem>
                    <SelectItem value="elderly">Elderly (60+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Health Condition</Label>
                <Select value={formData.condition} onValueChange={(v: any) => setFormData(p => ({ ...p, condition: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="asthma">Asthma/Respiratory</SelectItem>
                    <SelectItem value="sensitive">Sensitive Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Planned Outdoor Hours</Label>
              <Input
                type="number"
                value={formData.outdoorHours}
                onChange={(e) => setFormData(p => ({ ...p, outdoorHours: e.target.value }))}
                min={0} max={24}
              />
            </div>
            <Button onClick={handleSubmit} disabled={isPending} className="w-full font-bold">
              {isPending ? "Analyzing..." : "Generate Safe Schedule"}
            </Button>
          </div>
        ) : (
          <div className="space-y-6 animate-in zoom-in-95 duration-300">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                <div className="text-xs text-green-700 font-bold uppercase mb-1">Safe Window</div>
                <div className="text-lg font-bold text-green-800 flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4" /> {plan.safeTimeWindow}
                </div>
              </div>
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
                <div className="text-xs text-red-700 font-bold uppercase mb-1">Avoid Outdoors</div>
                <div className="text-lg font-bold text-red-800 flex items-center justify-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> {plan.avoidTimeWindow}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <span className="font-semibold text-sm">Recommended Mask</span>
              <Badge variant={plan.maskLevel === "None" ? "secondary" : "destructive"} className="text-sm px-3 py-1">
                {plan.maskLevel}
              </Badge>
            </div>

            <div className="bg-primary/5 p-4 rounded-lg text-sm text-black leading-relaxed border border-primary/10">
              <span className="font-bold text-primary block mb-1">Expert Advice:</span>
              {plan.advice}
            </div>

            <Button variant="ghost" onClick={() => mutate(undefined as any)} className="w-full text-xs text-muted-foreground">
              Reset Planner
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function ReportPollutionModule({ selectedWard }: { selectedWard: any }) {
  const [image, setImage] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const submitMutation = useSubmitReport();
  const { toast } = useToast();

  const detectLocation = () => {
    setGettingLocation(true);
    setErrorMsg(null);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          setGettingLocation(false);
          toast({
            title: "Location detected",
            description: `Latitude: ${position.coords.latitude.toFixed(4)}, Longitude: ${position.coords.longitude.toFixed(4)}`,
          });
        },
        (error) => {
          console.warn("Geolocation failed, using ward centroid:", error);
          setCoords({
            latitude: selectedWard.latitude,
            longitude: selectedWard.longitude
          });
          setGettingLocation(false);
          toast({
            title: "Geolocation failed",
            description: `Using centroid of ${selectedWard.name} as fallback.`,
            variant: "destructive"
          });
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      setCoords({
        latitude: selectedWard.latitude,
        longitude: selectedWard.longitude
      });
      setGettingLocation(false);
    }
  };

  useEffect(() => {
    detectLocation();
  }, [selectedWard]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image) {
      toast({
        title: "Image required",
        description: "Please upload or capture a photo of the pollution.",
        variant: "destructive"
      });
      return;
    }

    const reportCoords = coords || {
      latitude: selectedWard.latitude,
      longitude: selectedWard.longitude
    };

    setErrorMsg(null);
    setSuccessData(null);

    submitMutation.mutate(
      {
        mediaBase64: image,
        latitude: reportCoords.latitude,
        longitude: reportCoords.longitude,
        description
      },
      {
        onSuccess: (data) => {
          setSuccessData(data);
          setImage(null);
          setDescription("");
          toast({
            title: "Report submitted successfully",
            description: "Logged to the blockchain ledger.",
          });
        },
        onError: (err: any) => {
          setErrorMsg(err.message || "Failed to submit report. The image may have been rejected as irrelevant.");
          toast({
            title: "Report Rejected",
            description: err.message || "AI classified image as irrelevant.",
            variant: "destructive"
          });
        }
      }
    );
  };

  return (
    <Card className="border-border shadow-md h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Camera className="w-5 h-5 text-primary" /> Report Local Pollution
        </CardTitle>
        <CardDescription>
          Upload a photo of pollution (traffic, construction dust, or stubble burning). AI will analyze it and auto-detect the nearest ward to register the report.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 overflow-y-auto">
        {successData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-green-50/50 border border-green-200 rounded-xl space-y-3 mb-4"
          >
            <div className="flex items-center gap-2 text-green-800 font-bold">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span>Report Submitted &amp; Cryptographically Verified!</span>
            </div>
            {successData.aiAnalysisStatus === "fallback" && (
              <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-800">
                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>Note:</strong> Gemini Vision AI is currently unavailable (API key issue). Classification was done using description keywords. For real AI image analysis, update the <code className="bg-amber-100 px-1 rounded">GEMINI_API_KEY</code> in <code className="bg-amber-100 px-1 rounded">.env</code> with a valid key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Google AI Studio</a>.</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-green-950 bg-background/50 p-3 rounded-lg border border-green-100">
              <div>
                <span className="font-bold block text-green-800">Auto-Detected Ward:</span>
                Ward ID: {successData.report.wardId} (Coordinates: {successData.report.latitude.toFixed(4)}, {successData.report.longitude.toFixed(4)})
              </div>
              <div>
                <span className="font-bold block text-green-800">Classification:</span>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={cn(
                    "capitalize font-semibold px-1.5 py-0.5 rounded text-[11px]",
                    successData.report.pollutionType === "traffic" && "bg-blue-100 text-blue-800",
                    successData.report.pollutionType === "construction" && "bg-orange-100 text-orange-800",
                    successData.report.pollutionType === "stubble burning" && "bg-red-100 text-red-800",
                    successData.report.pollutionType === "other" && "bg-purple-100 text-purple-800",
                  )}>
                    {successData.report.pollutionType === "other" ? "Other Pollution Source" : successData.report.pollutionType}
                  </span>
                  <span className="text-muted-foreground">(Confidence: {successData.report.aiConfidence}%)</span>
                  {successData.aiAnalysisStatus === "ai" ? (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-blue-50 text-blue-700 border-blue-200">✦ Gemini Vision</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-amber-50 text-amber-700 border-amber-200">⚠ Keyword Fallback</Badge>
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <span className="font-bold block text-green-800">Status:</span>
                Accepted
              </div>

            </div>
          </motion.div>
        )}

        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3 text-red-800 mb-4"
          >
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">AI Verification Failed</span>
              <p className="text-sm mt-1">{errorMsg}</p>
            </div>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Image Upload */}
          <div className="space-y-2">
            <Label>Capture or Upload Photo</Label>
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-4 bg-muted/20 relative min-h-[180px]">
              {image ? (
                <div className="relative w-full h-[160px]">
                  <img src={image} className="w-full h-full object-cover rounded-lg" alt="Pollution preview" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 rounded-full h-7 w-7"
                    onClick={() => setImage(null)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm font-semibold">Select/Snap Image</span>
                  <span className="text-xs text-muted-foreground">JPEG or PNG up to 10MB</span>
                  <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </label>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <textarea
              className="w-full min-h-[80px] p-3 text-sm rounded-lg border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Provide context (e.g. dense exhaust smog near flyover, open waste dump burning...)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Geo-Location */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground block">Geo-Location Status</Label>
            <div className="flex items-center gap-2 p-2 bg-muted/30 border rounded-lg">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <div className="text-[11px] text-muted-foreground truncate">
                {gettingLocation ? (
                  <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Fetching GPS coordinates...</span>
                ) : coords ? (
                  <span>GPS: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}</span>
                ) : (
                  <span>Centroid Fallback: {selectedWard.latitude.toFixed(5)}, {selectedWard.longitude.toFixed(5)}</span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto text-[10px] h-6 px-2 font-bold"
                onClick={detectLocation}
                disabled={gettingLocation}
              >
                Refresh
              </Button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={submitMutation.isPending || !image}
            className="w-full font-bold shadow-md"
          >
            {submitMutation.isPending ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</span>
            ) : (
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Submit</span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}