// npm run check: merges public/data/drills/*.json into public/data/drills.json and checks every drill,
// then syntax-checks the browser scripts. Exits non-zero on any problem.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const problems = [];
const TOPICS = new Set(["warmup", "passing", "first-touch", "dribbling", "1v1-attack", "1v1-defend", "possession", "build-out", "finishing", "transition", "defending-team", "goalkeeping", "small-sided", "fun-games"]);
const ITEMS = new Set(["cone", "player", "gk", "ball", "goal", "minigoal", "zone", "pass", "run", "dribble", "shot"]);

// --- drills ---
const partsDir = join(root, "public/data/drills");
let drills = [];
if (existsSync(partsDir)) {
  for (const f of readdirSync(partsDir).filter((f) => f.endsWith(".json")).sort()) drills.push(...JSON.parse(readFileSync(join(partsDir, f), "utf8")));
} else drills = JSON.parse(readFileSync(join(root, "public/data/drills.json"), "utf8"));
const ids = new Set();
for (const d of drills) {
  const where = d.id || d.title || "(no id)";
  const bad = (m) => problems.push(`drill ${where}: ${m}`);
  if (!/^[a-z0-9-]{3,60}$/.test(d.id || "")) bad("bad id");
  if (ids.has(d.id)) bad("duplicate id");
  ids.add(d.id);
  if (!d.title) bad("no title");
  if (!TOPICS.has(d.topic)) bad("unknown topic " + d.topic);
  if (!Array.isArray(d.ages) || !d.ages.length || d.ages.some((a) => !["7v7", "9v9", "11v11"].includes(a))) bad("bad ages");
  if (!(d.minutes >= 5 && d.minutes <= 30)) bad("minutes " + d.minutes);
  if (!Array.isArray(d.how) || d.how.length < 2) bad("needs how steps");
  if (!Array.isArray(d.coaching) || !d.coaching.length) bad("needs coaching points");
  const text = JSON.stringify(d).toLowerCase();
  const young = d.ages.some((a) => a !== "11v11");
  if (young && /\bslide tackl/.test(text) && !/\bno slide tackl|not slide tackl|never slide|without slide/.test(text)) bad("slide tackle in a 7v7/9v9 drill");
  if (young && /\bheader\b|\bheading the ball|\bhead the ball/.test(text)) bad("heading in a 7v7/9v9 drill");
  const dg = d.diagram;
  if (!dg || !Array.isArray(dg.items) || dg.items.length < 4) { bad("missing diagram"); continue; }
  const inb = (x, y) => x >= -0.01 && y >= -0.01 && x <= dg.w + 0.01 && y <= dg.h + 0.01;
  for (const it of dg.items) {
    if (!ITEMS.has(it.t)) bad("unknown diagram item " + it.t);
    if ("x" in it && !inb(it.x, it.y)) bad(`${it.t} at ${it.x},${it.y} is outside ${dg.w}x${dg.h}`);
    for (const k of ["from", "to"]) if (it[k] && !inb(it[k][0], it[k][1])) bad(`${it.t} ${k} ${it[k]} outside`);
  }
}
writeFileSync(join(root, "public/data/drills.json"), JSON.stringify(drills) + "\n");
const byTopic = {};
drills.forEach((d) => (byTopic[d.topic] = (byTopic[d.topic] || 0) + 1));
console.log(`drills: ${drills.length} (${Object.entries(byTopic).map(([k, v]) => k + " " + v).join(", ")})`);
for (const f of ["7v7", "9v9", "11v11"]) console.log(`  ${f}: ${drills.filter((d) => d.ages.includes(f)).length}`);

// --- browser scripts: parse each, then all of them together in load order ---
const order = ["teaminfo.js", "app.js", "auth.js", "drills.js", "practice.js", "season.js", "nav.js", "events.js", "admin.js", "home.js", "main.js"];
const html = readFileSync(join(root, "public/index.html"), "utf8");
for (const f of order) if (!html.includes(`js/${f}`)) problems.push(`index.html doesn't load js/${f}`);
for (const f of order) {
  try { new vm.Script(readFileSync(join(root, "public/js", f), "utf8"), { filename: f }); }
  catch (e) { problems.push(`js/${f}: ${e.message}`); }
}
const version = JSON.parse(readFileSync(join(root, "public/version.json"), "utf8")).v;
const appVer = (readFileSync(join(root, "public/js/app.js"), "utf8").match(/const APP_VER='([^']+)'/) || [])[1];
if (version !== appVer) problems.push(`version.json (${version}) doesn't match APP_VER (${appVer})`);

if (problems.length) { console.error("\n" + problems.join("\n")); process.exit(1); }
console.log("all checks passed");
