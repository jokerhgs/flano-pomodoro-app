import { getDb } from "../client";
import { DEFAULT_SETTINGS } from "../schema";

export interface BackupDump {
  version: 1;
  exported_at: string;
  settings: { key: string; value: string }[];
  projects: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  task_instances: Record<string, unknown>[];
  pomodoro_sessions: Record<string, unknown>[];
}

export async function exportAll(): Promise<BackupDump> {
  const db = await getDb();
  const [settings, projects, tasks, task_instances, pomodoro_sessions] = await Promise.all([
    db.selectFrom("settings").selectAll().execute(),
    db.selectFrom("projects").selectAll().execute(),
    db.selectFrom("tasks").selectAll().execute(),
    db.selectFrom("task_instances").selectAll().execute(),
    db.selectFrom("pomodoro_sessions").selectAll().execute(),
  ]);
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    settings: settings as { key: string; value: string }[],
    projects: projects as unknown as Record<string, unknown>[],
    tasks: tasks as unknown as Record<string, unknown>[],
    task_instances: task_instances as unknown as Record<string, unknown>[],
    pomodoro_sessions: pomodoro_sessions as unknown as Record<string, unknown>[],
  };
}

function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

const TASK_STATUSES = new Set(["todo", "doing", "done", "archived"]);
const SESSION_KINDS = new Set(["work", "break", "short_break", "long_break"]);
const SESSION_STATUSES = new Set(["running", "paused", "completed", "interrupted", "abandoned"]);
const INSTANCE_STATUSES = new Set(["todo", "done"]);

export async function importAll(dump: BackupDump): Promise<void> {
  if (!dump || typeof dump !== "object" || dump.version !== 1) throw new Error("Unsupported backup version");
  for (const key of ["settings", "projects", "tasks", "pomodoro_sessions"] as const) {
    if (!Array.isArray((dump as unknown as Record<string, unknown>)[key])) throw new Error(`Invalid backup: missing ${key}`);
  }
  const taskInstances = Array.isArray(dump.task_instances) ? dump.task_instances : [];
  const db = await getDb();
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("pomodoro_sessions").execute();
    await trx.deleteFrom("task_instances").execute();
    await trx.deleteFrom("tasks").execute();
    await trx.deleteFrom("projects").execute();
    await trx.deleteFrom("settings").execute();

    for (const p of dump.projects) {
      const r = p as Record<string, string | number | null>;
      await trx
        .insertInto("projects")
        .values({
          ...(r.id == null ? {} : { id: toInt(r.id) }),
          name: String(r.name ?? "Untitled"),
          color: (r.color as string | null) ?? null,
          icon: (r.icon as string | null) ?? null,
          description: (r.description as string | null) ?? null,
          notes: (r.notes as string | null) ?? null,
          archived: toInt(r.archived),
          created_at: String(r.created_at ?? new Date().toISOString()),
          updated_at: String(r.updated_at ?? new Date().toISOString()),
        } as never)
        .execute();
    }
    for (const t of dump.tasks) {
      const r = t as Record<string, string | number | null>;
      const status = String(r.status ?? "todo");
      await trx
        .insertInto("tasks")
        .values({
          ...(r.id == null ? {} : { id: toInt(r.id) }),
          title: String(r.title ?? "Untitled"),
          project_id: r.project_id == null ? null : toInt(r.project_id),
          status: (TASK_STATUSES.has(status) ? status : "todo") as "todo" | "doing" | "done" | "archived",
          due_date: (r.due_date as string | null) ?? null,
          estimated_pomodoros: r.estimated_pomodoros == null ? null : toInt(r.estimated_pomodoros),
          on_today: toInt(r.on_today),
          today_order: toInt(r.today_order),
          recurrence: (r.recurrence as string | null) ?? null,
          created_at: String(r.created_at ?? new Date().toISOString()),
          updated_at: String(r.updated_at ?? new Date().toISOString()),
          completed_at: (r.completed_at as string | null) ?? null,
        } as never)
        .execute();
    }
    for (const i of taskInstances) {
      const r = i as Record<string, string | number | null>;
      const status = String(r.status ?? "todo");
      await trx
        .insertInto("task_instances")
        .values({
          ...(r.id == null ? {} : { id: toInt(r.id) }),
          task_id: toInt(r.task_id),
          date: String(r.date ?? new Date().toISOString().slice(0, 10)),
          status: (INSTANCE_STATUSES.has(status) ? status : "todo") as "todo" | "done",
          on_today: toInt(r.on_today),
          today_order: toInt(r.today_order),
          created_at: String(r.created_at ?? new Date().toISOString()),
          updated_at: String(r.updated_at ?? new Date().toISOString()),
          completed_at: (r.completed_at as string | null) ?? null,
        } as never)
        .execute();
    }
    for (const s of dump.pomodoro_sessions) {
      const r = s as Record<string, string | number | null>;
      const kind = String(r.kind ?? "work");
      const rawStatus = String(r.status ?? "completed");
      const status = rawStatus === "running" || rawStatus === "paused" ? "interrupted" : rawStatus;
      await trx
        .insertInto("pomodoro_sessions")
        .values({
          ...(r.id == null ? {} : { id: toInt(r.id) }),
          task_id: r.task_id == null ? null : toInt(r.task_id),
          kind: (SESSION_KINDS.has(kind) ? kind : "work") as "work" | "break" | "short_break" | "long_break",
          status: (SESSION_STATUSES.has(status) ? status : "completed") as never,
          started_at: String(r.started_at ?? new Date().toISOString()),
          end_at: String(r.end_at ?? new Date().toISOString()),
          paused_remaining_sec: r.paused_remaining_sec == null ? null : toInt(r.paused_remaining_sec),
          planned_duration_sec: r.planned_duration_sec == null ? null : toInt(r.planned_duration_sec as number),
          completed_at: (r.completed_at as string | null) ?? null,
          created_at: String(r.created_at ?? new Date().toISOString()),
        } as never)
        .execute();
    }
    for (const s of dump.settings) {
      await trx
        .insertInto("settings")
        .values({ key: s.key, value: s.value })
        .onConflict((oc) => oc.column("key").doUpdateSet({ value: s.value }))
        .execute();
    }
  });
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.deleteFrom("pomodoro_sessions").execute();
  await db.deleteFrom("task_instances").execute();
  await db.deleteFrom("tasks").execute();
  await db.deleteFrom("projects").execute();
  await db.deleteFrom("settings").execute();
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db
      .insertInto("settings")
      .values({ key, value })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
}
