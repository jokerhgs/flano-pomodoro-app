import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

function ts(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function dateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function noonIso(daysAgo, slot = 0) {
  const base = new Date();
  base.setDate(base.getDate() - daysAgo);
  base.setHours(12, 0, 0, 0);
  const end = new Date(base.getTime() - slot * 30 * 60 * 1000);
  const start = new Date(end.getTime() - 25 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function getDbPaths() {
  const targets = [];
  if (process.env.APPDATA) {
    targets.push(path.join(process.env.APPDATA, "com.flano.app", "app.db"));
    targets.push(path.join(process.env.APPDATA, "Flano", "app.db"));
  }
  if (process.env.LOCALAPPDATA) {
    targets.push(path.join(process.env.LOCALAPPDATA, "com.flano.app", "app.db"));
    targets.push(path.join(process.env.LOCALAPPDATA, "Flano", "app.db"));
  }
  targets.push(path.resolve("app.db"));

  const existing = targets.filter((p) => fs.existsSync(p));
  if (existing.length > 0) return existing;

  const first = targets[0];
  if (first) {
    const dir = path.dirname(first);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return [first];
  }
  return [path.resolve("app.db")];
}

function seedFile(filePath) {
  console.log(`🌱 Seeding SQLite database at: ${filePath}`);
  const db = new DatabaseSync(filePath);

  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT,
      icon TEXT,
      description TEXT,
      notes TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      due_date TEXT,
      estimated_pomodoros INTEGER,
      on_today INTEGER NOT NULL DEFAULT 0,
      today_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      recurrence TEXT
    );
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
    );
    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      paused_remaining_sec INTEGER,
      planned_duration_sec INTEGER,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_today ON tasks(on_today, today_order);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_instances_task ON task_instances(task_id);
    CREATE INDEX IF NOT EXISTS idx_instances_date ON task_instances(date);
    CREATE INDEX IF NOT EXISTS idx_instances_today ON task_instances(on_today, today_order);
    CREATE INDEX IF NOT EXISTS idx_sessions_task ON pomodoro_sessions(task_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON pomodoro_sessions(created_at);
  `);

  db.exec(`
    DELETE FROM pomodoro_sessions;
    DELETE FROM task_instances;
    DELETE FROM tasks;
    DELETE FROM projects;
    DELETE FROM settings;
    DELETE FROM schema_migrations;
  `);

  const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  const defaultSettings = {
    work_min: "25",
    break_min: "5",
    sound_on: "1",
    shortcut_sound: "1",
    sound_preset: "alarm",
    volume: "0.7",
    global_shortcut: "CommandOrControl+Shift+P",
    auto_start_breaks: "0",
    auto_start_work: "0",
    target_work_hours: "4",
  };
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }

  const insertProject = db.prepare(
    "INSERT INTO projects (name, color, icon, description, notes, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );

  const p1 = Number(
    insertProject.run(
      "Website relaunch",
      "#1f8a9e",
      "Code",
      "Redesigning landing page, mobile navigation, and blog CMS.",
      "Launch checklist:\n- Hero copy approved\n- Mobile nav fix verified on device\n- Blog CMS migration dry-run\n- Analytics events QA",
      0,
      ts(20),
      ts(1),
    ).lastInsertRowid,
  );
  const p2 = Number(
    insertProject.run(
      "Learn piano",
      "#a855f7",
      "Music",
      "Daily practice, C major scales, and Für Elise prep.",
      "Practice routine:\n- 1x scales (C major, hands together)\n- 2x Für Elise first section, slow\n- Record Friday run-through",
      0,
      ts(30),
      ts(5),
    ).lastInsertRowid,
  );
  const p3 = Number(
    insertProject.run(
      "Health & Fitness",
      "#10b981",
      "Heart",
      "5k runs, stretching, and annual health checkups.",
      "This week: Tue / Thu / Sat runs. Stretch after every run.",
      0,
      ts(12),
      ts(2),
    ).lastInsertRowid,
  );
  const p4 = Number(
    insertProject.run(
      "Product Roadmap",
      "#f59e0b",
      "Target",
      "Quarterly specs, user feedback review, and analytics dashboard.",
      null,
      0,
      ts(15),
      ts(3),
    ).lastInsertRowid,
  );
  const p5 = Number(
    insertProject.run(
      "Personal Admin",
      "#ec4899",
      "Briefcase",
      "Tax documents, dentist booking, and monthly subscription review.",
      null,
      0,
      ts(25),
      ts(4),
    ).lastInsertRowid,
  );

  const insertTask = db.prepare(
    "INSERT INTO tasks (title, project_id, status, due_date, estimated_pomodoros, on_today, today_order, created_at, updated_at, completed_at, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );

  const today = dateStr(0);
  const now = ts(0);

  const t1 = Number(
    insertTask.run("Draft landing page hero copy", p1, "doing", today, 4, 1, 1, ts(3), now, null, null).lastInsertRowid,
  );
  const t2 = Number(
    insertTask.run("Fix mobile nav overlap", p1, "doing", today, 2, 1, 2, ts(2), now, null, null).lastInsertRowid,
  );
  const t3 = Number(
    insertTask.run(
      "Scales practice — C major",
      p2,
      "todo",
      null,
      1,
      0,
      0,
      ts(4),
      ts(1),
      null,
      JSON.stringify({ kind: "daily" }),
    ).lastInsertRowid,
  );
  const t4 = Number(
    insertTask.run(
      "Morning run 5k",
      p3,
      "todo",
      null,
      1,
      0,
      0,
      ts(1),
      now,
      null,
      JSON.stringify({ kind: "daily" }),
    ).lastInsertRowid,
  );

  const t5 = Number(
    insertTask.run("Review PR feedback for auth module", p1, "todo", today, 2, 0, 0, ts(1), now, null, null)
      .lastInsertRowid,
  );
  const t6 = Number(
    insertTask.run("Book dentist appointment", p5, "todo", today, 1, 0, 0, ts(1), now, null, null).lastInsertRowid,
  );
  const tOverdue1 = Number(
    insertTask.run("Renew gym membership", p3, "todo", dateStr(-2), 1, 0, 0, ts(8), ts(1), null, null).lastInsertRowid,
  );
  const tOverdue2 = Number(
    insertTask.run("Pay electricity bill", p5, "todo", dateStr(-1), 1, 0, 0, ts(6), ts(1), null, null).lastInsertRowid,
  );

  const tBlog = Number(
    insertTask.run("Migrate blog posts to new CMS", p1, "todo", dateStr(4), 6, 0, 0, ts(6), ts(2), null, null)
      .lastInsertRowid,
  );
  const tElise = Number(
    insertTask.run("Learn Für Elise first section", p2, "todo", dateStr(5), 3, 0, 0, ts(9), ts(5), null, null)
      .lastInsertRowid,
  );
  const tDone1 = Number(
    insertTask.run("Set up analytics dashboard", p4, "done", today, 3, 0, 0, ts(10), now, now, null).lastInsertRowid,
  );
  const tDone2 = Number(
    insertTask.run("Ship onboarding checklist", p4, "done", today, 2, 0, 0, ts(4), now, now, null).lastInsertRowid,
  );
  const tDoneOld = Number(
    insertTask.run("Fix login redirect bug", p1, "done", dateStr(-3), 2, 0, 0, ts(9), ts(3), ts(3), null).lastInsertRowid,
  );
  const tArchived = Number(
    insertTask.run("Old homepage drafts", p1, "archived", dateStr(-10), null, 0, 0, ts(30), ts(20), null, null)
      .lastInsertRowid,
  );
  insertTask.run("Weekly review", null, "todo", null, 2, 0, 0, ts(14), ts(7), null, JSON.stringify({ kind: "weekly", days: ["fri"] }));
  const tStretch = Number(
    insertTask.run(
      "Stretch & mobility 15m",
      p3,
      "todo",
      null,
      1,
      0,
      0,
      ts(6),
      ts(3),
      null,
      JSON.stringify({ kind: "every_n_days", interval: 3 }),
    ).lastInsertRowid,
  );
  insertTask.run("Write API documentation", p1, "todo", dateStr(2), 4, 0, 0, ts(2), now, null, null);
  insertTask.run("Design system audit", p4, "todo", dateStr(7), 3, 0, 0, ts(3), ts(1), null, null);
  insertTask.run("Piano recital prep", p2, "todo", dateStr(12), 5, 0, 0, ts(5), ts(1), null, null);
  insertTask.run("Annual physical", p3, "todo", dateStr(10), 1, 0, 0, ts(7), ts(2), null, null);
  insertTask.run("Buy birthday gift", null, "todo", dateStr(2), 1, 0, 0, ts(2), now, null, null);

  const insertInstance = db.prepare(
    "INSERT INTO task_instances (task_id, date, status, on_today, today_order, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insertInstance.run(t3, today, "todo", 1, 3, now, now, null);
  insertInstance.run(t4, today, "todo", 1, 4, now, now, null);
  insertInstance.run(tStretch, dateStr(-2), "todo", 0, 0, now, now, null);
  insertInstance.run(t4, dateStr(-1), "done", 0, 0, ts(1), now, now);

  const insertSession = db.prepare(
    "INSERT INTO pomodoro_sessions (task_id, kind, status, started_at, end_at, paused_remaining_sec, planned_duration_sec, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const sessionCounts = [5, 4, 6, 3, 5, 2, 0, 5, 6, 4, 3, 5, 2, 4];
  const sessionTaskIds = [t1, t2, t3, t4, t5, t6, tOverdue2, tBlog, tElise, tDone1, tDone2, tDoneOld, tOverdue1];
  for (let i = 0; i < sessionCounts.length; i++) {
    const count = sessionCounts[i];
    for (let c = 0; c < count; c++) {
      const { startIso, endIso } = noonIso(i, c);
      const targetTask = sessionTaskIds[(i + c) % sessionTaskIds.length];
      insertSession.run(targetTask, "work", "completed", startIso, endIso, null, 1500, endIso, startIso);
    }
  }
  const todayBreak = noonIso(0, 6);
  insertSession.run(null, "short_break", "completed", todayBreak.startIso, todayBreak.endIso, null, 300, todayBreak.endIso, todayBreak.startIso);
  const yesterdayBreak = noonIso(1, 5);
  insertSession.run(
    null,
    "short_break",
    "completed",
    yesterdayBreak.startIso,
    yesterdayBreak.endIso,
    null,
    300,
    yesterdayBreak.endIso,
    yesterdayBreak.startIso,
  );

  const insertMigration = db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)");
  insertMigration.run(1, now);
  insertMigration.run(2, now);
  insertMigration.run(3, now);
  insertMigration.run(5, now);
  insertMigration.run(6, now);
  insertMigration.run(7, now);

  db.close();
  console.log(`✅ Database successfully seeded at ${filePath}`);
}

const dbPaths = getDbPaths();
for (const p of dbPaths) {
  seedFile(p);
}
