// One-time update (October 2026): Alabama Super Cup details from the organizer (Soccer Management Company) and the
// GotSport applied-teams list.
//  - Dates are Fri Nov 13 – Sun Nov 15, 2026 at Jack Allen Recreation Complex, 2616 Modaus Rd SW, Decatur.
//  - The Development team's Saturday/Sunday placeholders get the street address (for Directions).
//  - Teams on GotSport's applied list are marked "Applied": 2015 Boys, Boys Red, Boys White.
// Changes only those things; safe to run twice.
//   node scripts/update-super-cup-oct-2026.mjs                       (test site; SITE_COACH_CODE from .env)
//   node scripts/update-super-cup-oct-2026.mjs http://localhost:8888  (local preview; COACH_CODE)
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

const ADDRESS = "Jack Allen Recreation Complex, 2616 Modaus Rd SW, Decatur, AL 35603";
const club = await (await fetch(api + "?club=1", { cache: "no-store" })).json();
const cup = (club.tournaments || []).find((t) => /alabama super cup/i.test(t.name));
const info = { name: "Alabama Super Cup", start: "2026-11-13", end: "2026-11-15", venue: ADDRESS, link: "https://www.smcsoccer.com/alabama-super-cup/" };
const t = await post({ kind: "tournament", team: "cottontown", tournament: cup ? { ...info, id: cup.id } : info });
if (!t.ok) { console.error("Couldn't update the Alabama Super Cup (" + t.status + " " + (t.j.error || "") + ")."); process.exit(1); }
const tid = t.j.id;
console.log(`Alabama Super Cup: ${cup ? "updated" : "added"} (Nov 13–15, Decatur)`);

// Development placeholders: street address for Directions.
{
  const j = await getTeam("cottontown"); const c = j.config && j.config.team; let n = 0;
  for (const g of (c && c.games) || []) if (["tr1114", "tr1115"].includes(g.id) && g.place !== ADDRESS) { g.place = ADDRESS; g.tid = tid; n++; }
  if (n) { const r = await post({ kind: "config", team: "cottontown", config: c }); console.log(`Development: ${r.ok ? "updated" : "failed (" + r.status + ")"} ${n} placeholder${n > 1 ? "s" : ""}`); }
  else console.log("Development: placeholders already up to date");
}
// Teams on the GotSport applied list.
for (const id of ["cottontown-2015", "cottontown-boys-red", "cottontown-boys-white"]) {
  const j = await getTeam(id); const c = j.config && j.config.team;
  if (!c) { console.log(`${id}: not on the site, skipped`); continue; }
  c.entries = Array.isArray(c.entries) ? c.entries : [];
  if (c.entries.some((e) => e.tid === tid)) { console.log(`${c.name}: already marked`); continue; }
  c.entries.push({ tid, status: "applied" });
  const r = await post({ kind: "config", team: id, config: c });
  console.log(`${c.name}: ${r.ok ? "marked Applied" : "failed (" + r.status + ")"}`);
}
console.log("Done.");
