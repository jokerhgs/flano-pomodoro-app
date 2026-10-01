import {
  BarChart3,
  Calendar,
  ChevronsLeft,
  ChevronsRight,
  FolderKanban,
  Settings,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { useTimer } from "../stores/timer";
import { fmtClock } from "../lib/time";

export type Tab = "timer" | "projects" | "calendar" | "stats" | "settings";

const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "timer", label: "Timer", icon: Timer },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  tab,
  onNavigate,
  collapsed,
  onToggleCollapse,
}: {
  tab: Tab;
  onNavigate: (t: Tab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const status = useTimer((s) => s.status);
  const kind = useTimer((s) => s.kind);
  const remainingSec = useTimer((s) => s.remainingSec);

  const kindLabel = kind === "work" ? "Work" : kind === "short_break" ? "Short break" : "Long break";

  return (
    <aside
      className={`relative flex h-screen shrink-0 flex-col border-r border-border bg-card transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <button
        onClick={onToggleCollapse}
        className="absolute right-0 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
      </button>
      <div className={`flex items-center pt-6 ${collapsed ? "justify-center px-2 pb-5" : "gap-2.5 px-5 pb-5"}`}>
        <img
          src="/logo.jpg"
          alt="Flano Logo"
          className="h-9 w-9 rounded-xl object-cover"
        />
        {!collapsed && (
          <div className="text-base font-bold leading-tight">Flano</div>
        )}
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            title={collapsed ? label : undefined}
            className={`flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors ${
              collapsed ? "justify-center px-2" : "px-3"
            } ${
              tab === id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-auto p-3">
        <div className={`rounded-xl border border-border bg-background ${collapsed ? "p-2" : "p-3"}`}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  status === "running" ? "bg-primary" : status === "paused" ? "bg-amber-500" : "bg-muted-foreground"
                }`}
              />
              <div className="text-sm font-bold tabular-nums">{fmtClock(remainingSec)}</div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{kindLabel}</span>
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    status === "running" ? "bg-primary" : status === "paused" ? "bg-amber-500" : "bg-muted-foreground"
                  }`}
                />
              </div>
              <div className="mt-0.5 text-xl font-bold tabular-nums">{fmtClock(remainingSec)}</div>
              <div className="text-[11px] text-muted-foreground">{status === "idle" ? "Ready" : status}</div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
