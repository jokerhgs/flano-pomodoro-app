import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";

export { unregisterAll };

/** True when running inside the Tauri desktop runtime (SQLite, tray, shortcuts available). */
export function isTauri(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return w.__TAURI_INTERNALS__ !== undefined || w.__TAURI__ !== undefined;
}

export async function ensureNotifyPermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    const res = await requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

export async function notifySessionEnd(title: string, body: string): Promise<void> {
  try {
    if (!(await ensureNotifyPermission())) return;
    await sendNotification({ title, body });
  } catch {
    // notifications are best-effort offline
  }
}

export async function updateTray(title: string, tooltip: string): Promise<void> {
  try {
    await invoke("set_tray_status", { title, tooltip });
  } catch {
    // ignore when running in plain web dev
  }
}

export function onTrayToggle(cb: () => void): Promise<() => void> {
  return listen("flano:tray-toggle", () => cb()).then((un) => un);
}

export function onTraySkip(cb: () => void): Promise<() => void> {
  return listen("flano:tray-skip", () => cb()).then((un) => un);
}

export async function reregisterShortcut(shortcut: string): Promise<boolean> {
  try {
    await unregisterAll();
  } catch {
    // ignore
  }
  try {
    await register(shortcut, (e) => {
      if (e.state === "Pressed") {
        window.dispatchEvent(new CustomEvent("flano:shortcut-toggle"));
      }
    });
    return true;
  } catch {
    // fall back to default
    try {
      await register("CommandOrControl+Shift+P", (e) => {
        if (e.state === "Pressed") window.dispatchEvent(new CustomEvent("flano:shortcut-toggle"));
      });
    } catch {
      // ignore
    }
    return false;
  }
}
