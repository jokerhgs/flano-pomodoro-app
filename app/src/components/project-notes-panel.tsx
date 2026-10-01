import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { useTasks } from "../stores/tasks";
import type { ProjectRow } from "../lib/db/schema";
import { ProjectIcon } from "./project-icon";

const WIDTH_KEY = "flano:notes-panel-width";
const DEFAULT_WIDTH = 416;
const MIN_WIDTH = 320;

const clampWidth = (w: number) => {
  const max = typeof window === "undefined" ? 1200 : window.innerWidth * 0.85;
  return Math.min(Math.max(Math.round(w), MIN_WIDTH), Math.floor(max));
};

const readWidth = () => {
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY);
    if (raw == null) return DEFAULT_WIDTH;
    return clampWidth(Number(raw) || DEFAULT_WIDTH);
  } catch {
    return DEFAULT_WIDTH;
  }
};

export function ProjectNotesPanel({ project, onClose }: { project: ProjectRow; onClose: () => void }) {
  const editProject = useTasks((s) => s.editProject);

  const [draft, setDraft] = useState(project.notes ?? "");
  const [status, setStatus] = useState<"saving" | "saved" | "">("");
  const [closing, setClosing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [width, setWidth] = useState(() => readWidth());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setDraft(project.notes ?? "");
    setStatus("");
  }, [project.id]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const persist = async (value: string) => {
    await editProject(project.id, { notes: value.trim() === "" ? null : value });
    setStatus("saved");
  };

  const handleChange = (value: string) => {
    setDraft(value);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(value), 600);
  };

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      void persist(draft);
    }
  };

  const requestClose = () => {
    if (closing) return;
    flush();
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 200);
  };

  const handleResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startWidth: width };
    setIsResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setWidth(clampWidth(drag.current.startWidth + drag.current.startX - e.clientX));
  };

  const handleResizeEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const final = clampWidth(drag.current.startWidth + drag.current.startX - e.clientX);
    drag.current = null;
    setIsResizing(false);
    setWidth(final);
    try {
      window.localStorage.setItem(WIDTH_KEY, String(final));
    } catch {
      // width persistence is best-effort
    }
  };

  const resetWidth = () => {
    setWidth(DEFAULT_WIDTH);
    try {
      window.localStorage.removeItem(WIDTH_KEY);
    } catch {
      // width persistence is best-effort
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-end bg-black/40 ${closing ? "animate-[fade-out_200ms_ease-in]" : "animate-[fade-in_200ms_ease-out]"}`}
      onClick={requestClose}
    >
      <div
        className={`relative flex h-full w-full max-w-[85vw] flex-col border-l border-border bg-card p-5 ${closing ? "animate-[slide-out-right_200ms_ease-in]" : "animate-[slide-in-right_250ms_ease-out]"}`}
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize notes panel"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={typeof window === "undefined" ? 1200 : Math.floor(window.innerWidth * 0.85)}
          aria-valuenow={Math.round(width)}
          title="Drag to resize • double-click to reset"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          onDoubleClick={resetWidth}
          className={`group absolute top-0 -left-1 flex h-full w-2 cursor-ew-resize touch-none items-center justify-center bg-transparent ${isResizing ? "bg-primary/30" : "hover:bg-primary/30"}`}
        >
          <div className="flex flex-col items-center gap-1 rounded-full bg-card px-0.5 py-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1 w-1 rounded-full ${isResizing ? "bg-primary" : "bg-muted-foreground/60 group-hover:bg-primary"}`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 text-white"
              style={{ background: project.color ?? "#1f8a9e" }}
            >
              <ProjectIcon icon={project.icon} className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold">{project.name}</h3>
              <p className="text-xs text-muted-foreground">
                Notes
                {status === "saving" && " • Saving…"}
                {status === "saved" && " • Saved"}
              </p>
            </div>
          </div>
          <button onClick={requestClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <textarea
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={flush}
          placeholder="Scratch notes for this project…"
          className="mt-4 min-h-0 flex-1 resize-none rounded-xl border border-border bg-background p-3 text-sm leading-relaxed text-foreground flano-scroll"
        />
      </div>
    </div>
  );
}
