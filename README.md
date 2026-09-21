# MedPOMO

A warm, minimal Pomodoro timer for study sessions. No build step, no dependencies —
just static files in `public/`.

## Features

- Focus / short break / long break, with a long break every N rounds
- Drift-free countdown (wall-clock based, survives a backgrounded tab)
- Progress ring, live tab title, soft chime on completion
- Optional auto-start of the next session
- Today's session and focused-minute count, stored locally
- `+1` / `−1` to log or undo a session run on another timer
- 12-week heatmap of focused minutes, with the current streak
- Keyboard: `Space` start/pause, `R` reset

All history lives in `localStorage`, so it is per-browser and does not sync
between devices. Settings → **Export data** downloads everything as JSON, and
**Import data** reads it back — use it as a backup, or to move your history to
another device. Importing merges rather than overwrites: for a day present on
both sides, the record with more minutes wins.

## Run locally

```bash
npx serve public
# or
python3 -m http.server -d public 3000
```

## Deploy to Vercel

The repo is a static site; `vercel.json` sets `public/` as the output.

```bash
npx vercel
npx vercel --prod
```

Or import the repository at vercel.com — no framework preset, output directory `public`.
