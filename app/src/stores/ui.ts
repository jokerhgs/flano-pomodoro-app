import { create } from "zustand";

interface UIState {
  projectModalOpen: boolean;
  taskModalOpen: boolean;
  notesPanelProjectId: number | null;
  setProjectModalOpen: (open: boolean) => void;
  setTaskModalOpen: (open: boolean) => void;
  setNotesPanelProjectId: (id: number | null) => void;
}

export const useUI = create<UIState>()((set) => ({
  projectModalOpen: false,
  taskModalOpen: false,
  notesPanelProjectId: null,
  setProjectModalOpen: (open) => set({ projectModalOpen: open }),
  setTaskModalOpen: (open) => set({ taskModalOpen: open }),
  setNotesPanelProjectId: (id) => set({ notesPanelProjectId: id }),
}));
