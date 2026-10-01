import { useEffect, useState } from "react";
import "./app.css";
import { Plus } from "lucide-react";
import { migrate } from "./lib/db/migrations";
import { useTimer } from "./stores/timer";
import { useTasks } from "./stores/tasks";
import { useSettings } from "./stores/settings";
import { useUI } from "./stores/ui";
import { onTraySkip, onTrayToggle, reregisterShortcut, unregisterAll, isTauri } from "./lib/os";
import { isDemoMode } from "./lib/demo";
import { playShortcutClick } from "./lib/sound";
import { useTimerTicker } from "./hooks/use-timer-ticker";
import { Sidebar, type Tab } from "./components/sidebar";
import { PageHeader } from "./components/page-header";
import { TimerCard } from "./components/timer-card";
import { TodayList } from "./components/today-list";
import { Projects } from "./components/projects";
import { CalendarView } from "./components/calendar-view";
import { StatsPanel } from "./components/stats-panel";
import { SettingsPanel } from "./components/settings-panel";

const HEADERS: Record<Tab, { title: string; description: string }> = {
  timer: {
    title: "Focus",
    description: "Work in focused pomodoros, then recharge with short and long breaks.",
  },
  projects: {
    title: "Projects",
    description: "Long-term backlog and goals. Mark tasks with Do Today when ready.",
  },
  calendar: {
    title: "Calendar",
    description: "See your tasks by due date. Click any day to view and promote tasks.",
  },
  stats: {
    title: "Stats",
    description: "Hours & minutes worked over time, daily comparisons, and project breakdowns.",
  },
  settings: {
    title: "Settings",
    description: "Session durations, sound cues, global shortcut, and local SQLite backup.",
  },
};


function App() {
  const [tab, setTab] = useState<Tab>("timer");
  const [bootError, setBootError] = useState("");
  const [ready, setReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const demo = isDemoMode();
  useTimerTicker();

  useEffect(() => {
    let cancelled = false;
    const cleans: (() => void)[] = [];
    const shortcutSound = () => {
      try {
        const { shortcut_sound, volume } = useSettings.getState().values;
        if (shortcut_sound === "1") playShortcutClick(Number(volume ?? 0.7));
      } catch {
        // sound is best-effort
      }
    };
    (async () => {
      try {
        if (demo) {
          // Browser preview: in-memory state, no SQLite/Tauri APIs.
          await Promise.all([
            useTimer.getState().hydrate(),
            useTasks.getState().load(),
            useSettings.getState().load(),
          ]);
        } else {
          await migrate();
          await Promise.all([
            useTimer.getState().hydrate(),
            useTasks.getState().load(),
            useSettings.getState().load(),
          ]);
          const shortcut = useSettings.getState().values.global_shortcut;
          if (shortcut) {
            const ok = await reregisterShortcut(shortcut).catch(() => false);
            if (!ok) console.warn(`[flano] timer global shortcut not registered: ${shortcut}`);
          }
          const toggle = () => void useTimer.getState().toggle();
          const skip = () => void useTimer.getState().skip();
          const toggleViaShortcut = () => {
            shortcutSound();
            toggle();
          };
          const sub = async (fn: () => Promise<() => void>, label: string) => {
            try {
              cleans.push(await fn());
            } catch {
              console.warn(`[flano] listener not attached: ${label}`);
            }
          };
          await sub(() => onTrayToggle(toggle), "flano:tray-toggle");
          await sub(() => onTraySkip(skip), "flano:tray-skip");
          const onShortcut = () => toggleViaShortcut();
          window.addEventListener("flano:shortcut-toggle", onShortcut);
          cleans.push(() => window.removeEventListener("flano:shortcut-toggle", onShortcut));
        }
      } catch (e) {
        if (!cancelled) {
          const detail = e instanceof Error ? e.message : String(e);
          setBootError(
            isTauri() ? `Local database failed to open: ${detail}` : `Desktop runtime unavailable: ${detail}`,
          );
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      if (!demo) unregisterAll().catch(() => {});
      cleans.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore
        }
      });
    };
  }, [demo]);

  const header = HEADERS[tab];
  const setProjectModalOpen = useUI((s) => s.setProjectModalOpen);
  const setTaskModalOpen = useUI((s) => s.setTaskModalOpen);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar tab={tab} onNavigate={setTab} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <main className={`h-screen min-w-0 flex-1 flano-scroll ${tab === "projects" ? "overflow-hidden" : "overflow-y-auto"}`}>
        <div className={`mx-auto max-w-6xl px-5 py-5 ${tab === "projects" ? "flex h-full flex-col gap-4" : "space-y-4"}`}>
          {demo && (
            <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary">
              Demo preview — empty in-memory state, nothing is saved. Run{" "}
              <code>pnpm tauri dev</code> for the real desktop app.
            </div>
          )}
          {!ready && <p className="text-sm text-muted-foreground">Loading…</p>}
          {bootError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
              {bootError}
            </div>
          )}
          <PageHeader
            title={header.title}
            description={header.description}
            actions={
              tab === "projects" ? (
                <>
                  <button
                    onClick={() => setProjectModalOpen(true)}
                    className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" /> New Project
                  </button>
                  <button
                    onClick={() => setTaskModalOpen(true)}
                    className="flex items-center gap-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Plus className="h-4 w-4" /> New Task
                  </button>
                </>
              ) : undefined
            }
          />
          {tab === "timer" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-stretch lg:items-start">
              <div className="h-full">
                <TimerCard />
              </div>
              <div className="h-full min-w-0">
                <TodayList />
              </div>
            </div>
          )}
          {tab === "projects" && <Projects />}
          {tab === "calendar" && <CalendarView />}
          {tab === "stats" && <StatsPanel ready={ready} />}

          {tab === "settings" && <SettingsPanel />}
        </div>
      </main>
    </div>
  );
}

export default App;
