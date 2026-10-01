# Flano

An offline Pomodoro timer and today list for the desktop. Focus sessions, a
recurring-task-aware queue, and stats — all in a local SQLite file, no account
and no network calls.

## Tech Stack

| Component | Version | Role |
|---|---|---|
| [Tauri](https://tauri.app) | 2 | Desktop runtime with native capabilities |
| [React](https://react.dev) | 19 | UI framework |
| [Vite](https://vite.dev) | 8 | Build tool and dev server |
| [TypeScript](https://typescriptlang.org) | 6 | Type safety |
| [Tailwind CSS](https://tailwindcss.com) | 4 | Utility-first CSS |
| [Zustand](https://zustand-demo.pmnd.rs) | 5 | State management |
| [SQLite](https://sqlite.org) | — | Local database via `tauri-plugin-sql` |
| [Kysely](https://kysely.dev) | 0.29 | Type-safe query builder via `kysely-dialect-tauri` |
| [Lucide React](https://lucide.dev) | 1 | Icon library |

## Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- [Rust](https://rustup.rs) (latest stable)
- [pnpm](https://pnpm.io) (v10+)

## Getting Started

```bash
git clone <your-repo-url>
cd flano
pnpm install
pnpm tauri dev
```

## Project Structure

```
flano/
├── app/                  # Desktop app (pnpm workspace member)
│   ├── src/              # React frontend (components, stores, lib)
│   ├── src-tauri/        # Rust backend (tray, shortcuts, commands)
│   ├── scripts/seed.js   # Demo data seeder
│   └── package.json      # Frontend deps and scripts
├── website/              # Static marketing site → Cloudflare Pages
├── motion/               # Motion tokens shared by app + website
└── package.json          # Root orchestrator (delegates to app/)
```

## Scripts

Run from the repo root — the root `package.json` delegates into `app/`.

| Command | Description |
|---|---|
| `pnpm dev` | Start Vite dev server (web preview only — no database) |
| `pnpm tauri dev` | Start full Tauri dev mode (Rust + frontend) |
| `pnpm tauri build` | Build production binary |
| `pnpm build` | Build frontend only (`tsc && vite build`) → `app/dist` |
| `pnpm db:seed` | Seed demo data into `app.db` |
| `pnpm install` | Workspace install |

## Website

`website/` is a self-contained static site (no build step) deployed with
Cloudflare Pages:

```bash
npx wrangler pages deploy website --project-name=flano
```

## Database

SQLite is pre-configured via `tauri-plugin-sql`. The database file `app.db` is created at runtime in the app's data directory.

Kysely is set up with `kysely-dialect-tauri` to provide a type-safe query layer on top of tauri-plugin-sql. See the [kysely-dialect-tauri docs](https://github.com/nicolo-ribaudo/kysely-dialect-tauri) for usage examples.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
