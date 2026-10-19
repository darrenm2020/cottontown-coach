// Adds new teams (settings, roster, schedule and past results) from a JSON file to a Cottontown Coach site.
//   Local preview:  npm run add-teams -- imports/school-teams.json
//   Test site:      npm run add-teams -- imports/school-teams.json https://cottontown-coach.netlify.app   (asks for that site's coach code)
// A team that already exists on the site is skipped, never overwritten, so saved games and stats are safe.
// File shape: { "teams": [ { "config": { id, name, ... , games: [...] }, "games": { "<gid>": <game record> } } ] }
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const file = process.argv[2];
if (!file || !existsSync(file)) { console.error("Usage: npm run add-teams -- <file.json> [site URL]"); process.exit(1); }
const target = (process.argv[3] || "http://localhost:8888").replace(/\/+$/, "");
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(target);
const api = target + "/api/state";

let code = process.env.COACH_CODE || "";
if (!code && local && existsSync(new URL("../.env", import.meta.url))) {
  code = (readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^COACH_CODE=(.*)$/m) || [])[1] || "";
}
if (!code) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  code = (await rl.question(`Main coach code for ${target}: `)).trim();
  rl.close();
}
const post = (b) => fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...b, code }) });

const check = await post({ kind: "verify", team: "cottontown" });
if (!check.ok || !(await check.json()).master) { console.error(`${target} needs the main coach code to add teams. Nothing was added.`); process.exit(1); }

const { teams } = JSON.parse(readFileSync(file, "utf8"));
for (const { config, games = {} } of teams) {
  const cur = await (await fetch(api + "?team=" + encodeURIComponent(config.id), { cache: "no-store" })).json();
  if (cur.config) { console.log(`${config.name}: already on the site, skipped`); continue; }
  const s = await post({ kind: "config", team: config.id, config });
  if (!s.ok) { console.log(`${config.name}: failed (${s.status})`); continue; }
  let n = 0;
  for (const [gid, game] of Object.entries(games)) if ((await post({ kind: "game", team: config.id, gid, game })).ok) n++;
  console.log(`${config.name}: added, ${config.players.length} players, ${config.games.length} games, ${n} results`);
}
console.log("Done. Open " + target + "/?club=1");
