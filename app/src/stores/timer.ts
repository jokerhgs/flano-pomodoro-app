import { create } from "zustand";
import { getAllSettings } from "../lib/db/repo/settings";
import {
  createSession,
  getOpenSession,
  getWorkStreak,
  updateSession,
} from "../lib/db/repo/sessions";
import { getTask } from "../lib/db/repo/tasks";
import { notifySessionEnd, updateTray } from "../lib/os";
import { playCue } from "../lib/sound";
import { fmtClock, nowIso } from "../lib/time";
import { isDemoMode } from "../lib/demo";
import { useTasks } from "./tasks";
import type { SessionKind } from "../lib/db/schema";

export type TimerStatus = "idle" | "running" | "paused";

interface TimerState {
  status: TimerStatus;
  kind: SessionKind;
  sessionId: number | null;
  taskId: number | null;
  taskTitle: string;
  endAt: number; // epoch ms when running
  remainingSec: number;
  workMin: number;
  breakMin: number;
  soundOn: boolean;
  soundPreset: string;
  volume: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
  targetWorkHours: number;
  streak: number;
  streakAtRisk: boolean;
  streakRemainingMin: number;
  hydrated: boolean;
  notice: string;
  hydrate: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshStreak: () => Promise<void>;
  start: (kind?: SessionKind, taskId?: number | null) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  toggle: () => Promise<void>;
  skip: () => Promise<void>;
  skipBreak: () => Promise<void>;
  reset: () => Promise<void>;
  tick: () => Promise<void>;
  setTask: (taskId: number | null) => Promise<void>;
  dismissNotice: () => void;
}

function durFor(kind: SessionKind, s: { workMin: number; breakMin: number }): number {
  if (kind === "break" || kind === "short_break" || kind === "long_break") return s.breakMin * 60;
  return s.workMin * 60;
}

function nextKindAfter(kind: SessionKind): SessionKind {
  if (kind === "work") return "break";
  return "work";
}

let completing = false;
let lastTrayPush = 0;
let refreshingStreak = false;

async function pushTray(status: TimerStatus, kind: SessionKind, remainingSec: number, taskTitle: string) {
  const now = Date.now();
  if (now - lastTrayPush < 1000 && status === "running") return;
  lastTrayPush = now;
  const label = kind === "work" ? "Work" : kind === "short_break" ? "Short break" : "Long break";
  const title = status === "idle" ? "Flano" : `${fmtClock(remainingSec)}`;
  const tooltip =
    status === "idle"
      ? "Flano — ready"
      : `Flano — ${label} ${fmtClock(remainingSec)}${taskTitle ? ` • ${taskTitle}` : ""}`;
  await updateTray(title, tooltip);
}

// Demo mode (browser preview): persistence is in-memory, so DB writes become no-ops
// and task titles resolve from the in-memory task cache.
async function dbCreateSession(args: Parameters<typeof createSession>[0]): Promise<number> {
  if (isDemoMode()) return -1;
  return createSession(args);
}

async function dbUpdateSession(id: number, patch: Parameters<typeof updateSession>[1]): Promise<void> {
  if (isDemoMode() || id < 0) return;
  await updateSession(id, patch).catch(() => {});
}

async function resolveTaskTitle(taskId: number | null, fallback: string): Promise<string> {
  if (taskId == null) return fallback;
  if (isDemoMode()) return useTasks.getState().getTaskCached(taskId)?.title ?? fallback;
  return (await getTask(taskId).catch(() => undefined))?.title ?? fallback;
}

export const useTimer = create<TimerState>()((set, get) => ({
  status: "idle",
  kind: "work",
  sessionId: null,
  taskId: null,
  taskTitle: "",
  endAt: 0,
  remainingSec: 25 * 60,
  workMin: 25,
  breakMin: 5,
  soundOn: true,
  soundPreset: "alarm",
  volume: 0.7,
  autoStartBreaks: false,
  autoStartWork: false,
  targetWorkHours: 4,
  streak: 0,
  streakAtRisk: false,
  streakRemainingMin: 0,
  hydrated: false,
  notice: "",

  refreshStreak: async () => {
    if (isDemoMode()) {
      set({ streak: 0, streakAtRisk: false, streakRemainingMin: 0 });
      return;
    }
    if (refreshingStreak) return;
    refreshingStreak = true;
    try {
      const targetMin = Math.max(1, Math.round((get().targetWorkHours || 4) * 60));
      const s = await getWorkStreak(targetMin).catch(() => null);
      if (!s) return;
      set({
        streak: s.streak,
        streakAtRisk: !s.todayMet,
        streakRemainingMin: s.todayRemainingMin,
      });
    } finally {
      refreshingStreak = false;
    }
  },

  hydrate: async () => {
    if (get().hydrated) return;
    if (isDemoMode()) {
      const d = get();
      set({ status: "idle", kind: "work", remainingSec: d.workMin * 60, hydrated: true });
      return;
    }
    await get().refreshSettings();
    await get().refreshStreak();
    const s = get();
    const open = await getOpenSession().catch(() => undefined);
    if (!open) {
      set({ status: "idle", kind: "work", remainingSec: s.workMin * 60, hydrated: true });
      await pushTray("idle", "work", 0, "");
      return;
    }
    const taskTitle =
      open.task_id != null ? (await getTask(open.task_id).catch(() => undefined))?.title ?? "" : "";
    if (open.status === "paused") {
      const remaining = Math.max(
        1,
        open.paused_remaining_sec ?? Math.max(1, Math.round((Date.parse(open.end_at) - Date.parse(open.started_at)) / 1000)),
      );
      set({
        status: "paused",
        kind: open.kind,
        sessionId: open.id,
        taskId: open.task_id,
        taskTitle,
        remainingSec: remaining,
        endAt: 0,
        hydrated: true,
      });
      await pushTray("paused", open.kind, remaining, taskTitle);
      return;
    }
    // running — smart resume
    const endMs = Date.parse(open.end_at);
    const now = Date.now();
    if (Number.isFinite(endMs) && now >= endMs) {
      // Ended while app was closed → count completed + notify on launch.
      await updateSession(open.id, { status: "completed", completed_at: nowIso() }).catch(() => {});
      const notice = `Session ended while away (${open.kind}).`;
      const nk = nextKindAfter(open.kind);
      if (get().soundOn) await playCue("end", get().volume, get().soundPreset);
      await notifySessionEnd(
        open.kind === "work" ? "Work session complete" : "Break over",
        taskTitle ? `${taskTitle}` : "Time for the next session.",
      );
      set({ status: "idle", kind: nk, sessionId: null, remainingSec: durFor(nk, get()), notice, hydrated: true });
      await get().refreshStreak();
      await pushTray("idle", nk, 0, "");
      return;
    }
    const remaining = Math.max(1, Math.round((endMs - now) / 1000));
    set({
      status: "running",
      kind: open.kind,
      sessionId: open.id,
      taskId: open.task_id,
      taskTitle,
      endAt: endMs,
      remainingSec: remaining,
      hydrated: true,
    });
    await pushTray("running", open.kind, remaining, taskTitle);
  },

  refreshSettings: async () => {
    if (isDemoMode()) {
      const cur = get();
      if (cur.status === "idle") set({ remainingSec: durFor(cur.kind, cur) });
      return;
    }
    const all: Record<string, string> = await getAllSettings().catch(() => ({}));
    const num = (k: string, fb: number) => {
      const n = Number(all[k]);
      return Number.isFinite(n) && n > 0 ? n : fb;
    };
    const workMin = num("work_min", 25);
    const breakMin = num("break_min", 5);
    const soundOn = (all.sound_on ?? "1") !== "0";
    const soundPreset = all.sound_preset || "alarm";
    const volume = Math.min(1, Math.max(0, Number(all.volume ?? 0.7) || 0));
    const autoStartBreaks = (all.auto_start_breaks ?? "0") === "1";
    const autoStartWork = (all.auto_start_work ?? "0") === "1";
    const targetWorkHours = num("target_work_hours", 4);
    const targetChanged = get().targetWorkHours !== targetWorkHours;
    set({ workMin, breakMin, soundOn, soundPreset, volume, autoStartBreaks, autoStartWork, targetWorkHours });
    if (get().status === "idle") set({ remainingSec: durFor(get().kind, { workMin, breakMin }) });
    if (targetChanged && get().hydrated) await get().refreshStreak();
  },

  start: async (kind, taskId) => {
    const s = get();
    if (s.status === "running") return;
    const k = kind ?? s.kind;
    const tid = taskId !== undefined ? taskId : s.taskId;
    const secs = durFor(k, s);
    const now = Date.now();
    const endAt = now + secs * 1000;
    const title = tid != null ? await resolveTaskTitle(tid, s.taskTitle) : s.taskTitle;
    const id = await dbCreateSession({
      task_id: tid,
      kind: k,
      status: "running",
      started_at: new Date(now).toISOString(),
      end_at: new Date(endAt).toISOString(),
      planned_duration_sec: secs,
    });
    set({ status: "running", kind: k, sessionId: id, taskId: tid, taskTitle: title, endAt, remainingSec: secs, notice: "" });
    if (s.soundOn) await playCue("start", s.volume);
    await pushTray("running", k, secs, title);
  },

  pause: async () => {
    const s = get();
    if (s.status !== "running" || s.sessionId == null) return;
    const remaining = Math.max(0, Math.round((s.endAt - Date.now()) / 1000));
    await dbUpdateSession(s.sessionId, {
      status: "paused",
      paused_remaining_sec: remaining,
      end_at: new Date().toISOString(),
    });
    set({ status: "paused", remainingSec: remaining, endAt: 0 });
    if (s.soundOn) await playCue("pause", s.volume);
    await pushTray("paused", s.kind, remaining, s.taskTitle);
  },

  resume: async () => {
    const s = get();
    if (s.status !== "paused" || s.sessionId == null) return;
    const endAt = Date.now() + s.remainingSec * 1000;
    await dbUpdateSession(s.sessionId, {
      status: "running",
      paused_remaining_sec: null,
      end_at: new Date(endAt).toISOString(),
    });
    set({ status: "running", endAt });
    if (s.soundOn) await playCue("resume", s.volume);
    await pushTray("running", s.kind, s.remainingSec, s.taskTitle);
  },

  toggle: async () => {
    const s = get();
    if (s.status === "running") await s.pause();
    else if (s.status === "paused") await s.resume();
    else await s.start();
  },

  skip: async () => {
    const s = get();
    if (s.sessionId != null) {
      await dbUpdateSession(s.sessionId, { status: "abandoned", completed_at: nowIso() });
    }
    const nk = nextKindAfter(s.kind);
    set({
      status: "idle",
      kind: nk,
      sessionId: null,
      remainingSec: durFor(nk, s),
      notice: `Skipped ${s.kind.replace("_", " ")}.`,
    });
    await pushTray("idle", nk, 0, "");
  },

  skipBreak: async () => {
    const s = get();
    if (s.sessionId != null && (s.kind === "break" || s.kind === "short_break" || s.kind === "long_break")) {
      await dbUpdateSession(s.sessionId, { status: "abandoned", completed_at: nowIso() });
    }
    const secs = s.workMin * 60;
    set({
      status: "idle",
      kind: "work",
      sessionId: null,
      remainingSec: secs,
      notice: "Break skipped. Ready for focus session.",
    });
    await pushTray("idle", "work", 0, "");
  },

  reset: async () => {
    const s = get();
    if (s.sessionId != null) {
      await dbUpdateSession(s.sessionId, { status: "abandoned", completed_at: nowIso() });
    }
    const secs = s.workMin * 60;
    const alreadyClean = s.status === "idle" && s.kind === "work" && s.remainingSec === secs;
    set({
      status: "idle",
      kind: "work",
      sessionId: null,
      remainingSec: secs,
      notice: alreadyClean ? "" : "Timer reset. Ready for focus session.",
      endAt: 0,
    });
    await pushTray("idle", "work", 0, "");
  },

  tick: async () => {
    const s = get();
    if (!s.hydrated || s.status !== "running" || completing) {
      if (s.status === "running") {
        const remaining = Math.max(0, Math.round((s.endAt - Date.now()) / 1000));
        if (remaining !== s.remainingSec) set({ remainingSec: remaining });
        await pushTray("running", s.kind, remaining, s.taskTitle);
      }
      return;
    }
    const remaining = Math.max(0, Math.round((s.endAt - Date.now()) / 1000));
    if (remaining !== s.remainingSec) set({ remainingSec: remaining });
    await pushTray("running", s.kind, remaining, s.taskTitle);
    if (Date.now() < s.endAt) return;
    completing = true;
    try {
      const cur = get();
      if (cur.sessionId != null) {
        await dbUpdateSession(cur.sessionId, { status: "completed", completed_at: nowIso() });
      }
      const nk = nextKindAfter(cur.kind);
      const label = cur.kind === "work" ? "Work session complete" : "Break over";
      if (cur.soundOn) await playCue("end", cur.volume, cur.soundPreset);
      await notifySessionEnd(label, cur.taskTitle ? cur.taskTitle : cur.kind === "work" ? "Take a break." : "Back to work.");
      const shouldAuto = cur.kind === "work" ? cur.autoStartBreaks : cur.autoStartWork;
      if (shouldAuto) {
        const secs = durFor(nk, cur);
        const now = Date.now();
        const endAt = now + secs * 1000;
        const id = await dbCreateSession({
          task_id: nk === "work" ? cur.taskId : null,
          kind: nk,
          status: "running",
          started_at: new Date(now).toISOString(),
          end_at: new Date(endAt).toISOString(),
          planned_duration_sec: secs,
        });
        set({
          status: "running",
          kind: nk,
          sessionId: id,
          taskId: nk === "work" ? cur.taskId : null,
          endAt,
          remainingSec: secs,
          notice: label,
        });
        await get().refreshStreak();
        await pushTray("running", nk, secs, nk === "work" ? cur.taskTitle : "");
      } else {
        set({
          status: "idle",
          kind: nk,
          sessionId: null,
          remainingSec: durFor(nk, cur),
          notice: label,
          endAt: 0,
        });
        await get().refreshStreak();
        await pushTray("idle", nk, 0, "");
      }
    } finally {
      completing = false;
    }
  },

  setTask: async (taskId) => {
    const s = get();
    const title = taskId != null ? await resolveTaskTitle(taskId, "") : "";
    if (s.sessionId != null && (s.status === "running" || s.status === "paused")) {
      await dbUpdateSession(s.sessionId, { task_id: taskId });
    }
    set({ taskId, taskTitle: title });
    await pushTray(s.status, s.kind, s.remainingSec, title);
  },

  dismissNotice: () => set({ notice: "" }),
}));
