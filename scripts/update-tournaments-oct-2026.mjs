// One-time update for the test site (October 2026), from SincSports:
//  - adds the tournaments Cottontown teams played in or have signed up for
//  - links each team's games inside those tournament dates (games that already have a tournament are left alone)
//  - marks sign-ups for events whose schedules aren't posted yet
//  - clears the goal entered early on Athens Boys Varsity's Mar 4, 2027 game (never kicked off)
// Safe to run more than once. Game results, stats and rosters are not touched.
//   npm run update-tournaments                      (test site; uses SITE_COACH_CODE from .env)
//   npm run update-tournaments -- http://localhost:8888   (local preview; uses COACH_CODE)
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const target = (process.argv[2] || "https://cottontown-coach.netlify.app").replace(/\/+$/, "");
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(target);
const api = target + "/api/state";
let code = process.env.COACH_CODE || "";
if (!code && existsSync(new URL("../.env", import.meta.url))) {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  code = ((env.match(local ? /^COACH_CODE=(.*)$/m : /^SITE_COACH_CODE=(.*)$/m) || [])[1] || "").trim();
}
if (!code) { const rl = createInterface({ input: process.stdin, output: process.stdout }); code = (await rl.question(`Main coach code for ${target}: `)).trim(); rl.close(); }
const post = async (b) => { const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...b, code }) }); return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) }; };
const getTeam = async (id) => (await fetch(api + "?team=" + encodeURIComponent(id), { cache: "no-store" })).json();

const v = await post({ kind: "verify", team: "cottontown" });
if (!v.ok || !v.j.master) { console.error(`${target} needs the main coach code. Nothing was changed.`); process.exit(1); }

const sinc = (tid) => `https://soccer.sincsports.com/details.aspx?tid=${tid}`;
const EVENTS = [
  { key: "kicks", name: "NASC Leidos KICKS Invitational", start: "2026-10-17", end: "2026-10-19", venue: "John Hunt Park, Huntsville, AL" },
  { key: "music", name: "Music City Invitational - Fall", start: "2026-10-23", end: "2026-10-25", venue: "Richard Siegel Soccer Complex, Murfreesboro, TN", link: sinc("MUSICF") },
  { key: "showdown", name: "Alabama Soccer Showdown", start: "2026-11-06", end: "2026-11-08", venue: "Birmingham, AL", link: sinc("FARSS") },
  { key: "nusa", name: "Nashville United Soccer Academy Fall Cup", start: "2026-11-13", end: "2026-11-15", venue: "Nashville area, TN", link: sinc("NUSAFC") },
];
const ids = {};
for (const e of EVENTS) {
  const { key, ...t } = e;
  const r = await post({ kind: "tournament", team: "cottontown", tournament: t });
  if (!r.ok) { console.error(`${e.name}: couldn't add (${r.status} ${r.j.error || ""}). Is the new version deployed?`); process.exit(1); }
  ids[key] = r.j.id;
  console.log(`${e.name}: ${r.j.existing ? "already listed" : "added"}`);
}
const KICKS_TEAMS = ["cottontown", "cottontown-1314-girls", "cottontown-1617-girls", "cottontown-1718-girls", "cottontown-2015", "cottontown-boys-white", "cottontown-boys-red"];
const PLAN = [
  ...KICKS_TEAMS.map((team) => ({ team, tid: ids.kicks, from: "2026-10-17", to: "2026-10-19" })),
  { team: "cottontown-1314-girls", tid: ids.music, from: "2026-10-23", to: "2026-10-25" },
];
const ENTRIES = [
  { team: "cottontown-boys-red", tid: ids.showdown, status: "applied" }, // listed as Applied in Under 17 Boys
  { team: "cottontown-1718-girls", tid: ids.nusa, status: "entered" },  // listed in Under 9 Girls
];
const teams = [...new Set([...PLAN.map((p) => p.team), ...ENTRIES.map((e) => e.team)])];
for (const id of teams) {
  const j = await getTeam(id);
  if (!j.config) { console.log(`${id}: not on the site, skipped`); continue; }
  const c = j.config.team; let linked = 0, signed = 0;
  for (const p of PLAN.filter((p) => p.team === id)) for (const g of c.games) {
    const d = String(g.dt || "").slice(0, 10);
    if (!g.tid && d >= p.from && d <= p.to) { g.tid = p.tid; linked++; }
  }
  for (const e of ENTRIES.filter((e) => e.team === id)) {
    c.entries = Array.isArray(c.entries) ? c.entries : [];
    if (!c.entries.some((x) => x.tid === e.tid)) { c.entries.push({ tid: e.tid, status: e.status }); signed++; }
  }
  if (!linked && !signed) { console.log(`${c.name}: already up to date`); continue; }
  const r = await post({ kind: "config", team: id, config: c });
  console.log(`${c.name}: ${r.ok ? "saved" : "failed (" + r.status + ")"}, ${linked} games linked${signed ? ", signed up for " + signed + " event" : ""}`);
}
// Athens Boys Varsity, Mar 4, 2027 vs East Limestone: a goal was entered before the game; it never kicked off.
{
  const j = await getTeam("athens-boys-varsity"); const rec = j.games && j.games.s2724;
  const g = rec && rec.game;
  if (g && g.started && !g.fullDone && !g.running && !(g.acc > 0)) {
    g.del = Array.isArray(g.del) ? g.del : [];
    for (const x of g.goals || []) if (x && x.u && !g.del.includes(x.u)) g.del.push(x.u);
    g.goals = []; g.saves = []; g.stats = []; g.events = []; g.started = false; g.runStart = 0; g.stops = []; g.halfDone = false;
    const r = await post({ kind: "game", team: "athens-boys-varsity", gid: "s2724", game: g });
    console.log(`Athens Boys Varsity, Mar 4, 2027: ${r.ok ? "reset to not started" : "failed (" + r.status + ")"}`);
  } else console.log("Athens Boys Varsity, Mar 4, 2027: nothing to reset");
}
console.log("Done.");
