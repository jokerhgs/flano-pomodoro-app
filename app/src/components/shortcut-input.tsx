import { useState, useRef, useCallback } from "react";

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

const KEY_MAP: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "Space",
};

function toTauriShortcut(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("CommandOrControl");

  let key = e.key;
  if (KEY_MAP[key]) {
    key = KEY_MAP[key];
  } else if (key.length === 1) {
    key = key.toUpperCase();
  }

  if (MODIFIER_KEYS.has(key)) return null;
  parts.push(key);
  return parts.join("+");
}

function formatShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((p) => {
      if (p === "CommandOrControl") return "⌘";
      if (p === "Control") return "Ctrl";
      if (p === "Alt") return "Alt";
      if (p === "Shift") return "Shift";
      if (p === "Space") return "Space";
      return p;
    })
    .join(" + ");
}

interface ShortcutInputProps {
  value: string;
  onChange: (shortcut: string) => void;
}

export function ShortcutInput({ value, onChange }: ShortcutInputProps) {
  const [listening, setListening] = useState(false);
  const pendingRef = useRef(false);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setListening(false);
        return;
      }

      if (MODIFIER_KEYS.has(e.key)) return;

      const shortcut = toTauriShortcut(e.nativeEvent);
      if (!shortcut) return;

      e.preventDefault();
      pendingRef.current = true;
      onChange(shortcut);
      setListening(false);
    },
    [onChange],
  );

  return (
    <div className="relative mt-1">
      <input
        readOnly
        tabIndex={0}
        value={listening ? "Press keys…" : formatShortcut(value)}
        onFocus={() => {
          pendingRef.current = false;
          setListening(true);
        }}
        onBlur={() => {
          if (!pendingRef.current) setListening(false);
        }}
        onKeyDown={handleKeyDown}
        className={`w-full cursor-pointer rounded-lg border bg-background px-3 py-2 text-sm font-mono transition-colors ${
          listening
            ? "border-primary ring-1 ring-primary/30 text-muted-foreground"
            : "border-border text-foreground hover:border-border/80"
        }`}
      />
    </div>
  );
}
