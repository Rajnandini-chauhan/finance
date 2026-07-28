# Finance OS

A personal finance dashboard built with React + Vite. Track accounts, log transactions, and monitor your budget against the 50/30/20 rule — all running client-side with local-storage persistence (with optional Firebase cloud sync).

## Features

- **Dashboard** — net worth overview, monthly salary summary, 50/30/20 budget progress bars (Essentials / Wants / Investments), and a recent activity feed
- **Accounts** — add and remove accounts (bank, cash, card, etc.) with running balances
- **Transactions** — log income/expenses, categorize them, and see them reflected instantly in account balances and budget progress
- **Settings** — configure monthly salary (used to calculate 50/30/20 budget limits) and preferred currency (USD, EUR, GBP, INR)
- **Local-first data** — works fully offline using `localStorage`; no account or backend required
- **Optional cloud sync** — Firebase Auth + Firestore hooks are wired in and will activate automatically if Firebase config is supplied

## Tech Stack

| Layer      | Tool                          |
|------------|-------------------------------|
| Framework  | React 19                      |
| Build tool | Vite 8                        |
| Styling    | Tailwind CSS 4 (`@tailwindcss/vite`) |
| Icons      | lucide-react                  |
| Auth/DB (optional) | Firebase Auth + Firestore |
| Linting    | ESLint 10 (with `eslint-plugin-react-hooks`) |

## Getting Started

### Prerequisites
- Node.js 18+ and npm

### Install
```bash
npm install
```

### Run locally
```bash
npm run dev
```
Then open the URL printed in the terminal (usually `http://localhost:5173`).

On first load you'll land on a login screen — choose **Guest (Local)** to use the app immediately in local-storage mode (no account needed).

### Build for production
```bash
npm run build
```
Output is generated in `dist/`. Preview the production build locally with:
```bash
npm run preview
```

### Lint
```bash
npm run lint
```

## Deploying to Vercel

This is a standard Vite project, so Vercel auto-detects the build settings — no configuration needed.

1. Push this folder's contents to a GitHub repo (or run `vercel` directly from this folder with the Vercel CLI)
2. Import the repo in Vercel, or accept the CLI's defaults
3. Vercel will run `vite build` and serve the `dist/` output automatically

## Project Structure
```
├── index.html          # HTML entry point
├── vite.config.js       # Vite + Tailwind + React plugin config
├── package.json
├── public/               # Static assets (favicon, icons)
└── src/
    ├── main.jsx          # React entry point
    ├── App.jsx           # All app logic, context, and views
    └── index.css         # Tailwind import + base styles
```

`App.jsx` contains everything: a `FinanceProvider` context (state + localStorage/Firebase persistence), the login screen, and the Dashboard / Transactions / Accounts / Settings views. It's currently a single file — a natural next step would be splitting these into separate components as the app grows.

## Cloud Sync (optional)

By default the app runs entirely on `localStorage` and works standalone. To enable real Firebase-backed cloud sync (so data persists across devices/browsers):

1. Create a Firebase project and enable **Authentication** (Email/Password) and **Firestore**
2. Provide your Firebase config to the app via `window.__firebase_config` (a JSON string) before the app loads — for example, injected via an environment variable at build time or a small inline script in `index.html`
3. When a valid config is detected, the app automatically switches from local-storage mode to Firebase Auth + Firestore

Without this, the app is fully functional in **local-only** mode — data just won't sync across devices.

## Known Limitations / Roadmap

- No spending trend chart yet on the Dashboard — a natural next feature (icons/plumbing partially anticipate this)
- Single-file `App.jsx` — fine for now, but should be split into components (`Dashboard.jsx`, `AccountsView.jsx`, etc.) if the app keeps growing
- No automated tests yet
- No data export (e.g. CSV) yet

## License

Personal project — add a license here if you plan to open-source it.