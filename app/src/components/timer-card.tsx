import { useEffect, useState } from "react";
import { Flame, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useTimer } from "../stores/timer";
import { fmtClock, fmtHoursMin, todayKey } from "../lib/time";
import { getDailyWorkStats, getWorkStats } from "../lib/db/repo/sessions";
import { isDemoMode } from "../lib/demo";

export function TimerCard() {
  const t = useTimer();
  const [todayWorkMin, setTodayWorkMin] = useState<number>(0);
  const [todayCycles, setTodayCycles] = useState<number>(0);
  const [yesterdayWorkMin, setYesterdayWorkMin] = useState<number>(0);

  const running = t.status === "running";
  const paused = t.status === "paused";

  const totalSec = t.kind === "work" ? t.workMin * 60 : t.breakMin * 60;
  const progressRatio = Math.max(0, Math.min(1, 1 - t.remainingSec / Math.max(1, totalSec)));

  // SVG circle calculations - enlarged
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressRatio);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (isDemoMode()) {
        setTodayWorkMin(0);
        setTodayCycles(0);
        setYesterdayWorkMin(0);
        return;
      }
      const [stats, daily] = await Promise.all([
        getWorkStats(1).catch(() => ({ todayWorkMin: 0, todayCycles: 0 })),
        getDailyWorkStats(2).catch(() => []),
      ]);
      if (!alive) return;
      setTodayWorkMin(stats.todayWorkMin);
      setTodayCycles(stats.todayCycles);
      const yesterday = todayKey(new Date(Date.now() - 86400000));
      setYesterdayWorkMin(daily.find((d) => d.day === yesterday)?.workMin ?? 0);
    })();
    return () => {
      alive = false;
    };
  }, [t.streak, t.workMin]);

  useEffect(() => {
    if (isDemoMode()) return;
    const interval = setInterval(() => void useTimer.getState().refreshStreak(), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Calculate elapsed work minutes in the current active/paused session
  const activeWorkMin =
    t.kind === "work" && t.status !== "idle"
      ? Math.max(0, Math.floor((t.workMin * 60 - t.remainingSec) / 60))
      : 0;

  const totalWorkingTodayMin = todayWorkMin + activeWorkMin;

  const targetHours = t.targetWorkHours || 4;
  const targetMin = targetHours * 60;
  const targetPercent = Math.min(100, Math.round((totalWorkingTodayMin / Math.max(1, targetMin)) * 100));

  const isBreak = t.kind === "break" || t.kind.includes("break");

  return (
    <section className="h-full min-h-[520px] flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div>
        {/* Header with 1 Cycle = Xm indicator on top right */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Timer className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Pomodoro</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-medium text-primary">
              1 cycle = {t.workMin}m
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-foreground" title={t.streakAtRisk && t.streak > 0 ? `At risk — ${fmtHoursMin(t.streakRemainingMin)} left today to keep the streak` : undefined}>
              <Flame className={`h-3.5 w-3.5 ${t.streak > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
              Streak: {t.streak}{t.streakAtRisk && t.streak > 0 ? " • at risk" : ""}
            </span>
          </div>
        </div>

        {/* Larger Circular Progress & Clock */}
        <div className="relative my-6 sm:my-8 flex items-center justify-center">
          <svg className="h-60 w-60 sm:h-72 sm:w-72 -rotate-90 transform" viewBox="0 0 200 200">
            {/* Background Track */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              className="stroke-muted/60"
              strokeWidth="12"
              fill="transparent"
            />
            {/* Animated Progress Ring */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              className="stroke-primary transition-all duration-500 ease-linear"
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>

          {/* Clock Text Centered */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-5xl sm:text-6xl font-extrabold tabular-nums tracking-tight text-foreground">
              {fmtClock(t.remainingSec)}
            </div>
            <div className="mt-1.5 text-xs sm:text-sm font-medium text-muted-foreground">
              {isBreak ? "Break" : "Focus"}
              {paused ? " • paused" : running ? " • running" : ""}
            </div>
            {t.taskTitle && (
              <div className="mt-1.5 max-w-[180px] truncate text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5">
                {t.taskTitle}
              </div>
            )}
          </div>
        </div>

        {t.notice && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs sm:text-sm text-amber-200 flex justify-between items-center gap-2">
            <span>{t.notice}</span>
            <button onClick={t.dismissNotice} className="underline font-medium hover:text-amber-100">dismiss</button>
          </div>
        )}
      </div>

      {/* Bottom Area: Total Working metrics placed directly above action buttons */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="text-xs text-muted-foreground">Cycles today</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{todayCycles}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{fmtHoursMin(totalWorkingTodayMin)} worked</div>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="text-xs text-muted-foreground">Yesterday</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{fmtHoursMin(yesterdayWorkMin)}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">total work</div>
          </div>
        </div>
        {/* Working & Target Metrics */}
        <div className="rounded-xl border border-border bg-background p-3.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Total working today: <strong className="text-foreground">{fmtHoursMin(totalWorkingTodayMin)}</strong>
            </span>
            <span>
              Target: <strong className="text-foreground">{targetHours}h</strong> ({targetMin}m)
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${targetPercent}%` }}
            />
          </div>
        </div>

        {/* Start / Action Buttons */}
        <div className="flex gap-2">
          {t.status === "idle" ? (
            <button
              onClick={() => void t.start()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity shadow-xs"
            >
              <Play className="h-4 w-4" /> Start {isBreak ? "Break" : "Focus"}
            </button>
          ) : running ? (
            <button
              onClick={() => void t.pause()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black hover:bg-amber-400 transition-colors shadow-xs"
            >
              <Pause className="h-4 w-4" /> Pause
            </button>
          ) : (
            <button
              onClick={() => void t.resume()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black hover:bg-emerald-400 transition-colors shadow-xs"
            >
              <Play className="h-4 w-4" /> Resume
            </button>
          )}

          {isBreak && (
            <button
              onClick={() => void t.skipBreak()}
              className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Skip Break
            </button>
          )}
          {(t.status !== "idle" || t.kind !== "work") && (
            <button
              onClick={() => void t.reset()}
              className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
