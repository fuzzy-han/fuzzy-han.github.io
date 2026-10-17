# Project checks

Use Node 22.23+ and pnpm (pnpm-lock.yaml). `npm run check` runs TypeScript, production build and CSS checks. Start `npm run dev` before `npm run e2e:backup`; the backup suite includes pure format/merge checks, storage failure/legacy database regressions and migration across independent Chromium profiles. Chromium is resolved from DSH_CHROME or the Playwright cache. Never test with a user's real browser profile. Keep backup import atomic and fail explicitly on incomplete reads; preserve legacy browser storage keys and database name. Do not publish API keys or browser backups.
