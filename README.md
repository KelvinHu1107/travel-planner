# TripTogether

A collaborative travel planner: shared itineraries, expenses, packing and to-do lists, notes, and in-app notifications. Friends join a trip with a trip code (and an optional password). Edits sync in real time.

This is the product in the `travel-planner` repository.

**Live demo:** [https://travalproject-45649.web.app](https://travalproject-45649.web.app)

## Screenshots

![Home](docs/screenshot-1.png)

![Trip board](docs/screenshot-2.png)

![Expenses](docs/screenshot-3.png)

![Sign-in](docs/screenshot-4.png)

## Features

- **Trip board:** a shared itinerary of cards (places, transport, and so on), with drag-and-drop and a Google Places search plus “nearby” suggestions
- **Collaboration:** join with a trip code; members see additions, edits, and deletions as they happen
- **Notes:** a dedicated note page with a formatting toolbar; notes can be attached to cards
- **To-do and packing lists:** checkbox lists, including to-dos that originate from a card
- **Expenses and settlement:** amounts, currencies, categories, and a settlement view
- **Notifications:** in-app notifications when cards or membership change
- **Auth:** Google sign-in, email and password (including password reset), and LINE login (OAuth and LIFF)
- **i18n:** Traditional Chinese and English
- **Themes:** “handdrawn” (default) and “cute”
- **PDF export:** print-to-PDF of the itinerary
- **First-run tutorial**

## Stack

- React 19 · Vite · React Router 7
- Firebase: Auth, Firestore, Storage, Cloud Functions (`asia-east1`), Hosting
- LINE LIFF / LINE Login
- Tailwind CSS 4
- `@dnd-kit` for drag and drop
- Sentry for client error reporting
- Google Maps / Places (optional; the app can fall back to a typed address if the key is missing or the API fails)
- Icon sources include a hand-drawn SVG set plus Lucide, Phosphor, and Tabler icons

## Run locally

```bash
cp .env.example .env.local
# Fill in the Firebase web config.
# For Google place search, also set VITE_GOOGLE_MAPS_API_KEY
#   (Google Cloud → APIs & Services → enable Places API (New)).
# For LINE login, also set:
#   VITE_LINE_CHANNEL_ID
#   VITE_LIFF_ID
npm install
npm run dev
```

`npm run dev` starts Vite at `http://localhost:5173`.

LINE login in production goes through Cloud Functions `lineAuth` and `lineAuthToken`, rewritten on Hosting as `/api/lineAuth` and `/api/lineAuthToken`. Those functions need `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` in the Functions environment, not in the Vite `.env` file.

Other scripts: `npm run build`, `npm run preview`, `npm run lint` (Oxlint).

## Project layout

- `src/pages` — screens: Home, TripBoard, NoteDetail, Checklist, Expenses, Settlement, Auth, LINE callback
- `src/components` — board, cards, modals, and shared UI
- `src/contexts` — auth, theme, view mode
- `src/services` — Firebase, Firestore access, Maps, LINE auth helper
- `src/i18n` — English and Traditional Chinese strings
- `functions` — LINE authentication Cloud Functions
- `firestore.rules` / `firestore.indexes.json` / `storage.rules` — security rules and indexes
- `firebase.json` / `.firebaserc` — Hosting, Functions, and project id
