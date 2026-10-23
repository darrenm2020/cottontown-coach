// Voice plan changes: run with `npm test`. Claude is replaced by a stand-in that returns a fixed answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handle as core } from "../netlify/lib/core.mjs";
import { handle } from "../netlify/functions/voice.mjs";

function memStore() {
  const m = new Map();
  return { m, async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; }, async setJSON(k, v) { m.set(k, JSON.stringify(v)); }, async delete(k) { m.delete(k); },
    async list(o = {}) { return { blobs: [...m.keys()].filter((k) => !o.prefix || k.startsWith(o.prefix)).map((key) => ({ key })) }; } };
}
const ENV = { COACH_CODE: "main-1234" };
const fake = (obj) => { const f = { p: null }; const create = async (p) => { f.p = p; return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }] }; }; f.beta = { messages: { create } }; f.messages = { create }; return f; };
async function setup() {
  const store = memStore();
  const post = (b) => core(new Request("http://t/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }), { store, env: ENV });
  await post({ kind: "config", team: "t1", config: { name: "Test", format: "9v9", players: [], games: [] }, code: "main-1234" });
  await post({ kind: "setcode", team: "t1", newCode: "team-5678", code: "main-1234" });
  const ask = (body, client) => handle(new Request("http://t/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { store, env: ENV, client });
  return { store, ask };
}
const ctx = { team: "Test", format: "9v9", half: 30, sub: 10, started: false, positions: [{ id: "GK", name: "Keeper" }, { id: "CB", name: "Center back" }],
  players: [{ id: "ana", name: "Ana" }, { id: "bea", name: "Bea" }, { id: "cy", name: "Cy" }], blocks: [{ label: "0–10", lineup: { GK: "ana", CB: "bea" } }, { label: "10–20", lineup: { GK: "ana", CB: "cy" } }] };

test("game plan: coach codes and the main code work; no code is refused", async () => {
  const { ask } = await setup();
  const f = fake({ possible: true, message: "Bea in goal.", changes: ["Bea plays GK"], out: [], blocks: [{ GK: "bea", CB: "ana" }, { GK: "bea", CB: "cy" }] });
  assert.equal((await ask({ team: "t1", kind: "game", request: "Bea in goal", ctx }, f)).status, 401);
  const r = await (await ask({ team: "t1", code: "team-5678", kind: "game", request: "Bea in goal", ctx }, f)).json();
  assert.deepEqual(r.plan.blocks, [{ GK: "bea", CB: "ana" }, { GK: "bea", CB: "cy" }]);
  assert.deepEqual(f.p.output_config.format.schema.properties.blocks.items.properties.GK.enum, ["ana", "bea", "cy", ""]);
  assert.equal((await ask({ team: "t1", code: "main-1234", kind: "game", request: "x", ctx }, f)).status, 200);
});

test("practice plan: drills limited to the library the app sent", async () => {
  const { ask } = await setup();
  const pctx = { team: "Test", format: "9v9", title: "Tue", blocks: [], drills: [{ id: "rondo-01", title: "Rondo", topic: "possession", min: 15, players: "8+" }] };
  const f = fake({ possible: true, message: "Built a practice.", changes: ["Added a rondo and a scrimmage"], title: "Possession night", focus: "Keeping the ball", blocks: [{ title: "Rondo", min: 15, drill: "rondo-01", notes: "" }, { title: "Scrimmage", min: 30, drill: "", notes: "" }] });
  const r = await (await ask({ team: "t1", code: "team-5678", kind: "practice", request: "build a 45 minute possession practice", ctx: pctx }, f)).json();
  assert.equal(r.plan.title, "Possession night");
  assert.deepEqual(r.plan.blocks.map((b) => b.drill), ["rondo-01", ""]);
  assert.deepEqual(f.p.output_config.format.schema.properties.blocks.items.properties.drill.enum, ["rondo-01", ""]);
});

test("monthly AI limit", async () => {
  const { store, ask } = await setup();
  await store.setJSON("ai-usage-t1-" + new Date().toISOString().slice(0, 7), { n: 150 });
  assert.equal((await ask({ team: "t1", code: "team-5678", kind: "game", request: "x", ctx }, fake({}))).status, 429);
});
