// Flano SQLite schema types (Kysely). Plain auto-increment INTEGER ids — offline only, no sync.

export type TaskStatus = "todo" | "doing" | "done" | "archived";
export type SessionKind = "work" | "break" | "short_break" | "long_break";
export type SessionStatus =
  | "running"
  | "paused"
  | "completed"
  | "interrupted"
  | "abandoned";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type RecurrenceRule =
  | { kind: "daily" }
  | { kind: "weekly"; days: Weekday[] }
  | { kind: "every_n_days"; interval: number };

export type InstanceStatus = "todo" | "done";

export interface ProjectRow {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  description: string | null;
  notes: string | null;
  archived: number; // 0 | 1
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: number;
  title: string;
  project_id: number | null;
  status: TaskStatus;
  due_date: string | null; // YYYY-MM-DD
  estimated_pomodoros: number | null;
  on_today: number; // 0 | 1
  today_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  recurrence: string | null; // JSON-encoded RecurrenceRule
}

export interface TaskInstanceRow {
  id: number;
  task_id: number;
  date: string; // YYYY-MM-DD
  status: InstanceStatus;
  on_today: number; // 0 | 1
  today_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface SessionRow {
  id: number;
  task_id: number | null;
  kind: SessionKind;
  status: SessionStatus;
  started_at: string; // ISO
  end_at: string; // ISO wall-clock deadline (or pause-time snapshot)
  paused_remaining_sec: number | null;
  planned_duration_sec: number | null;
  completed_at: string | null;
  created_at: string;
}

export interface SettingRow {
  key: string;
  value: string;
}

export interface MigrationRow {
  version: number;
  applied_at: string;
}

export interface Database {
  projects: ProjectRow;
  tasks: TaskRow;
  task_instances: TaskInstanceRow;
  pomodoro_sessions: SessionRow;
  settings: SettingRow;
  schema_migrations: MigrationRow;
}

export const DEFAULT_SETTINGS: Record<string, string> = {
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

export type TodayItem =
  | { kind: "task"; task: TaskRow }
  | { kind: "instance"; instance: TaskInstanceRow; task: TaskRow };

export function parseRecurrence(json: string | null): RecurrenceRule | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as RecurrenceRule;
  } catch {
    return null;
  }
}

export function encodeRecurrence(rule: RecurrenceRule | null): string | null {
  return rule ? JSON.stringify(rule) : null;
}

export function dateMatchesRecurrence(dateStr: string, rule: RecurrenceRule, taskCreatedAt: string): boolean {
  const date = new Date(dateStr + "T12:00:00Z");
  const created = new Date(taskCreatedAt);
  const createdDay = new Date(created.toISOString().slice(0, 10) + "T12:00:00Z");
  if (date < createdDay) return false;

  switch (rule.kind) {
    case "daily":
      return true;
    case "weekly": {
      const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getUTCDay()] as Weekday;
      return rule.days.includes(dayName);
    }
    case "every_n_days": {
      const diffMs = date.getTime() - createdDay.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      return diffDays % rule.interval === 0;
    }
  }
}

export function recurrenceLabel(rule: RecurrenceRule): string {
  switch (rule.kind) {
    case "daily":
      return "Daily";
    case "weekly": {
      const labels = rule.days.map((d) => d.charAt(0).toUpperCase() + d.slice(1));
      return labels.join(", ");
    }
    case "every_n_days":
      return `Every ${rule.interval} days`;
  }
}
