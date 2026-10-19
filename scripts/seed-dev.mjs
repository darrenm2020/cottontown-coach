// Dev only: copies every team from the live tracker (read-only GETs) into the local `npm run dev` server.
// usage: node scripts/seed-dev.mjs [http://localhost:8888] — needs COACH_CODE from .env
import { readFileSync } from "node:fs";
const LIVE = "https://cottontown-club.netlify.app/api/state";
const local = (process.argv[2] || "http://localhost:8888") + "/api/state";
const code = (readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^COACH_CODE=(.*)$/m) || [])[1];
const post = (b) => fetch(local, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...b, code, unlock: true }) }).then((r) => r.status);
const { teams } = await (await fetch(LIVE + "?list=1")).json();
for (const t of teams) {
  const j = await (await fetch(LIVE + "?team=" + encodeURIComponent(t.id))).json();
  if (!j.config) continue;
  const s = await post({ kind: "config", team: t.id, config: j.config.team });
  let n = 0;
  for (const [gid, v] of Object.entries(j.games || {})) if ((await post({ kind: "game", team: t.id, gid, game: v.game })) === 200) n++;
  for (const [gid, list] of Object.entries(j.pstats || {})) for (const x of list) await fetch(local, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "pstat", team: t.id, gid, stat: { ...x, dv: "seed" } }) });
  console.log(`${t.id}: config ${s}, ${n} games`);
}
