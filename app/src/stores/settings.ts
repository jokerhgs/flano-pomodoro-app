import { create } from "zustand";
import { getAllSettings, setSetting } from "../lib/db/repo/settings";
import { DEFAULT_SETTINGS } from "../lib/db/schema";
import { useTimer } from "./timer";
import { isTauri, reregisterShortcut } from "../lib/os";
import { isDemoMode } from "../lib/demo";

interface SettingsState {
  values: Record<string, string>;
  loaded: boolean;
  load: () => Promise<void>;
  save: (key: string, value: string) => Promise<void>;
}

export const useSettings = create<SettingsState>()((set, get) => ({
  values: { ...DEFAULT_SETTINGS },
  loaded: false,
  load: async () => {
    if (isDemoMode()) {
      set({ values: { ...DEFAULT_SETTINGS }, loaded: true });
      return;
    }
    const all = await getAllSettings().catch(() => ({}));
    set({ values: { ...DEFAULT_SETTINGS, ...all }, loaded: true });
  },
  save: async (key, value) => {
    if (!isDemoMode()) {
      await setSetting(key, value);
    }
    set({ values: { ...get().values, [key]: value } });
    if (
      key === "work_min" ||
      key === "sound_on" ||
      key === "volume" ||
      key === "auto_start_breaks" ||
      key === "auto_start_work"
    ) {
      await useTimer.getState().refreshSettings();
    }
    if (key === "global_shortcut" && isTauri()) {
      await reregisterShortcut(value || DEFAULT_SETTINGS.global_shortcut);
    }
  },
}));
