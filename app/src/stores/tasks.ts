import { create } from "zustand";
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from "../lib/db/repo/projects";
import {
  createTask,
  deleteTask,
  getTask,
  listAllActive,
  listCompletedToday,
  listToday,
  listSuggestedToday,
  reorderToday,
  setOnToday,
  setTaskStatus,
  updateTask,
  type NewTask,
} from "../lib/db/repo/tasks";
import {
  generateTodayAndAhead,
  listCompletedInstancesToday,
  listTodayInstances,
  setInstanceOnToday,
  setInstanceStatus,
  reorderTodayInstances,
} from "../lib/db/repo/instances";
import type { ProjectRow, TaskRow, TaskStatus, TaskInstanceRow, TodayItem, RecurrenceRule } from "../lib/db/schema";
import { isDemoMode } from "../lib/demo";
import { isTodayIso, todayKey } from "../lib/time";

interface TaskState {
  projects: ProjectRow[];
  today: TodayItem[];
  suggestedToday: TaskRow[];
  all: TaskRow[];
  completedTasks: TaskRow[];
  completedInstances: (TaskInstanceRow & { task: TaskRow })[];
  selectedProjectId: number | null | "all";
  loaded: boolean;
  load: () => Promise<void>;
  setProjectFilter: (id: number | null | "all") => void;
  addProject: (name: string, color?: string | null, icon?: string | null, description?: string | null, notes?: string | null) => Promise<void>;
  editProject: (id: number, patch: Partial<Pick<ProjectRow, "name" | "color" | "icon" | "description" | "notes">>) => Promise<void>;
  removeProject: (id: number) => Promise<void>;
  addTask: (input: NewTask) => Promise<number>;
  editTask: (
    id: number,
    patch: Partial<Pick<TaskRow, "title" | "project_id" | "due_date" | "estimated_pomodoros">> & {
      recurrence?: RecurrenceRule | string | null;
    },
  ) => Promise<void>;
  setStatus: (id: number, status: TaskStatus) => Promise<void>;
  setStatusInstance: (id: number, status: "todo" | "done") => Promise<void>;
  undoDoneInstance: (id: number) => Promise<void>;
  toggleToday: (id: number) => Promise<void>;
  promoteToToday: (id: number) => Promise<void>;
  moveToday: (id: number, dir: -1 | 1) => Promise<void>;
  moveTodayInstance: (id: number, dir: -1 | 1) => Promise<void>;
  removeTask: (id: number) => Promise<void>;
  getTaskCached: (id: number) => TaskRow | undefined;
}

let demoId = 100;

function demoStamp(): string {
  return new Date().toISOString();
}

function buildActiveToday(
  oneOff: TaskRow[],
  instances: (TaskInstanceRow & { task: TaskRow })[],
): TodayItem[] {
  const items: TodayItem[] = [];
  for (const t of oneOff) {
    if (t.on_today === 1 && t.status !== "archived" && t.status !== "done") {
      items.push({ kind: "task", task: t });
    }
  }
  for (const inst of instances) {
    if (inst.status !== "done") {
      items.push({ kind: "instance", instance: inst, task: inst.task });
    }
  }
  items.sort((a, b) => {
    const orderA = a.kind === "task" ? a.task.today_order : a.instance.today_order;
    const orderB = b.kind === "task" ? b.task.today_order : b.instance.today_order;
    const idA = a.kind === "task" ? a.task.id : a.instance.id;
    const idB = b.kind === "task" ? b.task.id : b.instance.id;
    return orderA - orderB || idA - idB;
  });
  return items;
}

function buildDemoSuggested(all: TaskRow[]): TaskRow[] {
  const todayStr = todayKey();
  return all.filter(
    (t) =>
      t.due_date != null &&
      t.due_date <= todayStr &&
      t.on_today === 0 &&
      t.recurrence === null &&
      t.status !== "archived" &&
      t.status !== "done",
  );
}

function buildDemoCompleted(all: TaskRow[]): TaskRow[] {
  return all.filter((t) => t.status === "done" && isTodayIso(t.completed_at));
}

export const useTasks = create<TaskState>()((set, get) => ({
  projects: [],
  today: [],
  suggestedToday: [],
  all: [],
  completedTasks: [],
  completedInstances: [],
  selectedProjectId: "all",
  loaded: false,

  load: async () => {
    if (isDemoMode()) {
      const all = get().all;
      set({
        projects: get().projects,
        today: buildActiveToday(all.filter((t) => t.on_today === 1), []),
        suggestedToday: buildDemoSuggested(all),
        completedTasks: buildDemoCompleted(all),
        completedInstances: [],
        loaded: true,
      });
      return;
    }
    await generateTodayAndAhead(6).catch(() => {});
    const [projects, oneOffToday, all, instancesToday, suggested, completedTasks, completedInstances] = await Promise.all([
      listProjects(false).catch(() => []),
      listToday().catch(() => []),
      listAllActive().catch(() => []),
      listTodayInstances().catch(() => []),
      listSuggestedToday().catch(() => []),
      listCompletedToday().catch(() => []),
      listCompletedInstancesToday().catch(() => []),
    ]);
    const today = buildActiveToday(oneOffToday, instancesToday);
    set({ projects, today, suggestedToday: suggested, all, completedTasks, completedInstances, loaded: true });
  },

  setProjectFilter: (id) => set({ selectedProjectId: id }),

  addProject: async (name, color = null, icon = null, description = null, notes = null) => {
    if (isDemoMode()) {
      const now = demoStamp();
      const project: ProjectRow = {
        id: demoId++,
        name: name.trim(),
        color,
        icon,
        description,
        notes,
        archived: 0,
        created_at: now,
        updated_at: now,
      };
      set({ projects: [...get().projects, project].sort((a, b) => a.name.localeCompare(b.name)) });
      return;
    }
    await createProject(name, color, icon, description, notes);
    await get().load();
  },
  editProject: async (id, patch) => {
    if (isDemoMode()) {
      set({
        projects: get().projects.map((p) =>
          p.id === id
            ? {
                ...p,
                ...patch,
                name: patch.name !== undefined ? patch.name.trim() : p.name,
                updated_at: demoStamp(),
              }
            : p,
        ),
      });
      return;
    }
    await updateProject(id, patch);
    await get().load();
  },
  removeProject: async (id) => {
    if (isDemoMode()) {
      const all = get().all.map((t) => (t.project_id === id ? { ...t, project_id: null } : t));
      set({
        projects: get().projects.filter((p) => p.id !== id),
        all,
        completedTasks: buildDemoCompleted(all),
      });
      return;
    }
    await deleteProject(id);
    await get().load();
  },

  addTask: async (input) => {
    if (isDemoMode()) {
      const now = demoStamp();
      const id = demoId++;
      const maxOrder = Math.max(0, ...get().all.filter((t) => t.on_today === 1).map((t) => t.today_order));
      const task: TaskRow = {
        id,
        title: input.title.trim(),
        project_id: input.project_id ?? null,
        status: "todo",
        due_date: input.due_date ?? null,
        estimated_pomodoros: input.estimated_pomodoros ?? null,
        on_today: input.on_today ? 1 : 0,
        today_order: input.on_today ? maxOrder + 1 : 0,
        created_at: now,
        updated_at: now,
        completed_at: null,
        recurrence: input.recurrence ? JSON.stringify(input.recurrence) : null,
      };
      const all = [...get().all, task].sort((a, b) => b.id - a.id);
      const today = buildActiveToday(all.filter((t) => t.on_today === 1), []);
      const suggestedToday = buildDemoSuggested(all);
      set({ all, today, suggestedToday, completedTasks: buildDemoCompleted(all) });
      return id;
    }
    const id = await createTask(input);
    await get().load();
    return id;
  },
  editTask: async (id, patch) => {
    if (isDemoMode()) {
      const all = get().all.map((t) =>
        t.id === id
          ? {
              ...t,
              ...patch,
              recurrence: patch.recurrence !== undefined
                ? (patch.recurrence ? JSON.stringify(patch.recurrence) : null)
                : t.recurrence,
              updated_at: demoStamp(),
            }
          : t,
      );
      set({
        all,
        today: buildActiveToday(all.filter((t) => t.on_today === 1), []),
        suggestedToday: buildDemoSuggested(all),
        completedTasks: buildDemoCompleted(all),
      });
      return;
    }
    await updateTask(id, patch);
    await get().load();
  },
  setStatus: async (id, status) => {
    if (isDemoMode()) {
      const now = demoStamp();
      const all = get().all.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              updated_at: now,
              completed_at: status === "done" ? now : null,
              on_today: status === "done" || status === "archived" ? 0 : t.on_today,
              today_order: status === "done" || status === "archived" ? 0 : t.today_order,
            }
          : t,
      );
      const today = buildActiveToday(all.filter((t) => t.on_today === 1), []);
      const suggestedToday = buildDemoSuggested(all);
      set({ all, today, suggestedToday, completedTasks: buildDemoCompleted(all) });
      return;
    }
    await setTaskStatus(id, status);
    await get().load();
  },
  setStatusInstance: async (id, status) => {
    if (isDemoMode()) return;
    await setInstanceStatus(id, status);
    await get().load();
  },
  undoDoneInstance: async (id) => {
    if (isDemoMode()) return;
    await setInstanceStatus(id, "todo");
    await setInstanceOnToday(id, true).catch(() => {});
    await get().load();
  },
  toggleToday: async (id) => {
    if (isDemoMode()) {
      const all = get().all;
      const target = all.find((t) => t.id === id);
      if (!target) return;
      const updated = all.map((t) => {
        if (t.id !== id) return t;
        if (t.on_today === 1) {
          return { ...t, on_today: 0 as const, today_order: 0 };
        }
        const maxOrder = Math.max(0, ...all.filter((x) => x.on_today === 1).map((x) => x.today_order));
        return {
          ...t,
          on_today: 1 as const,
          today_order: maxOrder + 1,
          status: t.status === "todo" ? ("doing" as const) : t.status,
          updated_at: demoStamp(),
        };
      });
      const today = buildActiveToday(updated.filter((t) => t.on_today === 1), []);
      const suggestedToday = buildDemoSuggested(updated);
      set({ all: updated, today, suggestedToday, completedTasks: buildDemoCompleted(updated) });
      return;
    }
    const t = await getTask(id).catch(() => undefined);
    if (!t) return;
    await setOnToday(id, !(t.on_today === 1));
    await get().load();
  },
  promoteToToday: async (id) => {
    if (isDemoMode()) {
      const all = get().all;
      const maxOrder = Math.max(0, ...all.filter((x) => x.on_today === 1).map((x) => x.today_order));
      const updated = all.map((t) =>
        t.id === id
          ? {
              ...t,
              on_today: 1 as const,
              today_order: maxOrder + 1,
              status: t.status === "todo" ? ("doing" as const) : t.status,
              updated_at: demoStamp(),
            }
          : t,
      );
      const today = buildActiveToday(updated.filter((t) => t.on_today === 1), []);
      const suggestedToday = buildDemoSuggested(updated);
      set({ all: updated, today, suggestedToday, completedTasks: buildDemoCompleted(updated) });
      return;
    }
    await setOnToday(id, true);
    await get().load();
  },
  moveToday: async (id, dir) => {
    const items = [...get().today];
    const i = items.findIndex((item) => item.kind === "task" && item.task.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    const reordered = items.map((item, idx) => {
      if (item.kind === "task") return { ...item, task: { ...item.task, today_order: idx + 1 } };
      return { ...item, instance: { ...item.instance, today_order: idx + 1 } };
    });
    set({ today: reordered });
    if (isDemoMode()) return;
    const taskIds: number[] = [];
    const instanceIds: number[] = [];
    for (const item of reordered) {
      if (item.kind === "task") taskIds.push(item.task.id);
      else instanceIds.push(item.instance.id);
    }
    if (taskIds.length > 0) await reorderToday(taskIds).catch(() => {});
    if (instanceIds.length > 0) await reorderTodayInstances(instanceIds).catch(() => {});
  },
  moveTodayInstance: async (id, dir) => {
    const items = [...get().today];
    const i = items.findIndex((item) => item.kind === "instance" && item.instance.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    const reordered = items.map((item, idx) => {
      if (item.kind === "task") return { ...item, task: { ...item.task, today_order: idx + 1 } };
      return { ...item, instance: { ...item.instance, today_order: idx + 1 } };
    });
    set({ today: reordered });
    if (isDemoMode()) return;
    const taskIds: number[] = [];
    const instanceIds: number[] = [];
    for (const item of reordered) {
      if (item.kind === "task") taskIds.push(item.task.id);
      else instanceIds.push(item.instance.id);
    }
    if (taskIds.length > 0) await reorderToday(taskIds).catch(() => {});
    if (instanceIds.length > 0) await reorderTodayInstances(instanceIds).catch(() => {});
  },
  removeTask: async (id) => {
    if (isDemoMode()) {
      const all = get().all.filter((t) => t.id !== id);
      const today = buildActiveToday(all.filter((t) => t.on_today === 1), []);
      const suggestedToday = buildDemoSuggested(all);
      set({ all, today, suggestedToday, completedTasks: buildDemoCompleted(all) });
      return;
    }
    await deleteTask(id);
    await get().load();
  },
  getTaskCached: (id) => get().all.find((t) => t.id === id),
}));
