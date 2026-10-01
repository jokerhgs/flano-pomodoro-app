import { getDb } from "../client";
import type { TaskInstanceRow, TaskRow, InstanceStatus } from "../schema";
import { parseRecurrence, dateMatchesRecurrence } from "../schema";
import { isTodayIso, todayKey } from "../../time";

function nowIso(): string {
  return new Date().toISOString();
}

function todayStr(): string {
  return todayKey();
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function generateInstances(taskId: number, dates: string[]): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  for (const date of dates) {
    await db
      .insertInto("task_instances")
      .values({
        task_id: taskId,
        date,
        status: "todo",
        on_today: 1,
        today_order: 0,
        created_at: now,
        updated_at: now,
        completed_at: null,
      } as never)
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
}

export async function generateTodayAndAhead(ahead: number): Promise<void> {
  const db = await getDb();
  const recurring = await db
    .selectFrom("tasks")
    .selectAll()
    .where("recurrence", "is not", null)
    .where("status", "!=", "archived")
    .execute();

  const today = todayStr();
  const dates: string[] = [];
  for (let i = 0; i <= ahead; i++) {
    dates.push(addDays(today, i));
  }

  for (const task of recurring) {
    const rule = parseRecurrence(task.recurrence);
    if (!rule) continue;
    const matchingDates = dates.filter((d) => dateMatchesRecurrence(d, rule, task.created_at));
    if (matchingDates.length > 0) {
      await generateInstances(task.id, matchingDates);
    }
  }
}

export async function setInstanceStatus(id: number, status: InstanceStatus): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db
    .updateTable("task_instances")
    .set({
      status,
      updated_at: now,
      completed_at: status === "done" ? now : null,
    })
    .where("id", "=", id)
    .execute();
}

export async function setInstanceOnToday(id: number, onToday: boolean): Promise<void> {
  const db = await getDb();
  if (!onToday) {
    await db
      .updateTable("task_instances")
      .set({ on_today: 0, today_order: 0, updated_at: nowIso() })
      .where("id", "=", id)
      .execute();
    return;
  }
  const maxOrder = await db
    .selectFrom("task_instances")
    .select((eb) => eb.fn.max("today_order").as("m"))
    .where("on_today", "=", 1)
    .executeTakeFirst();
  const nextOrder = Number((maxOrder?.m as unknown as number | null) ?? 0) + 1;
  await db
    .updateTable("task_instances")
    .set({ on_today: 1, today_order: nextOrder, updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

export async function reorderTodayInstances(orderedIds: number[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .updateTable("task_instances")
      .set({ today_order: i + 1, updated_at: nowIso() })
      .where("id", "=", orderedIds[i])
      .execute();
  }
}

export async function listTodayInstances(): Promise<(TaskInstanceRow & { task: TaskRow })[]> {
  const db = await getDb();
  const today = todayKey();
  const rows = await db
    .selectFrom("task_instances")
    .innerJoin("tasks", "tasks.id", "task_instances.task_id")
    .select([
      "task_instances.id as id",
      "task_instances.task_id as task_id",
      "task_instances.date as date",
      "task_instances.status as status",
      "task_instances.on_today as on_today",
      "task_instances.today_order as today_order",
      "task_instances.created_at as created_at",
      "task_instances.updated_at as updated_at",
      "task_instances.completed_at as completed_at",
      "tasks.id as t_id",
      "tasks.title as t_title",
      "tasks.project_id as t_project_id",
      "tasks.status as t_status",
      "tasks.due_date as t_due_date",
      "tasks.estimated_pomodoros as t_estimated_pomodoros",
      "tasks.on_today as t_on_today",
      "tasks.today_order as t_today_order",
      "tasks.created_at as t_created_at",
      "tasks.updated_at as t_updated_at",
      "tasks.completed_at as t_completed_at",
      "tasks.recurrence as t_recurrence",
    ])
    .where("task_instances.date", "<=", today)
    .where("task_instances.status", "!=", "done")
    .where("tasks.status", "!=", "archived")
    .orderBy("task_instances.date")
    .orderBy("task_instances.today_order")
    .orderBy("task_instances.id")
    .execute();

  return rows.map((r) => ({
    id: r.id,
    task_id: r.task_id,
    date: r.date,
    status: r.status,
    on_today: r.on_today,
    today_order: r.today_order,
    created_at: r.created_at,
    updated_at: r.updated_at,
    completed_at: r.completed_at,
    task: {
      id: r.t_id,
      title: r.t_title,
      project_id: r.t_project_id,
      status: r.t_status,
      due_date: r.t_due_date,
      estimated_pomodoros: r.t_estimated_pomodoros,
      on_today: r.t_on_today,
      today_order: r.t_today_order,
      created_at: r.t_created_at,
      updated_at: r.t_updated_at,
      completed_at: r.t_completed_at,
      recurrence: r.t_recurrence,
    },
  }));
}

export async function listCompletedInstancesToday(): Promise<(TaskInstanceRow & { task: TaskRow })[]> {
  const db = await getDb();
  const rows = await db
    .selectFrom("task_instances")
    .innerJoin("tasks", "tasks.id", "task_instances.task_id")
    .select([
      "task_instances.id as id",
      "task_instances.task_id as task_id",
      "task_instances.date as date",
      "task_instances.status as status",
      "task_instances.on_today as on_today",
      "task_instances.today_order as today_order",
      "task_instances.created_at as created_at",
      "task_instances.updated_at as updated_at",
      "task_instances.completed_at as completed_at",
      "tasks.id as t_id",
      "tasks.title as t_title",
      "tasks.project_id as t_project_id",
      "tasks.status as t_status",
      "tasks.due_date as t_due_date",
      "tasks.estimated_pomodoros as t_estimated_pomodoros",
      "tasks.on_today as t_on_today",
      "tasks.today_order as t_today_order",
      "tasks.created_at as t_created_at",
      "tasks.updated_at as t_updated_at",
      "tasks.completed_at as t_completed_at",
      "tasks.recurrence as t_recurrence",
    ])
    .where("task_instances.status", "=", "done")
    .where("tasks.status", "!=", "archived")
    .orderBy("task_instances.id", "desc")
    .limit(50)
    .execute();

  return rows
    .filter((r) => isTodayIso(r.completed_at))
    .map((r) => ({
      id: r.id,
      task_id: r.task_id,
      date: r.date,
      status: r.status,
      on_today: r.on_today,
      today_order: r.today_order,
      created_at: r.created_at,
      updated_at: r.updated_at,
      completed_at: r.completed_at,
      task: {
        id: r.t_id,
        title: r.t_title,
        project_id: r.t_project_id,
        status: r.t_status,
        due_date: r.t_due_date,
        estimated_pomodoros: r.t_estimated_pomodoros,
        on_today: r.t_on_today,
        today_order: r.t_today_order,
        created_at: r.t_created_at,
        updated_at: r.t_updated_at,
        completed_at: r.t_completed_at,
        recurrence: r.t_recurrence,
      },
    }));
}
