import { useEffect, useMemo, useState } from "react";
import { Edit2, StickyNote, Repeat, Trash2, X } from "lucide-react";
import { useTasks } from "../stores/tasks";
import { useUI } from "../stores/ui";
import type { ProjectRow, RecurrenceRule, Weekday } from "../lib/db/schema";
import { parseRecurrence, recurrenceLabel } from "../lib/db/schema";
import { todayKey } from "../lib/time";
import { ProjectIcon, PROJECT_ICON_NAMES } from "./project-icon";
import { ProjectNotesPanel } from "./project-notes-panel";

const COLORS = [
  "#1f8a9e",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];
const ALL_DAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

type RecurrenceKind = "none" | "daily" | "weekly" | "every_n_days";

export function Projects() {
  const {
    projects,
    all,
    selectedProjectId,
    setProjectFilter,
    addProject,
    editProject,
    removeProject,
    addTask,
    editTask,
    toggleToday,
    promoteToToday,
    removeTask,
  } = useTasks();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState("Folder");
  const projectModalOpen = useUI((s) => s.projectModalOpen);
  const setProjectModalOpen = useUI((s) => s.setProjectModalOpen);
  const notesPanelProjectId = useUI((s) => s.notesPanelProjectId);
  const setNotesPanelProjectId = useUI((s) => s.setNotesPanelProjectId);

  const [title, setTitle] = useState("");
  const [due, setDue] = useState(todayKey());
  const taskModalOpen = useUI((s) => s.taskModalOpen);
  const setTaskModalOpen = useUI((s) => s.setTaskModalOpen);
  const [recKind, setRecKind] = useState<RecurrenceKind>("none");
  const [recDays, setRecDays] = useState<Weekday[]>(["mon", "wed", "fri"]);
  const [recInterval, setRecInterval] = useState(2);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editRecKind, setEditRecKind] = useState<RecurrenceKind>("none");
  const [editRecDays, setEditRecDays] = useState<Weekday[]>([]);
  const [editRecInterval, setEditRecInterval] = useState(2);

  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  const [editProjName, setEditProjName] = useState("");
  const [editProjColor, setEditProjColor] = useState("");
  const [editProjIcon, setEditProjIcon] = useState("");
  const [editProjDescription, setEditProjDescription] = useState("");

  const activeProject = useMemo(
    () => (selectedProjectId === "all" ? null : projects.find((p) => p.id === selectedProjectId) ?? null),
    [projects, selectedProjectId],
  );

  const filtered = useMemo(() => {
    if (selectedProjectId === "all") return all.filter((t) => t.status !== "done" && t.status !== "archived");
    return all.filter((t) => t.project_id === selectedProjectId);
  }, [all, selectedProjectId]);

  const findProject = (id: number | null) => (id == null ? null : projects.find((p) => p.id === id));

  const buildRecurrence = (kind: RecurrenceKind, days: Weekday[], interval: number): RecurrenceRule | null => {
    switch (kind) {
      case "daily":
        return { kind: "daily" };
      case "weekly":
        return days.length > 0 ? { kind: "weekly", days } : null;
      case "every_n_days":
        return { kind: "every_n_days", interval: Math.max(1, interval) };
      default:
        return null;
    }
  };

  const confirmDelete = async () => {
    if (confirmDeleteId == null) return;
    await removeProject(confirmDeleteId);
    setConfirmDeleteId(null);
  };

  const submitProject = async () => {
    if (!name.trim()) return;
    await addProject(name.trim(), color, icon, description.trim() || null);
    setName("");
    setDescription("");
    setColor(COLORS[(projects.length + 1) % COLORS.length]);
    setIcon("Folder");
    setProjectModalOpen(false);
  };

  const openEditProject = (proj: ProjectRow) => {
    setEditingProject(proj);
    setEditProjName(proj.name);
    setEditProjColor(proj.color ?? COLORS[0]);
    setEditProjIcon(proj.icon ?? "Folder");
    setEditProjDescription(proj.description ?? "");
  };

  const saveProjectEdit = async () => {
    if (!editingProject || !editProjName.trim()) return;
    await editProject(editingProject.id, {
      name: editProjName.trim(),
      color: editProjColor,
      icon: editProjIcon,
      description: editProjDescription.trim() || null,
    });
    setEditingProject(null);
  };

  useEffect(() => {
    if (taskModalOpen) {
      setTitle("");
      setDue(todayKey());
      setRecKind("none");
      setRecDays(["mon", "wed", "fri"]);
      setRecInterval(2);
    }
  }, [taskModalOpen]);

  const submitTask = async () => {
    if (!title.trim()) return;
    const pid = selectedProjectId === "all" ? null : selectedProjectId;
    await addTask({
      title: title.trim(),
      project_id: pid,
      due_date: due.trim() === "" ? null : due.trim(),
      estimated_pomodoros: null,
      on_today: false,
      recurrence: buildRecurrence(recKind, recDays, recInterval),
    });
    setTitle("");
    setDue(todayKey());
    setRecKind("none");
    setTaskModalOpen(false);
  };

  const startEditTask = (task: (typeof filtered)[number]) => {
    setEditingTaskId(task.id);
    const rule = parseRecurrence(task.recurrence);
    if (!rule) {
      setEditRecKind("none");
      setEditRecDays([]);
      setEditRecInterval(2);
    } else if (rule.kind === "daily") {
      setEditRecKind("daily");
      setEditRecDays([]);
      setEditRecInterval(2);
    } else if (rule.kind === "weekly") {
      setEditRecKind("weekly");
      setEditRecDays(rule.days);
      setEditRecInterval(2);
    } else {
      setEditRecKind("every_n_days");
      setEditRecDays([]);
      setEditRecInterval(rule.interval);
    }
  };

  const saveTaskEdit = async () => {
    if (editingTaskId == null) return;
    await editTask(editingTaskId, { recurrence: buildRecurrence(editRecKind, editRecDays, editRecInterval) });
    setEditingTaskId(null);
  };

  const notesPanelProject =
    notesPanelProjectId == null ? null : (projects.find((p) => p.id === notesPanelProjectId) ?? null);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4 flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Project Selector Pills */}
      <div className="flex flex-wrap gap-2 shrink-0">
        <button
          onClick={() => setProjectFilter("all")}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            selectedProjectId === "all" ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All Projects
        </button>
        {projects.map((p) => (
          <span
            key={p.id}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedProjectId === p.id ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-foreground hover:bg-muted/50"
            }`}
          >
            <button onClick={() => setProjectFilter(p.id)} className="flex items-center gap-1.5">
              <span className="flex items-center justify-center text-current" style={{ color: p.color ?? undefined }}>
                <ProjectIcon icon={p.icon} className="h-3.5 w-3.5" />
              </span>
              {p.name}
            </button>
            <button onClick={() => openEditProject(p)} className="text-muted-foreground hover:text-primary" title="Edit project">
              <Edit2 className="h-3 w-3" />
            </button>
            <button onClick={() => setConfirmDeleteId(p.id)} className="text-muted-foreground hover:text-destructive" title="Delete project">
              ✕
            </button>
          </span>
        ))}
      </div>

      {/* Active Project Detail Card */}
      {activeProject && (
        <div className="rounded-xl border border-border bg-background p-3.5 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 text-white"
                style={{ background: activeProject.color ?? "#1f8a9e" }}
              >
                <ProjectIcon icon={activeProject.icon} className="h-4 w-4" />
              </span>
              <h3 className="text-base font-semibold text-foreground">{activeProject.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNotesPanelProjectId(activeProject.id)}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <StickyNote className="h-3.5 w-3.5" /> Notes
              </button>
              <button
                onClick={() => openEditProject(activeProject)}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Edit2 className="h-3.5 w-3.5" /> Edit Details
              </button>
            </div>
          </div>
          {activeProject.description && (
            <p className="text-xs text-muted-foreground leading-relaxed pl-9">{activeProject.description}</p>
          )}
        </div>
      )}

      {/* Task List */}
      <ul className="space-y-2 min-h-0 flex-1 overflow-y-auto flano-scroll pr-1">
        {filtered.length === 0 && <li className="text-sm text-muted-foreground">No tasks here yet.</li>}
        {filtered.map((t) => {
          const rule = parseRecurrence(t.recurrence);
          const isEditing = editingTaskId === t.id;
          return (
            <li key={t.id} className="flex items-center gap-2 rounded-xl border border-border bg-background p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate font-medium">
                  {rule && <Repeat className="h-3 w-3 shrink-0 text-primary" />}
                  {t.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const proj = findProject(t.project_id);
                    return proj ? (
                      <span className="inline-flex items-center gap-1 mr-1">
                        <ProjectIcon icon={proj.icon} className="h-3 w-3" style={{ color: proj.color ?? undefined }} />
                        {proj.name} •{" "}
                      </span>
                    ) : null;
                  })()}
                  {t.due_date ? `due ${t.due_date} • ` : ""}
                  {rule ? recurrenceLabel(rule) : t.status}
                </div>
                {isEditing && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
                    <span className="text-xs text-muted-foreground">Repeat:</span>
                    {(["none", "daily", "weekly", "every_n_days"] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setEditRecKind(k)}
                        className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                          editRecKind === k
                            ? "bg-primary/15 text-primary border border-primary/50"
                            : "border border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {k === "none" ? "Off" : k === "daily" ? "Daily" : k === "weekly" ? "Weekly" : "Every N days"}
                      </button>
                    ))}
                    {editRecKind === "weekly" && (
                      <div className="flex gap-1">
                        {ALL_DAYS.map((d) => (
                          <button
                            key={d}
                            onClick={() => setEditRecDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))}
                            className={`h-6 w-6 rounded text-[10px] font-medium transition-colors ${
                              editRecDays.includes(d) ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {d.charAt(0).toUpperCase()}
                          </button>
                        ))}
                      </div>
                    )}
                    {editRecKind === "every_n_days" && (
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={editRecInterval}
                        onChange={(e) => setEditRecInterval(Number(e.target.value) || 2)}
                        className="h-6 w-14 rounded border border-border bg-card px-1 text-xs text-center"
                      />
                    )}
                    <button onClick={() => void saveTaskEdit()} className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90">
                      Save
                    </button>
                    <button onClick={() => setEditingTaskId(null)} className="rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              {!rule && (
                <button
                  onClick={() => void (t.on_today === 1 ? toggleToday(t.id) : promoteToToday(t.id))}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    t.on_today === 1
                      ? "border border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
                      : "border border-emerald-500/50 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                  }`}
                >
                  {t.on_today === 1 ? "Remove from Today" : "Do Today"}
                </button>
              )}
              {!isEditing && (
                <button
                  onClick={() => startEditTask(t)}
                  className="rounded-lg border border-border p-1.5 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  title="Edit recurrence"
                >
                  <Repeat className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => void removeTask(t.id)}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
                title="Delete task"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>

      {/* New Project Modal */}
      {projectModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setProjectModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-4 shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto flano-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold text-foreground">New Project</h3>
              <button onClick={() => setProjectModalOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Project Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitProject();
                  }}
                  placeholder="New project name…"
                  autoFocus
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Project goals, guidelines, or details…"
                  rows={2}
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Color</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`h-6 w-6 rounded-full border transition-transform ${
                        color === c ? "scale-110 border-white ring-2 ring-primary/40" : "border-transparent opacity-80 hover:opacity-100"
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-6 w-6 cursor-pointer rounded bg-transparent border-0"
                    title="Custom color"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Icon</label>
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1 border border-border/50 rounded-lg p-2 bg-background flano-scroll">
                  {PROJECT_ICON_NAMES.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcon(ic)}
                      className={`p-1.5 rounded-lg border text-muted-foreground transition-colors ${
                        icon === ic ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-muted"
                      }`}
                      title={ic}
                    >
                      <ProjectIcon icon={ic} className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setProjectModalOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitProject()}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Add Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {taskModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setTaskModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-4 shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto flano-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold text-foreground">New Task</h3>
              <button onClick={() => setTaskModalOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs text-muted-foreground">
              In: <span className="font-medium text-foreground">{activeProject ? activeProject.name : "No project (All)"}</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitTask();
                  }}
                  placeholder="Task title…"
                  autoFocus
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Due date</label>
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Repeat</label>
                <div className="flex flex-wrap items-center gap-2">
                  {(["none", "daily", "weekly", "every_n_days"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setRecKind(k)}
                      className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                        recKind === k
                          ? "bg-primary/15 text-primary border border-primary/50"
                          : "border border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {k === "none" ? "Off" : k === "daily" ? "Daily" : k === "weekly" ? "Weekly" : "Every N days"}
                    </button>
                  ))}
                  {recKind === "weekly" && (
                    <div className="flex gap-1">
                      {ALL_DAYS.map((d) => (
                        <button
                          key={d}
                          onClick={() => setRecDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))}
                          className={`h-6 w-6 rounded text-[10px] font-medium transition-colors ${
                            recDays.includes(d) ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {d.charAt(0).toUpperCase()}
                        </button>
                      ))}
                    </div>
                  )}
                  {recKind === "every_n_days" && (
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={recInterval}
                      onChange={(e) => setRecInterval(Number(e.target.value) || 2)}
                      className="h-6 w-14 rounded border border-border bg-background px-1 text-xs text-center"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setTaskModalOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitTask()}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setEditingProject(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-4 shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto flano-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold text-foreground">Edit Project</h3>
              <button onClick={() => setEditingProject(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Project Name</label>
                <input
                  value={editProjName}
                  onChange={(e) => setEditProjName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Description (optional)</label>
                <textarea
                  value={editProjDescription}
                  onChange={(e) => setEditProjDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground resize-none"
                  placeholder="Project purpose, notes, or details…"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Project Color</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditProjColor(c)}
                      className={`h-6 w-6 rounded-full border transition-transform ${
                        editProjColor === c ? "scale-110 border-white ring-2 ring-primary/40" : "border-transparent opacity-80 hover:opacity-100"
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={editProjColor}
                    onChange={(e) => setEditProjColor(e.target.value)}
                    className="h-6 w-6 cursor-pointer rounded bg-transparent border-0"
                    title="Custom color"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Icon</label>
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1 border border-border/50 rounded-lg p-2 bg-background flano-scroll">
                  {PROJECT_ICON_NAMES.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setEditProjIcon(ic)}
                      className={`p-1.5 rounded-lg border text-muted-foreground transition-colors ${
                        editProjIcon === ic ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-muted"
                      }`}
                      title={ic}
                    >
                      <ProjectIcon icon={ic} className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setEditingProject(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveProjectEdit()}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Project Confirmation Modal */}
      {confirmDeleteId != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="w-80 rounded-2xl border border-border bg-card p-5 space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto flano-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-medium text-foreground">Delete project?</div>
            <div className="text-xs text-muted-foreground">
              &quot;{projects.find((p) => p.id === confirmDeleteId)?.name}&quot; will be deleted. Tasks in this project will be unassigned.
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmDelete()}
                className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Notes Slide-Over */}
      {notesPanelProject && (
        <ProjectNotesPanel project={notesPanelProject} onClose={() => setNotesPanelProjectId(null)} />
      )}
    </section>
  );
}
