# MedPOMO

A warm, minimal Pomodoro timer for study sessions. No build step, no dependencies —
just static files in `public/`.

## Features

- Focus / short break / long break, with a long break every N rounds
- Drift-free countdown (wall-clock based, survives a backgrounded tab)
- Progress ring, live tab title, soft chime on completion
- Optional auto-start of the next session
- Today's session and focused-minute count, stored locally
- Keyboard: `Space` start/pause, `R` reset

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
