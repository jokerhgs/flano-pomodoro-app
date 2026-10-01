import { sql } from "kysely";
import { getDb } from "../client";
import type { SessionKind, SessionRow, SessionStatus } from "../schema";
import { todayKey } from "../../time";

function nowIso(): string {
  return new Date().toISOString();
}

export async function getOpenSession(): Promise<SessionRow | undefined> {
  const db = await getDb();
  return db
    .selectFrom("pomodoro_sessions")
    .selectAll()
    .where("status", "in", ["running", "paused"])
    .orderBy("id", "desc")
    .executeTakeFirst();
}

export async function createSession(input: {
  task_id: number | null;
  kind: SessionKind;
  status: SessionStatus;
  started_at: string;
  end_at: string;
  paused_remaining_sec?: number | null;
  planned_duration_sec?: number | null;
}): Promise<number> {
  const db = await getDb();
  const res = await db
    .insertInto("pomodoro_sessions")
    .values({
      task_id: input.task_id,
      kind: input.kind,
      status: input.status,
      started_at: input.started_at,
      end_at: input.end_at,
      paused_remaining_sec: input.paused_remaining_sec ?? null,
      planned_duration_sec: input.planned_duration_sec ?? null,
      completed_at: null,
      created_at: nowIso(),
    } as never)
    .executeTakeFirst();
  return Number(res.insertId ?? 0);
}

export function sessionMinutes(
  started_at: string,
  completed_at: string | null,
  end_at: string,
  planned_duration_sec: number | null | undefined,
  fallbackMin: number,
): number {
  const capMin = Math.max(
    1,
    Math.round(
      planned_duration_sec != null && Number.isFinite(Number(planned_duration_sec)) && Number(planned_duration_sec) > 0
        ? Number(planned_duration_sec) / 60
        : fallbackMin,
    ),
  );
  const startMs = Date.parse(started_at);
  const endMs = completed_at ? Date.parse(completed_at) : Date.parse(end_at);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return Math.min(capMin, Math.max(1, Math.round(fallbackMin)));
  return Math.max(1, Math.min(capMin, Math.round((endMs - startMs) / 60000)));
}

async function fallbackMinFor(kind: SessionKind): Promise<number> {
  const fb = kind === "work" ? 25 : 5;
  try {
    const db = await getDb();
    const row = await db.selectFrom("settings").select("value").where("key", "=", kind === "work" ? "work_min" : "break_min").executeTakeFirst();
    const n = Number(row?.value);
    return Number.isFinite(n) && n > 0 ? n : fb;
  } catch {
    return fb;
  }
}

export async function updateSession(
  id: number,
  patch: Partial<Pick<SessionRow, "status" | "end_at" | "paused_remaining_sec" | "completed_at" | "task_id">>,
): Promise<void> {
  const db = await getDb();
  await db.updateTable("pomodoro_sessions").set(patch).where("id", "=", id).execute();
}

export async function getLastCompletedSession(): Promise<{ id: number; kind: SessionKind; durationMin: number; completed_at: string | null } | null> {
  const db = await getDb();
  const row = await db
    .selectFrom("pomodoro_sessions")
    .selectAll()
    .where("status", "=", "completed")
    .orderBy("id", "desc")
    .executeTakeFirst();
  if (!row) return null;
  const fallbackMin = await fallbackMinFor(row.kind);
  return {
    id: row.id,
    kind: row.kind,
    durationMin: sessionMinutes(row.started_at, row.completed_at, row.end_at, row.planned_duration_sec, fallbackMin),
    completed_at: row.completed_at,
  };
}

export async function getWorkStats(rangeDays: number): Promise<{
  todayCycles: number;
  todayWorkMin: number;
  totalCycles: number;
  periodCycles: number;
}> {
  const db = await getDb();
  const todayStr = todayKey();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (rangeDays - 1));
  const periodCutoff = todayKey(cutoffDate);
  const rows = await sql<{
    today_cycles: number;
    total_cycles: number;
    period_cycles: number;
  }>`
    SELECT
      SUM(CASE WHEN date(completed_at, 'localtime') = ${todayStr} THEN 1 ELSE 0 END) AS today_cycles,
      COUNT(*) AS total_cycles,
      SUM(CASE WHEN date(completed_at, 'localtime') >= ${periodCutoff} THEN 1 ELSE 0 END) AS period_cycles
    FROM pomodoro_sessions
    WHERE kind = 'work' AND status = 'completed' AND completed_at IS NOT NULL
  `.execute(db);
  const todayRows = await sql<{ started_at: string; completed_at: string; end_at: string; planned_duration_sec: number | null }>`
    SELECT started_at, completed_at, end_at, planned_duration_sec
    FROM pomodoro_sessions
    WHERE kind = 'work' AND status = 'completed' AND completed_at IS NOT NULL
      AND date(completed_at, 'localtime') = ${todayStr}
  `.execute(db);
  const r = rows.rows[0];
  const todayCycles = Number(r?.today_cycles ?? 0);
  const totalCycles = Number(r?.total_cycles ?? 0);
  const periodCycles = Number(r?.period_cycles ?? 0);
  const fallbackMin = await fallbackMinFor("work");
  let todayWorkMin = 0;
  for (const t of todayRows.rows) {
    todayWorkMin += sessionMinutes(t.started_at, t.completed_at, t.end_at, t.planned_duration_sec, fallbackMin);
  }
  return {
    todayCycles,
    todayWorkMin,
    totalCycles,
    periodCycles,
  };
}

export interface WorkStreak {
  streak: number;
  todayMet: boolean;
  todayWorkMin: number;
  todayRemainingMin: number;
}

export async function getWorkStreak(targetMin: number, lookbackDays = 365): Promise<WorkStreak> {
  const target = Math.max(1, Math.round(targetMin));
  const daily = await getDailyWorkStats(Math.max(1, Math.min(730, Math.round(lookbackDays))));
  const met = new Map(daily.map((d) => [d.day, d.workMin >= target]));
  const todayMin = daily.length > 0 ? daily[daily.length - 1].workMin : 0;
  const todayMet = todayMin >= target;
  let streak = 0;
  const startOffset = todayMet ? 0 : 1;
  for (let i = daily.length - 1 - startOffset; i >= 0; i--) {
    if (met.get(daily[i].day)) streak += 1;
    else break;
  }
  return {
    streak,
    todayMet,
    todayWorkMin: todayMin,
    todayRemainingMin: Math.max(0, target - todayMin),
  };
}

export interface DailyWorkStat {
  day: string;
  workMin: number;
  cycles: number;
}

export async function getDailyWorkStats(days = 14): Promise<DailyWorkStat[]> {
  const db = await getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (days - 1));
  const cutoff = todayKey(cutoffDate);
  const rows = await sql<{ day: string; started_at: string; completed_at: string; end_at: string; planned_duration_sec: number | null }>`
    SELECT date(completed_at, 'localtime') AS day, started_at, completed_at, end_at, planned_duration_sec
    FROM pomodoro_sessions
    WHERE kind = 'work' AND status = 'completed' AND completed_at IS NOT NULL
      AND date(completed_at, 'localtime') >= ${cutoff}
    ORDER BY completed_at ASC
  `.execute(db);

  const fallbackMin = await fallbackMinFor("work");
  const map: Record<string, { workMin: number; cycles: number }> = {};
  for (const row of rows.rows) {
    const day = row.day;
    if (!day) continue;
    const durMin = sessionMinutes(row.started_at, row.completed_at, row.end_at, row.planned_duration_sec, fallbackMin);
    if (!map[day]) map[day] = { workMin: 0, cycles: 0 };
    map[day].workMin += durMin;
    map[day].cycles += 1;
  }

  const out: DailyWorkStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const entry = map[dayKey] ?? { workMin: 0, cycles: 0 };
    out.push({ day: dayKey, workMin: entry.workMin, cycles: entry.cycles });
  }
  return out;
}

