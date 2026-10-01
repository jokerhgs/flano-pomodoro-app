import { getDb } from "../client";
import type { TaskRow, TaskStatus, RecurrenceRule } from "../schema";
import { encodeRecurrence } from "../schema";
import { isTodayIso, todayKey } from "../../time";

function nowIso(): string {
  return new Date().toISOString();
}

export interface NewTask {
  title: string;
  project_id?: number | null;
  due_date?: string | null;
  estimated_pomodoros?: number | null;
  on_today?: boolean;
  recurrence?: RecurrenceRule | null;
}

export async function listToday(): Promise<TaskRow[]> {
  const db = await getDb();
  return db
    .selectFrom("tasks")
    .selectAll()
    .where("on_today", "=", 1)
    .where("status", "!=", "archived")
    .where("status", "!=", "done")
    .orderBy("today_order")
    .orderBy("id")
    .execute();
}

export async function listSuggestedToday(): Promise<TaskRow[]> {
  const db = await getDb();
  const today = todayKey();
  return db
    .selectFrom("tasks")
    .selectAll()
    .where("due_date", "<=", today)
    .where("on_today", "=", 0)
    .where("status", "!=", "archived")
    .where("status", "!=", "done")
    .where("recurrence", "is", null)
    .orderBy("due_date")
    .orderBy("id")
    .execute();
}

export async function listAllActive(): Promise<TaskRow[]> {
  const db = await getDb();
  return db
    .selectFrom("tasks")
    .selectAll()
    .where("status", "!=", "archived")
    .orderBy("id", "desc")
    .execute();
}

export async function listCompletedToday(): Promise<TaskRow[]> {
  const db = await getDb();
  const rows = await db
    .selectFrom("tasks")
    .selectAll()
    .where("status", "=", "done")
    .orderBy("id", "desc")
    .limit(50)
    .execute();
  return rows.filter((r) => isTodayIso(r.completed_at));
}

export async function getTask(id: number): Promise<TaskRow | undefined> {
  const db = await getDb();
  return db.selectFrom("tasks").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function createTask(input: NewTask): Promise<number> {
  const db = await getDb();
  const now = nowIso();
  const maxOrder = await db
    .selectFrom("tasks")
    .select((eb) => eb.fn.max("today_order").as("m"))
    .where("on_today", "=", 1)
    .executeTakeFirst();
  const nextOrder = Number((maxOrder?.m as unknown as number | null) ?? 0) + 1;
  const res = await db
    .insertInto("tasks")
    .values({
      title: input.title.trim(),
      project_id: input.project_id ?? null,
      status: "todo",
      due_date: input.due_date ?? null,
      estimated_pomodoros: input.estimated_pomodoros ?? null,
      on_today: input.on_today ? 1 : 0,
      today_order: input.on_today ? nextOrder : 0,
      created_at: now,
      updated_at: now,
      completed_at: null,
      recurrence: encodeRecurrence(input.recurrence ?? null),
    } as never)
    .executeTakeFirst();
  return Number(res.insertId ?? 0);
}

export async function updateTask(
  id: number,
  patch: Partial<Pick<TaskRow, "title" | "project_id" | "due_date" | "estimated_pomodoros">> & {
    recurrence?: RecurrenceRule | string | null;
  },
): Promise<void> {
  const db = await getDb();
  const { recurrence, ...rest } = patch;
  const encodedRecurrence =
    recurrence === undefined
      ? undefined
      : typeof recurrence === "string"
        ? recurrence
        : encodeRecurrence(recurrence);
  await db
    .updateTable("tasks")
    .set({ ...rest, recurrence: encodedRecurrence, updated_at: nowIso() })
    .where("id", "=", id)
    .execute();
}

export async function setTaskStatus(id: number, status: TaskStatus): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db
    .updateTable("tasks")
    .set({
      status,
      updated_at: now,
      completed_at: status === "done" ? now : null,
      ...(status === "done" || status === "archived" ? { on_today: 0 } : {}),
    })
    .where("id", "=", id)
    .execute();
}

export async function setOnToday(id: number, onToday: boolean): Promise<void> {
  const db = await getDb();
  if (!onToday) {
    await db
      .updateTable("tasks")
      .set({ on_today: 0, today_order: 0, updated_at: nowIso() })
      .where("id", "=", id)
      .execute();
    return;
  }
  const maxOrder = await db
    .selectFrom("tasks")
    .select((eb) => eb.fn.max("today_order").as("m"))
    .where("on_today", "=", 1)
    .executeTakeFirst();
  const nextOrder = Number((maxOrder?.m as unknown as number | null) ?? 0) + 1;
  const existing = await db
    .selectFrom("tasks")
    .select(["status"])
    .where("id", "=", id)
    .executeTakeFirst();
  await db
    .updateTable("tasks")
    .set({
      on_today: 1,
      today_order: nextOrder,
      updated_at: nowIso(),
      status: existing?.status === "todo" ? "doing" : existing?.status,
    })
    .where("id", "=", id)
    .execute();
}

export async function reorderToday(orderedIds: number[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .updateTable("tasks")
      .set({ today_order: i + 1, updated_at: nowIso() })
      .where("id", "=", orderedIds[i])
      .execute();
  }
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb();
  await db.deleteFrom("tasks").where("id", "=", id).execute();
}
