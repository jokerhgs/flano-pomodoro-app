# AGENTS.md — Flano Codebase Context

## Project Overview

Flano is an **offline Pomodoro timer & todo list desktop application**. No network dependencies, no cloud sync — everything runs locally on the user's machine.

### Tech Stack

| Layer            | Tech         | Version                       |
| ---------------- | ------------ | ----------------------------- |
| Desktop runtime  | Tauri        | 2                             |
| Frontend         | React        | 19                            |
| Language         | TypeScript   | 6 (strict)                    |
| Build tool       | Vite         | 8                             |
| Package manager  | pnpm         | v10+                          |
| Styling          | Tailwind CSS | 4                             |
| State management | Zustand      | 5                             |
| Database         | SQLite       | via `tauri-plugin-sql`        |
| Query builder    | Kysely       | 0.29 (`kysely-dialect-tauri`) |
| Icons            | Lucide React | 1                             |
| Backend          | Rust         | 2021 edition                  |

## Updating This File

When making changes to the codebase, keep this file in sync:

- **New files** — add to Directory Structure tree with a brief comment
- **Renamed files** — update paths in Directory Structure and File Naming
- **Deleted files** — remove from Directory Structure
- **New patterns or conventions** — update Coding Conventions
- **Schema changes** — update Database Schema
- **New dependencies** — update Tech Stack table

## Architecture

- **Tauri 2** wraps a React SPA in a native window with Rust-powered system tray, global shortcuts, notifications, and file dialogs.
- **SQLite** is the sole data store (`app.db`), accessed through Kysely for type-safe queries.
- **Zustand** stores (timer, tasks, settings) drive the UI; they read/write SQLite on state changes.
- **Demo mode** — when running in a plain browser (no Tauri runtime), the app switches to in-memory state via `isDemoMode()` in `app/src/lib/demo.ts`. All DB-touching code must check this.

## Directory Structure

```
flano/
├── app/                          # Desktop app (pnpm workspace member, self-contained)
│   ├── src/                      # React frontend
│   ├── app.tsx                   # Root: sidebar nav + tab routing (timer/today/projects/calendar/stats/settings)
│   ├── app.css                   # Tailwind entry + shadcn-style CSS variables (dark theme)
│   ├── main.tsx                  # React entry, loads Manrope font
│   ├── components/
│   │   ├── sidebar.tsx           # Left nav with timer status widget
│   │   ├── timer-card.tsx        # Pomodoro timer with SVG progress ring
│   │   ├── today-list.tsx        # Today queue: add/reorder/complete tasks
│   │   ├── projects.tsx          # Project CRUD + task management
│   │   ├── project-notes-panel.tsx # Slide-in notes scratchpad per project
│   │   ├── calendar-view.tsx     # Month grid with task dots and date selection
│   │   ├── calendar-day-panel.tsx # Slide-in panel for day tasks with promote action
│   │   ├── stats-panel.tsx       # Stats: bar chart, averages, project breakdown
│   │   ├── settings-panel.tsx    # Settings: durations, sounds, shortcut, backup
│   │   └── page-header.tsx       # Reusable header (title + description)
│   ├── hooks/
│   │   └── use-timer-ticker.ts   # 500ms interval calling timer.tick()
│   ├── lib/
│   │   ├── os.ts                 # Tauri IPC: isTauri(), notifications, tray, shortcuts, event listeners
│   │   ├── sound.ts              # WebAudio oscillator sounds (alarm/digital/chime/gong)
│   │   ├── time.ts               # Date/time utilities (ISO, clock format, day labels, calendar grid)
│   │   ├── demo.ts               # In-memory sample data for browser preview
│   │   └── db/
│   │       ├── client.ts         # Kysely singleton (TauriSqliteDialect, foreign_keys=ON)
│   │       ├── schema.ts         # TS types for all tables + DEFAULT_SETTINGS
│   │       ├── migrations.ts     # V1 migration: create tables + indexes + seed defaults
│   │       └── repo/
│   │           ├── projects.ts   # Project CRUD
│   │           ├── tasks.ts      # Task CRUD, today queue, reorder
│   │           ├── sessions.ts   # Pomodoro sessions, stats queries
│   │           ├── settings.ts   # Key-value settings (getAll, get, set with upsert)
│   │           └── backup.ts     # Full DB export/import as JSON
│   └── stores/
│       ├── timer.ts              # Timer lifecycle: start/pause/resume/skip/tick/hydrate
│       ├── tasks.ts              # Projects + today queue + all tasks
│       ├── settings.ts           # Settings values, save with side effects
│       └── ui.ts                 # Modal visibility flags (project/task modals) + notes panel project
│   ├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── main.rs               # Entry: calls flano_lib::run()
│   │   └── lib.rs                # Tauri setup: plugins, tray, global shortcuts, commands
│   ├── capabilities/default.json # Permission capabilities
│   ├── tauri.conf.json           # App config (window, plugins, bundle)
│   └── Cargo.toml                # Rust deps (tauri, plugins, serde)
│   ├── public/                   # Static assets (logo.jpg, sounds/)
│   ├── scripts/seed.js           # SQLite seeder for demo data (pnpm db:seed)
│   ├── index.html                # HTML entry point
│   ├── vite.config.ts            # Vite: React + Tailwind plugins, port 1420
│   ├── package.json              # Frontend deps and scripts
│   └── tsconfig.json             # TS strict config
├── website/                      # Static marketing site (wrangler pages deploy)
│   ├── index.html                # Single-file landing page, inline CSS
│   ├── fonts/                    # Self-hosted Manrope woff2 (400/600/700/800)
│   ├── logo.jpg
│   └── robots.txt
├── motion/                       # Motion design tokens shared by app + website
│   ├── tokens.css                # Durations + easings as CSS vars
│   └── README.md                 # Usage rules
├── package.json                  # Root orchestrator: delegates scripts to app/
└── pnpm-workspace.yaml           # packages: ["app"]
```

## Monorepo Layout

Three separated concerns:

| Folder     | Concern                     | Deployed as             |
| ---------- | --------------------------- | ----------------------- |
| `app/`     | Tauri desktop application   | Bundled `.exe` / `.msi` |
| `website/` | Static marketing site       | `wrangler pages deploy website` |
| `motion/`  | Shared motion design tokens | Consumed via `@import`  |

- `app/` is the **only pnpm workspace member** holding real deps. The root `package.json` is `private` and purely delegates — `pnpm dev`, `pnpm build`, `pnpm tauri`, and `pnpm db:seed` all work from the repo root.
- `app/` is **self-contained**: nothing inside it reaches outside its folder except `app.css` importing `../../motion/tokens.css`.
- `pnpm-workspace.yaml` makes the repo root Vite's `fs.allow` scope, which is what allows `motion/` to be imported.

## Database Schema

5 tables, all with plain auto-increment INTEGER ids (offline only, no UUID/sync):

| Table               | Purpose                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects`          | name, color, icon (V3), description (V3), notes scratchpad (V6), archived flag, timestamps                                                            |
| `tasks`             | title, project_id (nullable), status (todo/doing/done/archived), due_date, estimated_pomodoros, on_today, today_order                                |
| `pomodoro_sessions` | task_id, kind (work/break/short_break/long_break), status (running/paused/completed/interrupted/abandoned), started_at, end_at, paused_remaining_sec, planned_duration_sec (V7, caps stats so paused/away wall-time can't inflate them) |
| `settings`          | Key-value store (work_min, break_min, sound_on, sound_preset, volume, global_shortcut, etc.)                                                         |
| `schema_migrations` | Version tracking                                                                                                                                     |

Types in `app/src/lib/db/schema.ts`. Migrations in `app/src/lib/db/migrations.ts` (currently V1–V7).

## Key Data Flows

### Timer Lifecycle

1. `timer.start()` — creates a `pomodoro_sessions` row (status=running), sets endAt
2. `useTimerTicker` — 500ms interval calls `timer.tick()`, checks if endAt reached
3. On completion — updates session status, recomputes daily streak (consecutive target-met work days via `getWorkStreak`), sends tray update + notification, auto-starts next session if enabled
4. `timer.hydrate()` — on app boot, recovers any open session from SQLite

### Session Persistence

Running/paused sessions survive app restarts. `hydrate()` checks for open sessions and resumes with corrected remaining time.

### Settings Side Effects

When settings save, they trigger side effects:

- Timer-related keys → `useTimer.getState().refreshSettings()`
- `global_shortcut` → `reregisterShortcut()` via Tauri global-shortcut plugin

### Tray Integration

Rust builds a system tray with menu items (Show, Start/Pause, Skip, Quit). Clicks emit Tauri events (`flano:tray-toggle`, `flano:tray-skip`) that the frontend listens to via `lib/os.ts`.

## Coding Conventions

### React

- **Functional components only**, no class components
- **Named exports** (e.g. `export function TimerCard()`)
- Hooks for side effects, no `componentDidMount` patterns
- Component files are one component per file, colocated with the component

### State Management (Zustand)

```typescript
export const useStoreName = create<StoreState>()((set, get) => ({
  // state + actions in single object
}));
```

- Stores accessed via `useStoreName()` in components (hook) or `useStoreName.getState()` outside React
- Each store in its own file under `app/src/stores/`
- Domain types (SessionKind, TaskStatus, etc.) defined in `app/src/lib/db/schema.ts`

### TypeScript

- **Strict mode** enabled with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- Explicit interface definitions for all store states
- Type exports for domain types (`SessionKind`, `TaskStatus`, `SessionStatus`)

### Database Access

- **Repo pattern** — each table has a repo file in `app/src/lib/db/repo/`
- Kysely query builder for application queries whenever practical
- Raw SQL is reserved for migrations/DDL and SQLite-specific expressions that are awkward to express with the builder
- The Tauri Kysely dialect client in `app/src/lib/db/client.ts` must classify raw `SELECT`, `WITH`, and `PRAGMA` statements through `isQuery`; otherwise row-returning raw SQL can be treated as a write and return no rows
- Client singleton in `app/src/lib/db/client.ts` with `foreign_keys=ON`
- All repo functions are async, called from Zustand stores or components

### Styling

- **Tailwind utility classes** inline on JSX elements
- **shadcn-style CSS variables** in `app.css`: `--background`, `--foreground`, `--primary`, `--card`, `--border`, `--muted-foreground`, etc.
- **Dark theme only** — no light mode, no theme toggle
- Font: Manrope (self-hosted via `@fontsource/manrope`)
- Responsive via `sm:` breakpoints (min 900x600 window)

### Tauri IPC

- `invoke()` for calling Rust commands (wrapped in `lib/os.ts`)
- `listen()` for receiving events from Rust (tray, shortcuts)
- All Tauri calls wrapped in try/catch with silent fallbacks — the app must not crash when running outside Tauri

### Error Handling

- **Silent fallbacks** for non-critical features (notifications, tray updates)
- `.catch(() => defaultValue)` pattern for DB queries that may fail on first run
- `isTauri()` / `isDemoMode()` guards before any native API calls
- No error boundaries visible — errors are caught locally

### Demo Mode

- `isDemoMode()` returns `!isTauri()` — true in plain browser
- Every DB-touching path must check `isDemoMode()` and use in-memory data from `demo.ts`
- Demo state lives inline in the stores — `app/src/lib/demo.ts` only exports `isDemoMode()`, and browser preview starts empty
- Stores (e.g. `settings.ts`, `tasks.ts`) have demo branches at the top of each method

### File Naming

- All files: kebab-case (`timer-card.tsx`, `use-timer-ticker.ts`)
- Exported component/function names: PascalCase (`export function TimerCard()`)
- Lib/utilities: kebab-case (`os.ts`, `time.ts`, `sound.ts`)
- DB repos: kebab-case table name (`projects.ts`, `tasks.ts`)
- Stores: kebab-case (`timer.ts`, `tasks.ts`, `settings.ts`)

### Code Style

- **No comments** in code (matching existing convention)
- Semicolons used
- Double quotes for strings
- 2-space indentation
- Trailing commas

## Development Commands

All commands run from the **repo root** (the root `package.json` delegates into `app/`), or directly from `app/` if you prefer.

| Command            | What it does                                           |
| ------------------ | ------------------------------------------------------ |
| `pnpm dev`         | Vite dev server on port 1420 (web preview only, no DB) |
| `pnpm tauri dev`   | Full Tauri dev mode (Rust + frontend hot reload)       |
| `pnpm tauri build` | Production binary build                                |
| `pnpm build`       | Frontend only (`tsc && vite build`), output `app/dist` |
| `pnpm db:seed`     | Seed demo data into `app.db` via `app/scripts/seed.js` |
| `pnpm install`     | Workspace install (always from the repo root)          |

Website deploy:

| Command                                        | What it does                    |
| ---------------------------------------------- | ------------------------------- |
| `npx wrangler pages deploy website --project-name=flano` | Deploy `website/` to Cloudflare Pages |

## Rust Backend

`app/src-tauri/src/lib.rs` sets up:

- **Plugins**: opener, sql, notification, dialog, fs, global-shortcut
- **Commands**: `set_tray_status`
- **System tray**: Show, Start/Pause, Skip, Quit menu items
- **Global shortcut**: `CommandOrControl+Shift+P` (toggle timer)
- **Window close**: intercepted to hide instead of quit

Release profile: full LTO, single codegen unit, strip symbols, panic=abort.
