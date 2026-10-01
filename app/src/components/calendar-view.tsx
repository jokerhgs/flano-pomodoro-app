import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTasks } from "../stores/tasks";
import { addMonths, fmtMonthYear, getMonthGrid, todayKey, type CalendarCell } from "../lib/time";
import { parseRecurrence, dateMatchesRecurrence, type TaskRow } from "../lib/db/schema";
import { CalendarDayPanel } from "./calendar-day-panel";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView() {
  const { all, projects } = useTasks();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const cells = useMemo(() => getMonthGrid(year, month), [year, month]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const cell of cells) {
      const cellDate = cell.date;
      const list: TaskRow[] = [];
      for (const t of all) {
        if (t.status === "archived") continue;
        const matchesDue = t.due_date === cellDate;
        let matchesRec = false;
        if (t.recurrence) {
          const rule = parseRecurrence(t.recurrence);
          if (rule && dateMatchesRecurrence(cellDate, rule, t.created_at)) {
            matchesRec = true;
          }
        }
        if (matchesDue || matchesRec) {
          list.push(t);
        }
      }
      if (list.length > 0) {
        map.set(cellDate, list);
      }
    }
    return map;
  }, [all, cells]);

  const prev = () => {
    const { year: y, month: m } = addMonths(year, month, -1);
    setYear(y);
    setMonth(m);
  };

  const next = () => {
    const { year: y, month: m } = addMonths(year, month, 1);
    setYear(y);
    setMonth(m);
  };

  const goToday = () => {
    const d = new Date();
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelectedDate(todayKey());
  };

  const selectedTasks = selectedDate ? tasksByDate.get(selectedDate) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="rounded-lg border border-border p-2 hover:bg-muted" title="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="min-w-[180px] text-center text-lg font-semibold">{fmtMonthYear(year, month)}</h2>
          <button onClick={next} className="rounded-lg border border-border p-2 hover:bg-muted" title="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button onClick={goToday} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
          Today
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => (
          <CalendarDayCell
            key={cell.date}
            cell={cell}
            tasks={tasksByDate.get(cell.date) ?? []}
            projects={projects}
            isSelected={selectedDate === cell.date}
            onSelect={setSelectedDate}
          />
        ))}
      </div>

      {selectedDate && (
        <CalendarDayPanel
          date={selectedDate}
          tasks={selectedTasks}
          projects={projects}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}

function CalendarDayCell({
  cell,
  tasks,
  projects,
  isSelected,
  onSelect,
}: {
  cell: CalendarCell;
  tasks: TaskRow[];
  projects: { id: number; color: string | null }[];
  isSelected: boolean;
  onSelect: (date: string) => void;
}) {
  const maxDots = 3;
  const shown = tasks.slice(0, maxDots);
  const overflow = tasks.length - maxDots;

  const findColor = (projectId: number | null) => {
    if (projectId == null) return "#666";
    return projects.find((p) => p.id === projectId)?.color ?? "#666";
  };

  return (
    <button
      onClick={() => onSelect(cell.date)}
      className={`relative flex min-h-[5.5rem] flex-col rounded-xl border p-2 text-left transition-colors ${
        isSelected
          ? "border-primary/50 bg-primary/10"
          : cell.isToday
            ? "border-primary/40 bg-primary/5"
            : "border-border bg-background hover:bg-muted/50"
      } ${!cell.isCurrentMonth ? "opacity-40" : ""}`}
    >
      <span
        className={`text-sm ${
          cell.isToday ? "font-bold text-primary" : cell.isCurrentMonth ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {cell.day}
      </span>
      {tasks.length > 0 && (
        <div className="mt-auto flex flex-wrap items-center gap-1">
          {shown.map((t) => (
            <span
              key={t.id}
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: findColor(t.project_id) }}
              title={t.title}
            />
          ))}
          {overflow > 0 && <span className="text-[10px] text-muted-foreground">+{overflow}</span>}
        </div>
      )}
    </button>
  );
}
