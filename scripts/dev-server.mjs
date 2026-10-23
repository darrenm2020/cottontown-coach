// Local preview without the Netlify CLI: serves public/ and runs the real API code (netlify/lib/core.mjs)
// against a folder of JSON files (.devdata/) instead of Netlify Blobs.
// usage: npm run local   (reads COACH_CODE etc. from .env)  then open http://localhost:8888/?team=cottontown
import http from "node:http";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, extname, normalize, sep } from "node:path";
import { handle, takeBackup } from "../netlify/lib/core.mjs";
import { handle as voiceHandle } from "../netlify/functions/voice.mjs";
// FAKE_AI=1: a stand-in for Claude so voice changes can be tried without an API key.
//   Game plan: "Olivia in goal" for every block not yet played. Practice: the first two library drills plus a scrimmage.
const fakeAI = { beta: { messages: { create: async (p) => fakeVoice(p) } }, messages: { create: async (p) => fakeVoice(p) } };
function fakeVoice(p) {
  const props = p.output_config.format.schema.properties;
  let out;
  if (props.out) {
    const blocks = [...p.system.matchAll(/^Block \d+ \([^)]*\)( LOCKED[^:]*)?: (.*)$/gm)].map((m) => ({ locked: !!m[1], lineup: Object.fromEntries(m[2].split(", ").map((kv) => { const [k, v] = kv.split("="); return [k, v === "(empty)" ? "" : v]; })) }));
    const outs = [...p.system.matchAll(/^- ([\w-]+): .* OUT/gm)].map((m) => m[1]);
    out = { possible: true, message: "Olivia is in goal for the rest of the game.", changes: ["Olivia plays GK in every block that hasn't started."], out: outs,
      blocks: blocks.map((b) => { const l = { ...b.lineup }; if (b.locked) return l; const was = l.GK, at = Object.keys(l).find((k) => l[k] === "olivia"); l.GK = "olivia"; if (at && at !== "GK") l[at] = was; return l; }) };
  } else {
    const lib = [...p.system.split("Drill library")[1].matchAll(/^([\w-]+): (.+?) \(/gm)].slice(0, 2);
    out = { possible: true, message: "Here's a 60-minute practice.", changes: ["Built a warm-up, a drill and a scrimmage."], title: "Passing night", focus: "Passing",
      blocks: [...lib.map(([, id, title]) => ({ title, min: 15, drill: id, notes: "" })), { title: "Scrimmage", min: 30, drill: "", notes: "Free play" }] };
  }
  return { stop_reason: "end_turn", model: p.model, content: [{ type: "text", text: JSON.stringify(out) }] };
}

const root = normalize(new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const pub = join(root, "public"), data = join(root, ".devdata");
const port = +(process.argv[2] || 8888);
const env = {};
if (existsSync(join(root, ".env"))) for (const l of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
// A value set in the shell wins over .env (e.g. a throwaway COACH_CODE while testing).
for (const k of ["COACH_CODE", "AUTH_REQUIRED", "DEV_SHOW_LINK"]) if (process.env[k]) env[k] = process.env[k];

await mkdir(data, { recursive: true });
const file = (k) => join(data, encodeURIComponent(k) + ".json");
const store = {
  async get(k) { try { return JSON.parse(await readFile(file(k), "utf8")); } catch { return null; } },
  async setJSON(k, v) { await writeFile(file(k), JSON.stringify(v)); },
  async delete(k) { try { await unlink(file(k)); } catch {} },
  async list(o = {}) { const keys = (await readdir(data)).filter((f) => f.endsWith(".json")).map((f) => decodeURIComponent(f.slice(0, -5))); return { blobs: keys.filter((k) => !o.prefix || k.startsWith(o.prefix)).map((key) => ({ key })) }; },
};
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost:" + port);
    if (url.pathname === "/api/state") {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }), { store, env });
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    if (url.pathname === "/api/voice") {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await voiceHandle(new Request(url, { method: req.method, headers: req.headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }), { store, env, ...(process.env.FAKE_AI ? { client: fakeAI } : {}) });
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    if (url.pathname === "/dev/backup") { const d = await takeBackup(store); res.end("backup " + d); return; }
    let p = normalize(join(pub, decodeURIComponent(url.pathname)));
    if (p !== pub && !p.startsWith(pub + sep)) { res.writeHead(403); res.end(); return; }
    if (url.pathname.endsWith("/")) p = join(p, "index.html");
    const body = await readFile(p);
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream", "Cache-Control": "no-cache" }); res.end(body);
  } catch (e) { if (e.code !== "ENOENT") console.error(e); res.writeHead(e.code === "ENOENT" ? 404 : 500); res.end(e.code === "ENOENT" ? "Not found" : "Server error"); }
}).listen(port, () => console.log(`Cottontown Coach on http://localhost:${port}  (data in .devdata/)`));
