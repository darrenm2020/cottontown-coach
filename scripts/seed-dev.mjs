// Copies every team from the live tracker (read-only GETs) into another Cottontown Coach site.
//   Local preview:  npm run seed                     (uses COACH_CODE from .env)
//   Test site:      npm run seed -- https://cottontown-coach.netlify.app   (asks for that site's coach code)
// Games are copied as they are; finished games arrive unlocked for 2 hours, then lock as usual.
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const LIVE = "https://cottontown-club.netlify.app/api/state";
const target = (process.argv[2] || "http://localhost:8888").replace(/\/+$/, "");
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(target);
const api = target + "/api/state";

let code = process.env.COACH_CODE || "";
if (!code && local && existsSync(new URL("../.env", import.meta.url))) {
  code = (readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^COACH_CODE=(.*)$/m) || [])[1] || "";
}
if (!code) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  code = (await rl.question(`Coach code for ${target}: `)).trim();
  rl.close();
}
const post = (b) => fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...b, code, unlock: true }) });

const check = await post({ kind: "verify", team: "cottontown" });
if (!check.ok) { console.error(`That code wasn't accepted by ${target} (${check.status}). Nothing was copied.`); process.exit(1); }

const { teams } = await (await fetch(LIVE + "?list=1")).json();
for (const t of teams) {
  const j = await (await fetch(LIVE + "?team=" + encodeURIComponent(t.id))).json();
  if (!j.config) continue;
  const s = (await post({ kind: "config", team: t.id, config: j.config.team })).status;
  let n = 0;
  for (const [gid, v] of Object.entries(j.games || {})) if ((await post({ kind: "game", team: t.id, gid, game: v.game })).ok) n++;
  let p = 0;
  for (const [gid, list] of Object.entries(j.pstats || {})) for (const x of list) {
    const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "pstat", team: t.id, gid, stat: { ...x, dv: "copied" } }) });
    if (r.ok) p++;
  }
  console.log(`${t.name}: settings ${s === 200 ? "copied" : "failed (" + s + ")"}, ${n} games, ${p} parent stats`);
}
console.log("Done. Open " + target + "/?team=cottontown");
