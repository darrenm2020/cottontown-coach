// Server tests: run with `npm test`. Uses an in-memory stand-in for Netlify Blobs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, takeBackup, LOCK_AFTER, describeGameChange } from "../netlify/lib/core.mjs";

function memStore() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list(opts = {}) { return { blobs: [...m.keys()].filter((k) => !opts.prefix || k.startsWith(opts.prefix)).map((key) => ({ key })) }; },
  };
}
const ENV = { COACH_CODE: "main-1234" };
function api(store, env = ENV) {
  const call = async (method, path, body, headers = {}) => {
    const req = new Request("http://test" + path, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
    const r = await handle(req, { store, env });
    return { status: r.status, body: await r.json() };
  };
  return { post: (b, h) => call("POST", "/api/state", b, h), get: (p, h) => call("GET", "/api/state" + p, null, h) };
}
const team = { name: "Test Team", format: "9v9", players: [{ id: "ana", name: "Ana" }, { id: "bea", name: "Bea" }], games: [{ id: "g1", title: "Game 1" }] };
const goal = (side, by) => ({ side, t: 60000, by, u: Math.random().toString(36).slice(2) });

async function setup() {
  const store = memStore();
  const a = api(store);
  assert.equal((await a.post({ kind: "config", team: "t1", config: team, code: "main-1234" })).status, 200);
  return { store, a };
}

test("existing tracker requests still work: config, game, read back", async () => {
  const { a } = await setup();
  const g = { started: true, fullDone: false, goals: [goal("us", "ana")] };
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: g, code: "main-1234" })).status, 200);
  const r = await a.get("?team=t1");
  assert.equal(r.body.config.team.name, "Test Team");
  assert.equal(r.body.games.g1.game.goals.length, 1);
  assert.deepEqual((await a.get("?list=1")).body.teams.map((t) => t.id), ["cottontown", "t1"]);
});

test("wrong code is refused; team code works until logins are required", async () => {
  const { store, a } = await setup();
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: {}, code: "nope" })).status, 401);
  assert.equal((await a.post({ kind: "setcode", team: "t1", newCode: "team-55", code: "main-1234" })).status, 200);
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: { started: false }, code: "team-55" })).status, 200);
  const strict = api(store, { ...ENV, AUTH_REQUIRED: "true" });
  assert.equal((await strict.post({ kind: "game", team: "t1", gid: "g1", game: { started: false }, code: "team-55" })).status, 401);
  assert.equal((await strict.post({ kind: "game", team: "t1", gid: "g1", game: { started: false }, code: "main-1234" })).status, 200);
});

test("finished games lock 2 hours after going final", async () => {
  const { store, a } = await setup();
  const fin = { started: true, fullDone: true, goals: [goal("us", "ana"), goal("them")] };
  await a.post({ kind: "game", team: "t1", gid: "g1", game: fin, code: "main-1234" });
  // Within 2 hours: a shootout or a quick score fix is fine.
  const fix = { ...fin, goals: [...fin.goals, goal("us", "bea")] };
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: fix, code: "main-1234" })).status, 200);
  // Pretend it went final 3 hours ago.
  const rec = await store.get("game-t1-g1");
  rec.doneAt = Date.now() - LOCK_AFTER - 3600000;
  await store.setJSON("game-t1-g1", rec);
  const reset = { started: false, fullDone: false, goals: [] };
  const r = await a.post({ kind: "game", team: "t1", gid: "g1", game: reset, code: "main-1234" });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "locked");
  assert.equal((await store.get("game-t1-g1")).game.goals.length, 3, "locked game unchanged");
  // Adding a stat to a locked game is fine; it isn't part of the result.
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: { ...fix, stats: [{ id: "ana", k: "pass", u: "s1" }] }, code: "main-1234" })).status, 200);
  // Unlocking on purpose works for a head coach.
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: reset, code: "main-1234", unlock: true })).status, 200);
});

test("change history records who changed what", async () => {
  const { store, a } = await setup();
  await a.post({ kind: "setcode", team: "t1", newCode: "team-55", code: "main-1234" });
  await a.post({ kind: "game", team: "t1", gid: "g1", game: { started: true, goals: [goal("us")] }, code: "team-55" });
  await a.post({ kind: "game", team: "t1", gid: "g1", game: { started: true, fullDone: true, goals: [goal("us"), goal("us")] }, code: "team-55" });
  const r = await a.get("?audit=t1", { "x-code": "team-55" });
  assert.equal(r.status, 200);
  const whats = r.body.audit.map((x) => x.who + ": " + x.what);
  assert.ok(whats.some((s) => s.startsWith("Team code: Score 1–0 → 2–0")), whats.join(" | "));
  assert.ok(whats.some((s) => s.includes("Final 2–0")));
  assert.equal((await a.get("?audit=t1")).status, 403, "parents can't read history");
});

test("describeGameChange spots resets", () => {
  assert.equal(describeGameChange({ started: true, fullDone: true, goals: [goal("us")] }, { started: false, goals: [] }), "Game reset (was 1–0)");
});

test("coach accounts: personal code signs in, roles limit what they can do", async () => {
  const { a } = await setup();
  let r = await a.post({ kind: "user-save", user: { name: "Randy", email: "randy@example.com", roles: { t1: "assistant" } }, code: "main-1234" });
  assert.equal(r.status, 200);
  const uid = r.body.user.id;
  assert.equal((await a.post({ kind: "user-code", id: uid, newCode: "randy-777", code: "main-1234" })).status, 200);
  r = await a.post({ kind: "login", code: "randy-777" });
  assert.equal(r.status, 200);
  const session = r.body.session;
  assert.equal(r.body.user.name, "Randy");
  // Assistant can run games but not change the roster.
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: { started: true }, session })).status, 200);
  assert.equal((await a.post({ kind: "config", team: "t1", config: { ...team, players: [] }, session })).status, 403);
  // No role on another team.
  await a.post({ kind: "config", team: "t2", config: team, code: "main-1234" });
  assert.equal((await a.post({ kind: "game", team: "t2", gid: "g1", game: { started: true }, session })).status, 401);
  // Who am I
  r = await a.get("?me=1", { "x-session": session });
  assert.equal(r.body.user.roles.t1, "assistant");
  // Sign out ends the session
  await a.post({ kind: "logout", session });
  assert.equal((await a.get("?me=1", { "x-session": session })).body.user, null);
});

test("head coaches manage their own team's coaches, and only theirs", async () => {
  const { a } = await setup();
  await a.post({ kind: "config", team: "t2", config: team, code: "main-1234" });
  // Admin makes Kyle head coach of t1 and gives him a code.
  let r = await a.post({ kind: "user-save", user: { name: "Kyle", roles: { t1: "head" } }, code: "main-1234" });
  await a.post({ kind: "user-code", id: r.body.user.id, newCode: "kyle-1234", code: "main-1234" });
  const kyle = (await a.post({ kind: "login", code: "kyle-1234" })).body.session;
  // Kyle adds an assistant to t1 and sets her code.
  r = await a.post({ kind: "team-coach", team: "t1", name: "Ashley", email: "ashley@example.com", role: "assistant", session: kyle });
  assert.equal(r.status, 200);
  const ashley = r.body.user.id;
  assert.equal((await a.post({ kind: "team-coach-code", team: "t1", id: ashley, newCode: "ash-12345", session: kyle })).status, 200);
  assert.deepEqual((await a.get("?coaches=t1", { "x-session": kyle })).body.coaches.map((c) => c.name + ":" + c.role).sort(), ["Ashley:assistant", "Kyle:head"]);
  // Kyle can't touch t2, can't list all users, can't make admins.
  assert.equal((await a.post({ kind: "team-coach", team: "t2", name: "X", role: "head", session: kyle })).status, 401);
  assert.equal((await a.get("?coaches=t2", { "x-session": kyle })).status, 403);
  assert.equal((await a.get("?users=1", { "x-session": kyle })).status, 403);
  assert.ok([401, 403].includes((await a.post({ kind: "user-save", user: { name: "Kyle", admin: true }, session: kyle })).status));
  // Once Ashley also coaches t2 (another head's team), Kyle can no longer change her code.
  await a.post({ kind: "team-coach", team: "t2", id: ashley, role: "assistant", code: "main-1234" });
  assert.equal((await a.post({ kind: "team-coach-code", team: "t1", id: ashley, newCode: "ash-99999", session: kyle })).status, 403);
  // Removing her from t1 leaves her t2 role.
  await a.post({ kind: "team-coach-remove", team: "t1", id: ashley, session: kyle });
  const all = (await a.get("?users=1", { "x-code": "main-1234" })).body.users;
  assert.deepEqual(all.find((u) => u.id === ashley).roles, { t2: "assistant" });
});

test("review fixes: crafted coach ids, email takeover, assistant schedule edits", async () => {
  const { store, a } = await setup();
  const admin = await a.post({ kind: "user-save", user: { name: "Club Admin", admin: true }, code: "main-1234" });
  let r = await a.post({ kind: "user-save", user: { name: "Kyle", roles: { t1: "head" } }, code: "main-1234" });
  await a.post({ kind: "user-code", id: r.body.user.id, newCode: "kyle-1234", code: "main-1234" });
  const kyle = (await a.post({ kind: "login", code: "kyle-1234" })).body.session;
  // __proto__ and friends are never treated as a coach.
  for (const id of ["__proto__", "constructor", "toString"]) {
    r = await a.post({ kind: "team-coach", team: "t1", id, role: "head", session: kyle });
    assert.equal(r.status, 404, id);
    assert.equal((await a.post({ kind: "team-coach-code", team: "t1", id, newCode: "evil-12345", session: kyle })).status, 404, id);
  }
  assert.equal(({}).roles, undefined, "nothing leaked onto Object.prototype");
  assert.equal((await a.post({ kind: "login", code: "evil-12345" })).status, 401);
  // A head coach adding the admin to their team can't attach an email to the admin's account.
  await a.post({ kind: "team-coach", team: "t1", id: admin.body.user.id, email: "attacker@example.com", role: "assistant", session: kyle });
  const users = (await a.get("?users=1", { "x-code": "main-1234" })).body.users;
  assert.equal(users.find((u) => u.id === admin.body.user.id).email, "", "admin email unchanged");
  // Assistants can't change the schedule or team name, but can change who's out and rotation plans.
  r = await a.post({ kind: "user-save", user: { name: "Ash", roles: { t1: "assistant" } }, code: "main-1234" });
  await a.post({ kind: "user-code", id: r.body.user.id, newCode: "ash-12345", code: "main-1234" });
  const ash = (await a.post({ kind: "login", code: "ash-12345" })).body.session;
  const moved = { ...team, games: [{ ...team.games[0], dt: "2026-11-01T09:00" }] };
  assert.equal((await a.post({ kind: "config", team: "t1", config: moved, session: ash })).status, 403);
  assert.equal((await a.post({ kind: "config", team: "t1", config: { ...team, name: "Renamed" }, session: ash })).status, 403);
  const outOnly = { ...team, games: [{ ...team.games[0], out: ["ana"] }] };
  assert.equal((await a.post({ kind: "config", team: "t1", config: outOnly, session: ash })).status, 200);
  // Game records only for scheduled games.
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "nope", game: { started: true }, code: "main-1234" })).status, 404);
  // Backups carry no code hashes.
  await takeBackup(store, "2026-10-20");
  const snap = JSON.stringify(await store.get("backup/2026-10-20"));
  assert.ok(!snap.includes("codeHash") && !snap.includes('"auth-'), "no hashes in backups");
});

test("review fixes: locked games keep half, availability and goals; main sessions end when the code changes", async () => {
  const { store, a } = await setup();
  const g = { started: true, fullDone: true, half: 30, avail: { ana: true }, goals: [{ side: "us", t: 1, u: "goal1" }], del: [] };
  await a.post({ kind: "game", team: "t1", gid: "g1", game: g, code: "main-1234" });
  const rec = await store.get("game-t1-g1");
  rec.doneAt = Date.now() - LOCK_AFTER - 1;
  await store.setJSON("game-t1-g1", rec);
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: { ...g, half: 35 }, code: "main-1234" })).status, 409);
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: { ...g, avail: { ana: false } }, code: "main-1234" })).status, 409);
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: { ...g, del: ["goal1"] }, code: "main-1234" })).status, 409);
  // Main-code session ends when COACH_CODE changes.
  const s = (await a.post({ kind: "login", code: "main-1234" })).body.session;
  assert.equal((await a.get("?me=1", { "x-session": s })).body.user.name, "Main code");
  const rotated = api(store, { COACH_CODE: "new-main-999" });
  assert.equal((await rotated.get("?me=1", { "x-session": s })).body.user, null);
});

test("club and team list carry team info and coach names, never coach emails", async () => {
  const { a } = await setup();
  await a.post({ kind: "config", team: "t1", config: { ...team, division: "girls", birthYear: "2013-2014", ageGroup: "U14", ident: "", bogus: "x" }, code: "main-1234" });
  await a.post({ kind: "user-save", user: { name: "Randy Wells", email: "randy@example.com", roles: { t1: "head" } }, code: "main-1234" });
  const club = await a.get("?club=1");
  const t1 = club.body.teams.find((t) => t.id === "t1");
  assert.deepEqual([t1.division, t1.birthYear, t1.ageGroup, t1.ident], ["girls", "2013-2014", "U14", ""]);
  assert.deepEqual(t1.coaches, ["Randy Wells"]);
  assert.ok(!JSON.stringify(club.body).includes("randy@example.com"), "no emails on the public club page");
  const list = (await a.get("?list=1")).body.teams.find((t) => t.id === "t1");
  assert.equal(list.ageGroup, "U14");
  assert.equal(list.coaches, undefined);
  // An invalid division from an old client is treated as unspecified.
  await a.post({ kind: "config", team: "t1", config: { ...team, division: "mixed" }, code: "main-1234" });
  assert.equal((await a.get("?list=1")).body.teams.find((t) => t.id === "t1").division, "");
  // A school program travels with the team so it can have its own page.
  await a.post({ kind: "config", team: "t1", config: { ...team, program: "  Athens City Schools " }, code: "main-1234" });
  assert.equal((await a.get("?club=1")).body.teams.find((t) => t.id === "t1").program, "Athens City Schools");
  assert.equal((await a.get("?list=1")).body.teams.find((t) => t.id === "t1").program, "Athens City Schools");
});

test("stats helpers can only add goals and stats", async () => {
  const { a } = await setup();
  const r = await a.post({ kind: "user-save", user: { name: "Parent Helper", roles: { t1: "stats" } }, code: "main-1234" });
  await a.post({ kind: "user-code", id: r.body.user.id, newCode: "help-1234", code: "main-1234" });
  await a.post({ kind: "game", team: "t1", gid: "g1", game: { started: true, acc: 0, goals: [], stats: [] }, code: "main-1234" });
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: { started: true, acc: 0, goals: [], stats: [{ id: "ana", k: "pass", u: "x" }] }, code: "help-1234" })).status, 200);
  assert.equal((await a.post({ kind: "game", team: "t1", gid: "g1", game: { started: false, acc: 0, goals: [], stats: [] }, code: "help-1234" })).status, 403);
});

test("email sign-in: off until set up; one-time link when on", async () => {
  const { store, a } = await setup();
  await a.post({ kind: "user-save", user: { name: "Lori", email: "lori@example.com", roles: { t1: "head" } }, code: "main-1234" });
  assert.equal((await a.post({ kind: "login-email", email: "lori@example.com" })).status, 501);
  const dev = api(store, { ...ENV, DEV_SHOW_LINK: "1" });
  let r = await dev.post({ kind: "login-email", email: "lori@example.com" });
  const tok = new URL(r.body.devLink).searchParams.get("login");
  r = await dev.post({ kind: "login-link", token: tok });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.name, "Lori");
  assert.equal((await dev.post({ kind: "login-link", token: tok })).status, 401, "link works once");
  // Unknown email gets the same answer
  assert.equal((await dev.post({ kind: "login-email", email: "who@example.com" })).body.ok, true);
});

test("practices: coaches save and read; parents can't", async () => {
  const { a } = await setup();
  const p = { id: "p1", date: "2026-10-21T17:30", title: "Build out", blocks: [{ id: "b1", drill: "passing-gates-02a", title: "Gate Hunters", min: 12 }], attendance: { ana: true, bea: false } };
  assert.equal((await a.post({ kind: "practice", team: "t1", practice: p, code: "main-1234" })).status, 200);
  assert.equal((await a.post({ kind: "practice", team: "t1", practice: p })).status, 401);
  const r = await a.get("?practices=t1", { "x-code": "main-1234" });
  assert.equal(r.body.practices[0].blocks[0].min, 12);
  assert.equal((await a.get("?practices=t1")).status, 403);
  await a.post({ kind: "practice-del", team: "t1", id: "p1", code: "main-1234" });
  assert.equal((await a.get("?practices=t1", { "x-code": "main-1234" })).body.practices.length, 0);
});

test("club drills, favorites", async () => {
  const { a } = await setup();
  assert.equal((await a.post({ kind: "drill", drill: { id: "my-rondo", title: "Our Rondo", topic: "possession", how: ["Play"] }, code: "main-1234" })).status, 200);
  const r = await a.get("?drills=1");
  assert.equal(r.body.drills[0].title, "Our Rondo");
  assert.equal(r.body.drills[0].byUid, undefined);
  assert.equal((await a.post({ kind: "clubfav", id: "passing-gates-02a", on: true, code: "main-1234" })).body.favDrills[0], "passing-gates-02a");
  // Personal favorites need a sign-in
  const u = await a.post({ kind: "user-save", user: { name: "Kyle", roles: { t1: "head" } }, code: "main-1234" });
  await a.post({ kind: "user-code", id: u.body.user.id, newCode: "kyle-1234", code: "main-1234" });
  const s = (await a.post({ kind: "login", code: "kyle-1234" })).body.session;
  await a.post({ kind: "fav", id: "my-rondo", on: true, session: s });
  assert.deepEqual((await a.get("?me=1", { "x-session": s })).body.favs, ["my-rondo"]);
});

test("parents' positive stats", async () => {
  const { a } = await setup();
  assert.equal((await a.post({ kind: "pstat", team: "t1", gid: "g1", stat: { id: "ana", k: "pass", t: 1000, u: "p1", dv: "d1" } })).status, 200);
  assert.equal((await a.post({ kind: "pstat", team: "t1", gid: "g1", stat: { id: "ana", k: "bpass", t: 1000, u: "p2", dv: "d1" } })).status, 400);
  assert.equal((await a.get("?team=t1")).body.pstats.g1.length, 1);
});

test("backups: snapshot everything except sign-ins; restore one game", async () => {
  const { store, a } = await setup();
  await a.post({ kind: "game", team: "t1", gid: "g1", game: { started: true, fullDone: true, goals: [goal("us"), goal("us")] }, code: "main-1234" });
  await a.post({ kind: "login", code: "main-1234" });
  await takeBackup(store, "2026-10-18");
  const snap = await store.get("backup/2026-10-18");
  assert.ok(snap.data["game-t1-g1"]);
  assert.ok(!Object.keys(snap.data).some((k) => k.startsWith("sess-")), "no sessions in backups");
  // Someone wipes the game (after unlocking)...
  await a.post({ kind: "game", team: "t1", gid: "g1", game: { started: false, goals: [] }, code: "main-1234", unlock: true });
  // ...and an admin restores it.
  assert.equal((await a.post({ kind: "restore-game", team: "t1", gid: "g1", date: "2026-10-18", code: "main-1234" })).status, 200);
  assert.equal((await store.get("game-t1-g1")).game.goals.length, 2);
  assert.deepEqual((await a.get("?backups=1", { "x-code": "main-1234" })).body.backups, ["2026-10-18"]);
  for (let i = 1; i <= 32; i++) await takeBackup(store, "2026-09-" + String(i).padStart(2, "0"));
  assert.equal((await store.list({ prefix: "backup/" })).blobs.length, 30, "keeps 30");
});

test("tournaments: head coaches add shared events, spelling variants reuse one id, others can't change them", async () => {
  const { a } = await setup();
  const k = { name: "KICKS Invitational", start: "2026-10-17", end: "2026-10-18", venue: "John Hunt Park", link: "https://example.com/kicks" };
  // Parents (no code) and assistants can't add tournaments.
  assert.equal((await a.post({ kind: "tournament", team: "t1", tournament: k })).status, 401);
  let r = await a.post({ kind: "user-save", user: { name: "Randy", roles: { t1: "assistant" } }, code: "main-1234" });
  await a.post({ kind: "user-code", id: r.body.user.id, newCode: "randy-777", code: "main-1234" });
  const asst = (await a.post({ kind: "login", code: "randy-777" })).body.session;
  assert.equal((await a.post({ kind: "tournament", team: "t1", tournament: k, session: asst })).status, 403);
  // A head coach (the main code here) adds it.
  r = await a.post({ kind: "tournament", team: "t1", tournament: k, code: "main-1234" });
  assert.equal(r.status, 200);
  const id = r.body.id;
  assert.equal(id, "kicks-invitational-2026-10");
  // The same event typed differently is the same record, not a duplicate.
  r = await a.post({ kind: "tournament", team: "t1", tournament: { name: "  kicks   INVITATIONAL! ", start: "2026-10-17" }, code: "main-1234" });
  assert.equal(r.body.id, id);
  assert.equal(r.body.existing, true);
  assert.equal(r.body.tournaments.length, 1);
  // Bad input is refused.
  assert.equal((await a.post({ kind: "tournament", team: "t1", tournament: { name: "X", start: "2026-10-18", end: "2026-10-17" }, code: "main-1234" })).status, 400);
  // Games point to it; the club page and team page list it.
  await a.post({ kind: "config", team: "t1", config: { ...team, games: [{ id: "g1", title: "Game 1", tid: id }] }, code: "main-1234" });
  const club = (await a.get("?club=1")).body;
  assert.equal(club.tournaments[0].name, "KICKS Invitational");
  assert.equal(club.teams.find((t) => t.id === "t1").games[0].tid, id);
  assert.equal((await a.get("?team=t1")).body.tournaments.length, 1);
  // Only an admin removes one.
  assert.equal((await a.post({ kind: "tournament-del", team: "t1", id, session: asst })).status, 403);
  assert.equal((await a.post({ kind: "tournament-del", team: "t1", id, code: "main-1234" })).status, 200);
});

test("club summary carries the last save time and postponed status for game status", async () => {
  const { a } = await setup();
  await a.post({ kind: "config", team: "t1", config: { ...team, games: [{ id: "g1", title: "Game 1", status: "postponed" }] }, code: "main-1234" });
  await a.post({ kind: "game", team: "t1", gid: "g1", game: { started: true, fullDone: false, goals: [] }, code: "main-1234" });
  const g = (await a.get("?club=1")).body.teams.find((t) => t.id === "t1").games[0];
  assert.equal(g.status, "postponed");
  assert.ok(g.at > 0, "last saved time is included");
});
