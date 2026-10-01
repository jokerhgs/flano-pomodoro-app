import { Repeat, X } from "lucide-react";
import { useTasks } from "../stores/tasks";
import { fmtDayLabel, todayKey } from "../lib/time";
import { parseRecurrence } from "../lib/db/schema";
import type { ProjectRow, TaskRow } from "../lib/db/schema";

export function CalendarDayPanel({
  date,
  tasks,
  projects,
  onClose,
}: {
  date: string;
  tasks: TaskRow[];
  projects: ProjectRow[];
  onClose: () => void;
}) {
  const { promoteToToday, toggleToday } = useTasks();
  const { fullDate } = fmtDayLabel(date);
  const isToday = date === todayKey();

  const findProject = (id: number | null) => (id == null ? null : projects.find((p) => p.id === id));

  const handleToggle = async (t: TaskRow) => {
    if (t.on_today === 1) {
      await toggleToday(t.id);
    } else {
      await promoteToToday(t.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40 animate-[fade-in_200ms_ease-out]" onClick={onClose}>
      <div
        className="h-full w-96 border-l border-border bg-card p-5 overflow-y-auto flano-scroll animate-[slide-in-right_250ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{fullDate}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks scheduled this day.</p>
          ) : (
            tasks.map((t) => {
              const proj = findProject(t.project_id);
              const rule = parseRecurrence(t.recurrence);
              const isRecurring = rule !== null;
              return (
                <div key={t.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-start gap-2">
                    {proj && (
                      <span
                        className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: proj.color ?? "#666" }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className={`flex items-center gap-1.5 text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                        {isRecurring && <Repeat className="h-3 w-3 shrink-0 text-primary" />}
                        <span className="truncate">{t.title}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {proj ? proj.name : "No project"}
                      </div>
                    </div>
                    {!isRecurring && isToday && (
                      <button
                        onClick={() => void handleToggle(t)}
                        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          t.on_today === 1
                            ? "border border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
                            : "border border-emerald-500/50 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                        }`}
                      >
                        {t.on_today === 1 ? "Remove from Today" : "Do Today"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
