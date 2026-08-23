import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, LineChart as LineChartIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { StatusBadge } from "./StatusBadge";
import { useWardHistory } from "@/hooks/use-wards";
import { cn } from "@/lib/utils";

// Same 5-band AQI scale used by StatusBadge.tsx elsewhere in the app —
// kept identical here so the chart and the badges never disagree.
const AQI_BANDS = [
  { min: 0, max: 50, label: "Good", color: "#22c55e" },
  { min: 50, max: 100, label: "Moderate", color: "#eab308" },
  { min: 100, max: 200, label: "Unhealthy", color: "#f97316" },
  { min: 200, max: 300, label: "Very Unhealthy", color: "#ef4444" },
  { min: 300, max: 500, label: "Hazardous", color: "#a855f7" },
];

// Minimum pixel width per data point so ticks never overlap or clip —
// if the card is narrower than dataLength * this value, the chart becomes
// horizontally scrollable inside its own container instead of squeezing.
const MIN_PX_PER_POINT = 34;

function formatHourLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", hour12: true });
}

interface AqiTrendChartProps {
  wardId: number;
  wardName: string;
  currentAqi?: number;
  hours?: number;
  /** Compact mode gives a shorter, more space-efficient chart */
  compact?: boolean;
  className?: string;
}

export function AqiTrendChart({
  wardId,
  wardName,
  currentAqi,
  hours = 24,
  compact = false,
  className,
}: AqiTrendChartProps) {
  const { data: history, isLoading, isError } = useWardHistory(wardId, hours);

  const chartData = useMemo(() => {
    if (!history) return [];
    return history.map((p) => ({
      time: p.timestamp,
      label: formatHourLabel(p.timestamp),
      aqi: p.aqi,
    }));
  }, [history]);

  const { trend, delta } = useMemo(() => {
    if (chartData.length < 2) return { trend: "flat" as const, delta: 0 };
    const first = chartData[0].aqi;
    const last = chartData[chartData.length - 1].aqi;
    const d = last - first;
    if (Math.abs(d) < 3) return { trend: "flat" as const, delta: d };
    return { trend: d > 0 ? ("up" as const) : ("down" as const), delta: d };
  }, [chartData]);

  const maxAqi = chartData.length
    ? Math.max(...chartData.map((d) => d.aqi), currentAqi ?? 0)
    : (currentAqi ?? 500);
  const yMax = Math.min(500, Math.ceil((maxAqi + 30) / 50) * 50);

  const latestPoint = chartData[chartData.length - 1];

  const chartConfig: ChartConfig = {
    aqi: {
      label: "AQI",
      color: "hsl(var(--primary))",
    },
  };

  // Fixed minimum width so points never overlap — the outer wrapper scrolls
  // horizontally if this exceeds the card's actual width.
  const chartMinWidth = Math.max(chartData.length * MIN_PX_PER_POINT, 320);
  const heightClass = compact ? "h-36" : "h-48";

  return (
    <Card className={cn("border-border shadow-sm", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <LineChartIcon className="w-4 h-4 text-primary" />
              AQI Trend — {wardName}
            </CardTitle>
            <CardDescription className="text-xs">
              Last {hours} hours{isLoading ? " · loading…" : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {typeof currentAqi === "number" && (
              <StatusBadge aqi={currentAqi} size="sm" />
            )}
            {!isLoading && chartData.length >= 2 && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 border",
                  trend === "up" && "text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900",
                  trend === "down" && "text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-900",
                  trend === "flat" && "text-muted-foreground border-border bg-muted/50"
                )}
              >
                {trend === "up" && <TrendingUp className="w-3 h-3" />}
                {trend === "down" && <TrendingDown className="w-3 h-3" />}
                {trend === "flat" && <Minus className="w-3 h-3" />}
                {delta > 0 ? "+" : ""}
                {delta} pts
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {isLoading ? (
          <div className={cn("w-full animate-pulse rounded-md bg-muted/50", heightClass)} />
        ) : isError ? (
          <div className={cn("w-full flex items-center justify-center rounded-md bg-muted/30 text-sm text-muted-foreground", heightClass)}>
            Couldn't load trend data for this ward.
          </div>
        ) : chartData.length === 0 ? (
          <div className={cn("w-full flex items-center justify-center rounded-md bg-muted/30 text-sm text-muted-foreground text-center px-4", heightClass)}>
            Not enough historical data yet — check back after the next few refresh cycles.
          </div>
        ) : (
          <>
            {/* Scrolls horizontally within the card if the chart needs more
                room than the card is wide — keeps the card itself small
                while still letting every hour be reachable and readable. */}
            <div className="w-full overflow-x-auto overflow-y-hidden -mx-1 px-1">
              <div style={{ minWidth: chartMinWidth }} className={heightClass}>
                <ChartContainer config={chartConfig} className="w-full h-full aspect-auto">
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`aqiFill-${wardId}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>

                    {/* Severity bands behind the line, using the same thresholds as StatusBadge */}
                    {AQI_BANDS.map((band) => (
                      <ReferenceArea
                        key={band.label}
                        y1={band.min}
                        y2={Math.min(band.max, yMax)}
                        fill={band.color}
                        fillOpacity={0.06}
                        ifOverflow="hidden"
                      />
                    ))}

                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      fontSize={10}
                    />
                    <YAxis
                      domain={[0, yMax]}
                      tickLine={false}
                      axisLine={false}
                      width={38}
                      fontSize={10}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                          formatter={(value) => [`${value} AQI`, ""]}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="aqi"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill={`url(#aqiFill-${wardId})`}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                    {latestPoint && (
                      <ReferenceDot
                        x={latestPoint.label}
                        y={latestPoint.aqi}
                        r={4}
                        fill="hsl(var(--primary))"
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                      />
                    )}
                  </AreaChart>
                </ChartContainer>
              </div>
            </div>

            {/* Severity legend */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 border-t border-border/50">
              {AQI_BANDS.map((band) => (
                <div key={band.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: band.color }}
                  />
                  {band.label}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}