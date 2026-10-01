import { sql } from "kysely";
import { getDb } from "./client";
import { DEFAULT_SETTINGS } from "./schema";

function nowIso(): string {
  return new Date().toISOString();
}

async function ensureMigrationsTable(db: Awaited<ReturnType<typeof getDb>>) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `.execute(db);
}

async function appliedVersions(db: Awaited<ReturnType<typeof getDb>>): Promise<Set<number>> {
  const rows = await db.selectFrom("schema_migrations").selectAll().execute();
  return new Set(rows.map((r) => r.version));
}

async function markApplied(db: Awaited<ReturnType<typeof getDb>>, version: number) {
  await db
    .insertInto("schema_migrations")
    .values({ version, applied_at: nowIso() })
    .onConflict((oc) => oc.doNothing())
    .execute();
}

async function migrateV1(db: Awaited<ReturnType<typeof getDb>>) {
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `.execute(db);
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'P2',
      due_date TEXT,
      estimated_pomodoros INTEGER,
      on_today INTEGER NOT NULL DEFAULT 0,
      today_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `.execute(db);
  await sql`
    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      paused_remaining_sec INTEGER,
      completed_at TEXT,
      created_at TEXT NOT NULL
    )
  `.execute(db);
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_today ON tasks(on_today, today_order)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_task ON pomodoro_sessions(task_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_created ON pomodoro_sessions(created_at)`.execute(db);
}

async function ensureDefaultSettings(db: Awaited<ReturnType<typeof getDb>>) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db
      .insertInto("settings")
      .values({ key, value })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
}

async function migrateV2(db: Awaited<ReturnType<typeof getDb>>) {
  try {
    await sql`ALTER TABLE tasks ADD COLUMN recurrence TEXT`.execute(db);
  } catch (e) {
    const msg = String(e).toLowerCase();
    if (!msg.includes("duplicate column") && !msg.includes("already exists")) throw e;
  }
  await sql`
    CREATE TABLE IF NOT EXISTS task_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      on_today INTEGER NOT NULL DEFAULT 0,
      today_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(task_id, date)
    )
  `.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_instances_task ON task_instances(task_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_instances_date ON task_instances(date)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_instances_today ON task_instances(on_today, today_order)`.execute(db);
}

async function migrateV3(db: Awaited<ReturnType<typeof getDb>>) {
  for (const column of ["icon", "description"]) {
    try {
      await sql.raw(`ALTER TABLE projects ADD COLUMN ${column} TEXT`).execute(db);
    } catch (e) {
      const msg = String(e).toLowerCase();
      if (!msg.includes("duplicate column") && !msg.includes("already exists")) throw e;
    }
  }
}

async function migrateV5(db: Awaited<ReturnType<typeof getDb>>) {
  try {
    await sql`ALTER TABLE tasks DROP COLUMN priority`.execute(db);
  } catch (e) {
    const msg = String(e).toLowerCase();
    if (!msg.includes("no such column") && !msg.includes("duplicate column") && !msg.includes("already exists")) throw e;
  }
}

async function migrateV6(db: Awaited<ReturnType<typeof getDb>>) {
  try {
    await sql`ALTER TABLE projects ADD COLUMN notes TEXT`.execute(db);
  } catch (e) {
    const msg = String(e).toLowerCase();
    if (!msg.includes("duplicate column") && !msg.includes("already exists")) throw e;
  }
}

async function migrateV7(db: Awaited<ReturnType<typeof getDb>>) {
  try {
    await sql`ALTER TABLE pomodoro_sessions ADD COLUMN planned_duration_sec INTEGER`.execute(db);
  } catch (e) {
    const msg = String(e).toLowerCase();
    if (!msg.includes("duplicate column") && !msg.includes("already exists")) throw e;
  }
  const settings = await db.selectFrom("settings").select(["key", "value"]).execute().catch(() => []);
  const get = (k: string, fb: number) => {
    const raw = settings.find((s) => s.key === k)?.value;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fb;
  };
  const workSec = get("work_min", 25) * 60;
  const breakSec = get("break_min", 5) * 60;
  await sql`
    UPDATE pomodoro_sessions SET planned_duration_sec =
      CASE WHEN kind = 'work' THEN ${workSec} ELSE ${breakSec} END
    WHERE planned_duration_sec IS NULL
  `.execute(db).catch(() => {});
}

export async function migrate() {
  const db = await getDb().catch((e) => {
    throw new Error(`migrate:open failed: ${e instanceof Error ? e.message : String(e)}`);
  });
  await ensureMigrationsTable(db);
  const applied = await appliedVersions(db);
  for (const [version, migration] of [[1, migrateV1], [2, migrateV2], [3, migrateV3], [5, migrateV5], [6, migrateV6], [7, migrateV7] ] as const) {
    if (!applied.has(version)) {
      await migration(db);
      await markApplied(db, version);
    }
  }
  await ensureDefaultSettings(db);
}
