import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useSettings } from "../stores/settings";
import { exportAll, importAll, clearAllData, type BackupDump } from "../lib/db/repo/backup";
import { useTasks } from "../stores/tasks";
import { useTimer } from "../stores/timer";
import { playCue } from "../lib/sound";
import { isDemoMode } from "../lib/demo";
import { ShortcutInput } from "./shortcut-input";

function Num({ k, label, min = 1, max = 120 }: { k: string; label: string; min?: number; max?: number }) {
  const values = useSettings((s) => s.values);
  const saveFn = useSettings((s) => s.save);
  return (
    <label className="flex items-center justify-between gap-2 text-sm text-foreground">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={values[k] ?? ""}
        onChange={(e) => {
          void saveFn(k, e.target.value).then(() => useTimer.getState().refreshSettings());
        }}
        className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-right"
      />
    </label>
  );
}

function Toggle({ k, label }: { k: string; label: string }) {
  const values = useSettings((s) => s.values);
  const saveFn = useSettings((s) => s.save);
  const on = (values[k] ?? "0") === "1";
  return (
    <label className="flex items-center justify-between gap-2 text-sm text-foreground">
      <span>{label}</span>
      <button
        onClick={() => void saveFn(k, on ? "0" : "1")}
        className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-emerald-500 text-black" : "bg-muted text-foreground"}`}
      >
        {on ? "On" : "Off"}
      </button>
    </label>
  );
}

export function SettingsPanel() {
  const values = useSettings((s) => s.values);
  const saveFn = useSettings((s) => s.save);
  const [msg, setMsg] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const doClearData = async () => {
    setMsg("");
    try {
      await clearAllData();
      await useTasks.getState().load();
      await useTimer.getState().refreshSettings();
      await useSettings.getState().load();
      setShowDeleteModal(false);
      setDeleteConfirmText("");
      setMsg("All local data has been permanently deleted.");
    } catch (e) {
      setMsg(`Deletion failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const doExport = async () => {
    setMsg("");
    if (isDemoMode()) {
      setMsg("Backup needs the desktop app — run pnpm tauri dev. Nothing was exported.");
      return;
    }
    try {
      const dump = await exportAll();
      const path = await save({ defaultPath: `flano-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path) return;
      await writeTextFile(path, JSON.stringify(dump, null, 2));
      setMsg(`Exported to ${path}`);
    } catch (e) {
      setMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const doImport = async () => {
    setMsg("");
    if (isDemoMode()) {
      setMsg("Backup needs the desktop app — run pnpm tauri dev. Nothing was imported.");
      return;
    }
    try {
      const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path || Array.isArray(path)) return;
      const text = await readTextFile(path);
      await importAll(JSON.parse(text) as BackupDump);
      await useTasks.getState().load();
      await useTimer.getState().refreshSettings();
      await useSettings.getState().load();
      setMsg(`Imported from ${path}`);
    } catch (e) {
      setMsg(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">

        <Num k="work_min" label="Work minutes" />
        <Num k="break_min" label="Break minutes" min={1} max={60} />
        <Num k="target_work_hours" label="Target work hours/day" min={1} max={24} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Toggle k="sound_on" label="Sound cue" />
        <Toggle k="shortcut_sound" label="Shortcut sounds" />
        <Toggle k="auto_start_breaks" label="Auto-start breaks" />
        <Toggle k="auto_start_work" label="Auto-start work" />
      </div>
      <div className="mt-3 space-y-3">
        <div className="flex items-center justify-between gap-2 text-sm text-foreground">
          <span>Alarm sound preset</span>
          <div className="flex items-center gap-2">
            <select
              value={values.sound_preset ?? "alarm"}
              onChange={(e) => {
                const val = e.target.value;
                void saveFn("sound_preset", val).then(() => useTimer.getState().refreshSettings());
              }}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="alarm">Alarm Ring</option>
              <option value="digital">Digital Beep</option>
              <option value="chime">Gentle Chime</option>
              <option value="gong">Zen Gong</option>
            </select>
            <button
              onClick={() => void playCue("end", Number(values.volume ?? 0.7), values.sound_preset ?? "alarm")}
              className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-border"
            >
              Test Sound
            </button>
          </div>
        </div>
        <label className="flex items-center justify-between gap-2 text-sm text-foreground">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={Number(values.volume ?? 0.7)}
            onChange={(e) => void saveFn("volume", e.target.value).then(() => useTimer.getState().refreshSettings())}
          />
        </label>
        <label className="block text-sm text-foreground">
          Global shortcut
          <ShortcutInput
            value={values.global_shortcut ?? ""}
            onChange={(v) => void saveFn("global_shortcut", v)}
          />
        </label>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => void doExport()}
          disabled={isDemoMode()}
          title={isDemoMode() ? "Backup needs the desktop app — run pnpm tauri dev" : undefined}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export JSON
        </button>
        <button
          onClick={() => void doImport()}
          disabled={isDemoMode()}
          title={isDemoMode() ? "Backup needs the desktop app — run pnpm tauri dev" : undefined}
          className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          Import JSON
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}

      {/* Danger Zone */}
      <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
        <div className="text-sm font-semibold text-destructive">Danger Zone</div>
        <p className="text-xs text-muted-foreground">
          Permanently delete all local projects, tasks, focus history, and custom settings.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="rounded-lg bg-destructive px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
        >
          Delete All Data
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-destructive/50 bg-card p-5 space-y-4 shadow-2xl max-h-[calc(100vh-2rem)] overflow-y-auto flano-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-base font-bold text-destructive">Delete All Local Data?</h3>
              <p className="text-xs text-muted-foreground">
                This action is permanent and cannot be undone. All your projects, tasks, timer history, and settings will be permanently wiped.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-foreground">
                To confirm, type <span className="font-mono font-bold text-destructive">DELETE</span> below:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:border-destructive"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText("");
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                disabled={deleteConfirmText !== "DELETE"}
                onClick={() => void doClearData()}
                className="rounded-lg bg-destructive px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              >
                Permanently Delete Data
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
