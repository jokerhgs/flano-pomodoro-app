import { useEffect, useState, useMemo } from "react";
import {
  getDailyWorkStats,
  getLastCompletedSession,
  getWorkStats,
  type DailyWorkStat,
} from "../lib/db/repo/sessions";
import { isDemoMode } from "../lib/demo";
import {
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  Calendar,
  Zap,
} from "lucide-react";
import { useTimer } from "../stores/timer";
import { fmtHoursMin, fmtDayLabel, todayKey } from "../lib/time";

export function StatsPanel({ ready = true }: { ready?: boolean }) {
  const t = useTimer();
  const targetWorkHours = t.targetWorkHours || 4;
  const targetWorkMin = targetWorkHours * 60;

  const [rangeDays, setRangeDays] = useState<7 | 14>(7);
  const [dailyStats, setDailyStats] = useState<DailyWorkStat[]>([]);
  const [cyclesDone, setCyclesDone] = useState<number>(0);
  const [periodCycles, setPeriodCycles] = useState<number>(0);
  const [todayCycles, setTodayCycles] = useState<number>(0);
  const [todayWorkMin, setTodayWorkMin] = useState<number>(0);
  const [lastSessionMin, setLastSessionMin] = useState<number | null>(null);
  const [lastSessionKind, setLastSessionKind] = useState<string>("work");
  const [hoveredDay, setHoveredDay] = useState<DailyWorkStat | null>(null);

  useEffect(() => {
    let alive = true;

    const fetchStats = async () => {
      if (!alive) return;
      if (!ready) {
        return;
      }
      if (isDemoMode()) {
        setDailyStats([]);
        setCyclesDone(0);
        setPeriodCycles(0);
        setTodayCycles(t.streak);
        setTodayWorkMin(0);
        setLastSessionMin(null);
        setLastSessionKind("work");
        return;
      }

      const [daily, summary, last] = await Promise.all([
        getDailyWorkStats(rangeDays * 2).catch(() => []),
        getWorkStats(rangeDays).catch(() => ({ todayCycles: 0, totalCycles: 0, todayWorkMin: 0, periodCycles: 0 })),
        getLastCompletedSession().catch(() => null),
      ]);

      if (!alive) return;
      setDailyStats(daily);
      setCyclesDone(summary.totalCycles);
      setPeriodCycles(summary.periodCycles);
      setTodayCycles(summary.todayCycles);

      const todayStat = daily.find((s) => s.day === todayKey());
      setTodayWorkMin(todayStat ? todayStat.workMin : summary.todayWorkMin);

      if (last) {
        setLastSessionMin(last.durationMin);
        setLastSessionKind(last.kind);
      }
    };

    void fetchStats();
    const interval = setInterval(() => void fetchStats(), 30_000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [rangeDays, ready, t.streak]);

  // Current period vs Previous period stats calculation
  const currentPeriod = useMemo(() => {
    return dailyStats.slice(-rangeDays);
  }, [dailyStats, rangeDays]);

  const previousPeriod = useMemo(() => {
    return dailyStats.slice(-rangeDays * 2, -rangeDays);
  }, [dailyStats, rangeDays]);

  const activeWorkMin =
    t.kind === "work" && t.status !== "idle"
      ? Math.max(0, Math.floor((t.workMin * 60 - t.remainingSec) / 60))
      : 0;

  const todayStr = todayKey();

  const chartPeriod = useMemo(() => {
    return currentPeriod.map((s) =>
      s.day === todayStr ? { ...s, workMin: s.workMin + activeWorkMin } : s,
    );
  }, [currentPeriod, activeWorkMin, todayStr]);

  const totalCurrentWorkMin = useMemo(() => {
    return chartPeriod.reduce((acc, curr) => acc + curr.workMin, 0);
  }, [chartPeriod]);

  const totalPreviousWorkMin = useMemo(() => {
    return previousPeriod.reduce((acc, curr) => acc + curr.workMin, 0);
  }, [previousPeriod]);

  const avgWorkMin = useMemo(() => {
    return currentPeriod.length > 0 ? Math.round(totalCurrentWorkMin / currentPeriod.length) : 0;
  }, [totalCurrentWorkMin, currentPeriod]);

  const diffWorkMin = totalCurrentWorkMin - totalPreviousWorkMin;
  const pctChange =
    totalPreviousWorkMin > 0
      ? Math.round(((totalCurrentWorkMin - totalPreviousWorkMin) / totalPreviousWorkMin) * 100)
      : totalCurrentWorkMin > 0
      ? 100
      : 0;

  const maxWorkMinInPeriod = useMemo(() => {
    const m = Math.max(...chartPeriod.map((s) => s.workMin), targetWorkMin, 60);
    return Math.ceil(m / 60) * 60; // round up to nearest hour
  }, [chartPeriod, targetWorkMin]);

  const kindLabel =
    lastSessionKind === "work" ? "Work session" : lastSessionKind === "short_break" ? "Short break" : "Long break";

  const todayWorkMinTotal = todayWorkMin + activeWorkMin;

  // Full View (Stats Tab)
  return (
    <div className="space-y-6">
      {/* Range Selector */}
      <div className="flex justify-end">
        <div className="flex items-center rounded-xl border border-border bg-card p-1 text-xs">

          <button
            onClick={() => setRangeDays(7)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              rangeDays === 7
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setRangeDays(14)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              rangeDays === 14
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Last 14 Days
          </button>
        </div>
      </div>

      {/* Hero Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Work Time */}
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Time Worked</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {fmtHoursMin(totalCurrentWorkMin)}
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-xs">
              {diffWorkMin >= 0 ? (
                <span className="flex items-center gap-0.5 font-medium text-emerald-500">
                  <TrendingUp className="h-3.5 w-3.5" />
                  +{fmtHoursMin(diffWorkMin)} ({pctChange}%)
                </span>
              ) : (
                <span className="flex items-center gap-0.5 font-medium text-amber-500">
                  <TrendingDown className="h-3.5 w-3.5" />
                  -{fmtHoursMin(Math.abs(diffWorkMin))} ({pctChange}%)
                </span>
              )}
              <span className="text-muted-foreground truncate">vs prev {rangeDays}d</span>
            </div>
          </div>
        </div>

        {/* Card 2: Daily Average */}
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Daily Average</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
              <Calendar className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {fmtHoursMin(avgWorkMin)}
              <span className="text-xs font-normal text-muted-foreground"> / day</span>
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              Target: {targetWorkHours}h 00m / day ({Math.round((avgWorkMin / targetWorkMin) * 100)}% of goal)
            </div>
          </div>
        </div>

        {/* Card 3: Cycles Completed */}
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">All-Time Cycles</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">{cyclesDone}</div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              {periodCycles} in last {rangeDays}d · {todayCycles} today
            </div>
          </div>
        </div>

        {/* Card 4: Last Session */}
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Last Session</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <Zap className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {lastSessionMin !== null ? `${lastSessionMin}m` : "—"}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground truncate" title={kindLabel}>
              {lastSessionMin !== null ? kindLabel : "No recent sessions"}
            </div>
          </div>
        </div>
      </div>

      {/* Main Screen Time Bar Chart Card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Hours & Minutes Worked
            </h3>
            <p className="text-xs text-muted-foreground">
              Daily work comparison with benchmark average line. Hover over any bar for details.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="text-muted-foreground">Today</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />
              <span className="text-muted-foreground">Past Days</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-t border-dashed border-muted-foreground/60" />
              <span className="text-muted-foreground">Daily Avg</span>
            </div>
          </div>
        </div>

        {/* Hover Info Callout Banner */}
        <div className="min-h-[38px] rounded-xl border border-border/80 bg-background/80 px-4 py-2 flex items-center justify-between text-xs transition-all">
          {hoveredDay ? (
            <>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {fmtDayLabel(hoveredDay.day).fullDate}
                  {hoveredDay.day === todayStr && " (Today)"}:
                </span>
                <span className="font-bold text-primary">{fmtHoursMin(hoveredDay.workMin)}</span>
                <span className="text-muted-foreground">({hoveredDay.cycles} cycles)</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>
                  {Math.round((hoveredDay.workMin / targetWorkMin) * 100)}% of daily target
                </span>
                <span className="font-medium text-foreground">
                  {hoveredDay.workMin >= avgWorkMin ? "+" : "-"}
                  {fmtHoursMin(Math.abs(hoveredDay.workMin - avgWorkMin))} vs avg
                </span>
              </div>
            </>
          ) : (
            <div className="text-muted-foreground flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-primary" /> Hover over a bar to view exact hours, minutes, and goal comparison.
            </div>
          )}
        </div>

        {/* The Bar Chart Canvas */}
        <div className="relative pt-6 pb-2 px-2">
          {/* Average Line */}
          {maxWorkMinInPeriod > 0 && (
            <div
              className="absolute left-0 right-0 border-t-2 border-dashed border-primary/40 pointer-events-none z-10 transition-all"
              style={{
                bottom: `${Math.min(92, Math.max(12, (avgWorkMin / maxWorkMinInPeriod) * 200 + 32))}px`,
              }}
            >
              <span className="absolute -top-3 right-2 bg-card px-1.5 py-0.5 text-[10px] font-mono text-primary font-semibold rounded border border-primary/30">
                Avg: {fmtHoursMin(avgWorkMin)}
              </span>
            </div>
          )}

          {/* Vertical Bars Container */}
          <div className="flex items-end justify-between gap-2 sm:gap-3 h-52">
            {chartPeriod.map((stat) => {
              const { dayName, shortDate } = fmtDayLabel(stat.day);
              const isToday = stat.day === todayStr;
              const isHovered = hoveredDay?.day === stat.day;
              const barHeightPct =
                maxWorkMinInPeriod > 0 ? Math.max(6, (stat.workMin / maxWorkMinInPeriod) * 100) : 6;

              return (
                <div
                  key={stat.day}
                  onMouseEnter={() => setHoveredDay(stat)}
                  onMouseLeave={() => setHoveredDay(null)}
                  className="flex-1 flex flex-col items-center gap-1.5 group cursor-pointer h-full justify-end relative"
                >
                  {/* Hours/Minutes Value Label above bar */}
                  <span
                    className={`text-[11px] font-semibold tracking-tight transition-colors ${
                      isHovered || isToday ? "text-primary font-bold" : "text-muted-foreground/80"
                    }`}
                  >
                    {fmtHoursMin(stat.workMin)}
                  </span>

                  {/* Vertical Bar Element */}
                  <div className="w-full max-w-[36px] flex flex-col justify-end h-full">
                    <div
                      className={`w-full rounded-t-lg transition-all duration-200 ${
                        isToday
                          ? "bg-primary shadow-md shadow-primary/30 ring-2 ring-primary/40"
                          : isHovered
                          ? "bg-primary/90 ring-2 ring-primary/30"
                          : stat.workMin > 0
                          ? "bg-primary/40 group-hover:bg-primary/70"
                          : "bg-muted/30"
                      }`}
                      style={{ height: `${barHeightPct}%` }}
                    />
                  </div>

                  {/* X-Axis Day & Date Labels */}
                  <div className="flex flex-col items-center text-center mt-1">
                    <span
                      className={`text-xs font-semibold ${
                        isToday ? "text-primary font-bold" : "text-foreground"
                      }`}
                    >
                      {dayName}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{shortDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Target Progress Section */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-500" /> Daily Target Comparison
              </h3>
              <p className="text-xs text-muted-foreground">
                Today's work time vs configured target goal ({targetWorkHours} hours).
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-foreground">{fmtHoursMin(todayWorkMinTotal)}</div>
              <div className="text-xs text-muted-foreground">of {targetWorkHours}h 00m goal</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span>Goal Progress</span>
              <span>{Math.min(100, Math.round((todayWorkMinTotal / targetWorkMin) * 100))}%</span>
            </div>
            <div className="h-3.5 w-full rounded-full bg-muted/60 overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, (todayWorkMinTotal / targetWorkMin) * 100)}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-3.5 text-xs text-muted-foreground space-y-1.5">
            <div className="flex items-center justify-between text-foreground font-medium">
              <span>Remaining for today:</span>
              <span>
                {todayWorkMinTotal >= targetWorkMin
                  ? "🎉 Daily target completed!"
                  : `${fmtHoursMin(targetWorkMin - todayWorkMinTotal)} left`}
              </span>
            </div>
            <p className="text-[11px]">
              {todayWorkMinTotal >= targetWorkMin
                ? "Great job! You have reached your target work hours for today."
                : `Complete ${Math.ceil((targetWorkMin - todayWorkMinTotal) / t.workMin)} more ${t.workMin}-minute pomodoro ${
                    Math.ceil((targetWorkMin - todayWorkMinTotal) / t.workMin) === 1 ? "session" : "sessions"
                  } to reach your daily goal.`}
            </p>
        </div>
      </div>
    </div>
  );
}
