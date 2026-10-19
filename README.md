# Cottontown Coach

Game tracker, practice planner and drill library for Cottontown United coaches. It started as the
single-page tracker in [cottontown-club](https://github.com/darrenm2020/cottontown-club), which keeps running
unchanged; this repo is the next version.

## What's in it

**Games** (everything from the tracker): live clock with added time, subs and rotation plans, goals, stats,
parents' positive stats, penalty shootouts, parent view, club scoreboard.

- **Team switcher and game list.** Tap the team name to switch teams; tap the game button to pick any game
  (live, today, coming up, results). Scales to a full season.
- **Finished games lock** 2 hours after the final whistle. A head coach can unlock one on purpose
  (Players tab). Stops late-night resets and stale devices from changing results.
- **Change history** for every save: who changed what, and when (Setup → Change history).

**Practices** (Practice tab)

- Build a plan from the drill library or blank blocks, set minutes, notes and attendance.
- Run it: big block timer with the drill's diagram and coaching points, beep at the end of each block.
- Copy last week's plan.

**Drill library** (Practice → Drill library)

- 72 original starter drills across 14 topics, each with a field diagram, setup, steps, coaching points,
  and easier/harder versions. Filtered to the team's format (7v7, 9v9, 11v11).
- Favorites per coach, club picks chosen by admins, and coaches' own drills (shared with the club, with an
  optional video link).

**Season** (Season tab)

- Per player: games, starts, minutes, minutes by position, goals, assists, great plays.
- Fair-play check for players averaging under 75% of the team's minutes.
- Player cards (positive stats only) to copy or print for a family, and a spreadsheet download.

**Coaches and sign-in** (optional for now)

| Who | Can |
|---|---|
| Club admin (main code, or a coach marked admin) | Everything, every team; Club admin page (teams, all coaches, backups, history) |
| Head coach | Everything for their team, including its roster, schedule and coaches |
| Assistant | Run games and practices; can't change the roster or schedule |
| Stats helper | Add goals and stats only |
| Anyone with the link | Follow games, add parents' positive stats |

Coaches sign in with a personal code, or with an emailed link once email is set up. The main code and team
codes keep working until you turn on `AUTH_REQUIRED`.

**Backups.** Every night all club data is copied into a dated backup (30 kept). Admins can download one or
restore a single game from it (Club admin → Backups).

## Run it locally

Needs [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
```

Create `.env` (not committed) with a code for local testing:

```
COACH_CODE=pick-a-local-code
DEV_SHOW_LINK=1
```

```bash
npm run local
```

Then open http://localhost:8888/?team=cottontown. `npm run local` runs the real server code against JSON files
in `.devdata/`. To copy every team from the live tracker into it (read-only on the live side):

```bash
npm run seed
```

`npm run dev` runs the full Netlify dev server instead, if the Netlify CLI works on your machine.

## Checks

```bash
npm test
```

```bash
npm run check
```

`npm test` runs the server tests (permissions, locking, history, sign-in, practices, drills, backups).
`npm run check` merges and validates the drill library and syntax-checks the browser scripts.

## Put it online

1. In Netlify: **Add new project → Import from GitHub →** `darrenm2020/cottontown-coach`. No build command;
   it publishes `public/` and the functions in `netlify/functions`.
2. **Project configuration → Environment variables:**
   - `COACH_CODE` (required): the club admin code.
   - `SITE_URL`: the site's address, used in emailed sign-in links.
   - `RESEND_API_KEY` and `MAIL_FROM` (optional): turn on emailed sign-in links through [Resend](https://resend.com).
   - `AUTH_REQUIRED=true` (later): team codes stop working; coaches must sign in.
3. The new site has its own data. To copy every team from the current tracker into it, run this and
   enter the new site's coach code when asked:

   ```bash
   npm run seed -- https://YOUR-NEW-SITE.netlify.app
   ```

   The test site is https://cottontown-coach.netlify.app.

The current tracker (cottontown-club) is untouched and keeps working until you switch.

## Layout

```
public/            the app (no build step)
  index.html
  css/app.css      tracker styles      css/features.css   new features
  js/app.js        tracker (ported)    js/auth.js         sign-in, coaches, history, backups
  js/drills.js     drill library       js/practice.js     practice plans and practice mode
  js/season.js     season reports      js/nav.js          team switcher, game list, clock sheet
  js/admin.js      club admin page     js/main.js         start-up
  data/drills/     drill sources (merged into data/drills.json by npm run check)
  assets/          logo, goal song, opponent logos
netlify/functions/ api.mjs (/api/state), backup.mjs (nightly)
netlify/lib/       core.mjs: all server logic
scripts/           local server, seeding, checks
tests/             server tests
docs/              drill format
```
