// Fills in blank roster details (grade and positions) for teams already on a Cottontown Coach site.
//   Local preview:  npm run fill-rosters -- imports/school-teams.json
//   Test site:      npm run fill-rosters -- imports/school-teams.json https://cottontown-coach.netlify.app
// Only blanks are filled: a grade or position a coach has already set is kept, players are matched by id,
// and nothing else in the team (games, plans, results, other players) is changed.
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const file = process.argv[2];
if (!file || !existsSync(file)) { console.error("Usage: npm run fill-rosters -- <file.json> [site URL]"); process.exit(1); }
const target = (process.argv[3] || "http://localhost:8888").replace(/\/+$/, "");
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(target);
const api = target + "/api/state";

let code = process.env.COACH_CODE || "";
// .env (never committed): COACH_CODE for the local preview, SITE_COACH_CODE for the test site.
if (!code && existsSync(new URL("../.env", import.meta.url))) {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  code = ((env.match(local ? /^COACH_CODE=(.*)$/m : /^SITE_COACH_CODE=(.*)$/m) || [])[1] || "").trim();
}
if (!code) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  code = (await rl.question(`Main coach code for ${target}: `)).trim();
  rl.close();
}
const post = (b) => fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...b, code }) });
const check = await post({ kind: "verify", team: "cottontown" });
if (!check.ok) { console.error(`That code wasn't accepted by ${target}. Nothing was changed.`); process.exit(1); }

const { teams } = JSON.parse(readFileSync(file, "utf8"));
for (const { config: src } of teams) {
  const cur = await (await fetch(api + "?team=" + encodeURIComponent(src.id), { cache: "no-store" })).json();
  if (!cur.config) { console.log(`${src.name}: not on the site, skipped`); continue; }
  const team = cur.config.team;
  const from = new Map(src.players.map((p) => [p.id, p]));
  let grades = 0, positions = 0;
  for (const p of team.players || []) {
    const s = from.get(p.id);
    if (!s) continue;
    if (!p.grad && s.grad) { p.grad = s.grad; grades++; }
    if (!(p.gr && p.gr.length) && s.gr && s.gr.length) { p.gr = s.gr.slice(); positions++; }
  }
  if (!grades && !positions) { console.log(`${team.name}: nothing to fill`); continue; }
  const r = await post({ kind: "config", team: src.id, config: team });
  console.log(`${team.name}: ${r.ok ? "filled" : "failed (" + r.status + ")"} ${grades} grades, ${positions} positions`);
}
