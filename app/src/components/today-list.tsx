import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Plus, Repeat, RotateCcw, Trash2 } from "lucide-react";
import { useTasks } from "../stores/tasks";
import { todayKey } from "../lib/time";
import type { TaskInstanceRow, TaskRow, TodayItem } from "../lib/db/schema";

type CompletedEntry =
  | { kind: "task"; completed_at: string | null; task: TaskRow }
  | { kind: "instance"; completed_at: string | null; instance: TaskInstanceRow; task: TaskRow };

export function TodayList() {
  const {
    today,
    suggestedToday,
    completedTasks,
    completedInstances,
    projects,
    addTask,
    setStatus,
    setStatusInstance,
    toggleToday,
    promoteToToday,
    moveToday,
    moveTodayInstance,
    removeTask,
    undoDoneInstance,
  } = useTasks();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [alert, setAlert] = useState<string | null>(null);
  const alertTimer = useRef<number | null>(null);

  const todayStr = todayKey();
  const visibleSuggested = suggestedToday.filter((t) => !dismissedIds.has(t.id));

  useEffect(() => {
    if (!alert) return;
    const timer = window.setTimeout(() => setAlert(null), 4000);
    alertTimer.current = timer;
    return () => window.clearTimeout(timer);
  }, [alert]);

  const completedCount = completedTasks.length + completedInstances.length;
  const completedAll: CompletedEntry[] = [
    ...completedTasks.map((task) => ({ kind: "task" as const, completed_at: task.completed_at, task })),
    ...completedInstances.map((entry) => ({
      kind: "instance" as const,
      completed_at: entry.completed_at,
      instance: entry,
      task: entry.task,
    })),
  ].sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));

  const submit = async () => {
    if (!title.trim()) return;
    await addTask({ title: title.trim(), project_id: projectId, estimated_pomodoros: null, on_today: true, due_date: todayStr });
    setTitle("");
    setProjectId(null);
  };

  const undoDone = async (id: number) => {
    await setStatus(id, "todo");
    await toggleToday(id);
  };

  const forgetId = (id: number) =>
    setDismissedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const handleDemote = async (t: TaskRow) => {
    setDismissedIds((prev) => new Set(prev).add(t.id));
    await toggleToday(t.id);
    setAlert(`Removed "${t.title}" from Today.`);
  };

  const handleDelete = async (t: TaskRow) => {
    forgetId(t.id);
    await removeTask(t.id);
    setAlert(`Deleted "${t.title}".`);
  };

  const handlePromote = async (t: TaskRow) => {
    forgetId(t.id);
    await promoteToToday(t.id);
  };

  const projectName = (id: number | null) =>
    id == null ? "No project" : projects.find((p) => p.id === id)?.name ?? `#${id}`;

  const renderItem = (item: TodayItem) => {
    if (item.kind === "task") {
      const t = item.task;
      return (
        <li key={`task-${t.id}`} className="rounded-xl border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void setStatus(t.id, t.status === "done" ? "doing" : "done")}
              title={t.status === "done" ? "Reopen" : "Complete"}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                t.status === "done" ? "border-emerald-500 bg-emerald-500 text-black" : "border-border text-transparent hover:border-emerald-500"
              }`}
            >
              <Check className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                {t.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {projectName(t.project_id)}
                {t.due_date ? ` • due ${t.due_date}` : ""}
              </div>
            </div>
            <button onClick={() => void moveToday(t.id, -1)} className="rounded p-1 text-muted-foreground hover:text-foreground" title="Move up">
              <ArrowUp className="h-4 w-4" />
            </button>
            <button onClick={() => void moveToday(t.id, 1)} className="rounded p-1 text-muted-foreground hover:text-foreground" title="Move down">
              <ArrowDown className="h-4 w-4" />
            </button>
            <button onClick={() => void handleDelete(t)} className="rounded p-1 text-muted-foreground hover:text-destructive" title="Delete task">
              <Trash2 className="h-4 w-4" />
            </button>
            <button onClick={() => void handleDemote(t)} className="rounded p-1 text-muted-foreground hover:text-foreground" title="Remove from Today">
              ✕
            </button>
          </div>
        </li>
      );
    }

    const inst = item.instance;
    const parent = item.task;
    return (
      <li key={`inst-${inst.id}`} className="rounded-xl border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => void setStatusInstance(inst.id, inst.status === "done" ? "todo" : "done")}
            title={inst.status === "done" ? "Reopen" : "Complete"}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
              inst.status === "done" ? "border-emerald-500 bg-emerald-500 text-black" : "border-border text-transparent hover:border-emerald-500"
            }`}
          >
            <Check className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-1.5 truncate text-sm font-medium ${inst.status === "done" ? "line-through text-muted-foreground" : ""}`}>
              <Repeat className="h-3 w-3 shrink-0 text-primary" />
              {parent.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {projectName(parent.project_id)}
              {inst.date !== todayStr ? ` • overdue ${inst.date}` : ""}
            </div>
          </div>
          <button onClick={() => void moveTodayInstance(inst.id, -1)} className="rounded p-1 text-muted-foreground hover:text-foreground" title="Move up">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button onClick={() => void moveTodayInstance(inst.id, 1)} className="rounded p-1 text-muted-foreground hover:text-foreground" title="Move down">
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </li>
    );
  };

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card p-4 sm:p-5 h-full min-h-[520px] lg:max-h-[calc(100vh-8.5rem)]">
      <div>
        <h2 className="text-lg font-semibold">
          Today{"'"}s Tasks ({today.length}){completedCount > 0 ? ` • Done (${completedCount})` : ""}
        </h2>
        <p className="text-xs text-muted-foreground">Your committed work queue for today.</p>
      </div>

      {alert && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs sm:text-sm text-emerald-200">
          <span>{alert}</span>
          <button onClick={() => setAlert(null)} className="shrink-0 font-medium underline hover:text-emerald-100">
            dismiss
          </button>
        </div>
      )}

      <div className="mt-3">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder="New task…"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <select
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void submit()}
            className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 space-y-3 flano-scroll">
        {visibleSuggested.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 space-y-2">
            <div className="text-xs font-semibold text-amber-400">
              {visibleSuggested.length} task{visibleSuggested.length > 1 ? "s" : ""} due today — not yet in your queue
            </div>
            <ul className="space-y-1.5">
              {visibleSuggested.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-xs font-medium text-foreground">{t.title}</span>
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{projectName(t.project_id)}</span>
                  </div>
                  <button
                    onClick={() => void handlePromote(t)}
                    className="shrink-0 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  >
                    Do Today
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="space-y-2">
          {today.length === 0 && completedCount === 0 && (
            <li className="text-sm text-muted-foreground">Nothing queued. Add or promote a task.</li>
          )}
          {today.length === 0 && completedCount > 0 && (
            <li className="text-sm text-muted-foreground">All done for today 🎉 Add more or undo below.</li>
          )}
          {today.map((item) => renderItem(item))}
        </ul>
      </div>

      <div className="mt-2 shrink-0 border-t border-border/60 pt-2">
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          aria-expanded={showCompleted}
          className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <span>Completed Today ({completedCount})</span>
          {showCompleted ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showCompleted && (
          <div className="mt-1 max-h-[140px] overflow-y-auto pr-1 flano-scroll">
            {completedCount === 0 ? (
              <p className="px-1 py-1 text-xs text-muted-foreground/70">Nothing finished yet — complete a task to see it here.</p>
            ) : (
              <ul className="space-y-1.5">
                {completedAll.map((entry) =>
                  entry.kind === "task" ? (
                    <li
                      key={`done-task-${entry.task.id}`}
                      className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/50 p-2.5 text-xs"
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500 flex-shrink-0">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-muted-foreground line-through font-medium">{entry.task.title}</div>
                        <div className="text-[11px] text-muted-foreground/70">{projectName(entry.task.project_id)}</div>
                      </div>
                      <button
                        onClick={() => void undoDone(entry.task.id)}
                        className="flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                        title="Undo & reopen task"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Undo
                      </button>
                    </li>
                  ) : (
                    <li
                      key={`done-inst-${entry.instance.id}`}
                      className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/50 p-2.5 text-xs"
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500 flex-shrink-0">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate text-muted-foreground line-through font-medium">
                          <Repeat className="h-3 w-3 shrink-0 text-primary" />
                          {entry.task.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground/70">{projectName(entry.task.project_id)}</div>
                      </div>
                      <button
                        onClick={() => void undoDoneInstance(entry.instance.id)}
                        className="flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                        title="Undo & reopen task"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Undo
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
