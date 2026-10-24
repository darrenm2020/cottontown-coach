// Cottontown Coach API. Everything lives in one Netlify Blobs store.
// The handler takes the store and environment as arguments so tests can run it against an in-memory store.
//
// Keys
//   teams                      [{id,name}]                 club team index
//   club                       {name,logo,favDrills:[]}    club settings
//   team-ID                    {rev,team,at}               team config (roster, schedule, settings)
//   game-ID-GID                {rev,game,at}               one game's record
//   pstats-ID-GID              [{id,k,t,u,dv,at}]          parents' positive stats
//   auth-ID                    {hash}                      team-only coach code (legacy)
//   audit-ID                   [{at,who,kind,gid,what}]    change history, newest last (500 kept)
//   practices-ID               [practice]                  practice plans
//   drills-club                [drill]                     drills coaches added
//   users                      {uid:{...}}                 coach accounts
//   favs-UID                   [drillId]                   a coach's favorite drills
//   sess-TOKEN / magic-TOKEN   sign-in sessions and one-time email links
//   backup/YYYY-MM-DD          nightly snapshot (30 kept)
//
// Who can do what
//   Main code (COACH_CODE)      admin: everything, every team
//   Team code (legacy)          head coach of that team; turned off when AUTH_REQUIRED is set
//   Signed-in coach             their role on each team: head, assistant or stats; admins everything
//   Anyone with the link        read games and the club page, add parents' positive stats

export const ROLES = { head: 3, assistant: 2, stats: 1 };
const POSITIVE = new Set(["sot", "kp", "pass", "tackle", "slide", "int", "clr", "blk", "cross", "drib", "fwon", "save", "catch", "dist"]);
// Fields that make up a game's result. A finished game can't change these without an explicit unlock.
const LOCKED = ["goals", "saves", "events", "start", "acc", "started", "fullDone", "halfDone", "pk", "stops", "ot", "xt", "half", "form", "avail"];
const STATS_ONLY = new Set(["goals", "stats", "saves", "del"]);
export const LOCK_AFTER = 2 * 3600000;
// A finished game locks 2 hours after it went final. Games finished before doneAt existed count as locked.
const kicks = (g) => !!(g && g.pk && ((g.pk.us || []).length || (g.pk.them || []).length));
export const wipesResult = (old, g) => !!(old && old.fullDone && (old.started || (old.goals || []).length || kicks(old)) &&
  ((!g.started && !(g.goals || []).length && !kicks(g)) || (kicks(old) && !g.pk)));
export const isLocked = (rec, now = Date.now()) => !!(rec && rec.game && rec.game.fullDone && (!rec.doneAt || now - rec.doneAt > LOCK_AFTER));
const DAY = 86400000;

export const okId = (s) => typeof s === "string" && /^[a-z0-9-]{1,40}$/.test(s);
export const okGid = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(s);
const okTok = (s) => typeof s === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(s);
// Coach ids: letters, digits, dash or underscore, starting with a letter or digit (never "__proto__" and the like).
const okUid = (s) => typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(s);
// Coach records keyed by id, with no prototype, so a request can only ever reach a real coach.
async function loadUsers(store) { return Object.assign(Object.create(null), (await store.get("users", { type: "json" })) || {}); }
const userAt = (users, id) => (okUid(id) && Object.hasOwn(users, id) ? users[id] : null);
const okEmail = (s) => typeof s === "string" && s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const clip = (s, n) => String(s ?? "").slice(0, n);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("tracker:" + s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function token() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const flag = (v) => /^(1|true|yes|on)$/i.test(String(v || "").trim());

// ---------- who is asking ----------
// Returns {role, name, uid, admin} for this team, or null. creds: {code, session}.
export async function whoIs(store, env, team, creds) {
  const code = String(creds.code ?? "").trim();
  const master = String(env.COACH_CODE || "").trim();
  if (code && master && code === master) return { role: "head", name: "Main code", uid: "main", admin: true };
  if (code && team && !flag(env.AUTH_REQUIRED)) {
    const a = await store.get("auth-" + team, { type: "json" });
    if (a && a.hash && a.hash === (await sha(code))) return { role: "head", name: "Team code", uid: "team-code", admin: false };
  }
  if (code) {
    // A coach's personal code works like signing in.
    const u = await userByCode(store, code);
    if (u) return asRole(u, team);
  }
  const s = String(creds.session ?? "").trim();
  if (okTok(s) || /^[a-f0-9]{48}$/.test(s)) {
    const sess = await store.get("sess-" + s, { type: "json" });
    if (sess && sess.exp > Date.now()) {
      if (sess.uid === "main") return sess.mh && sess.mh === (await sha("main:" + master)) ? { role: "head", name: "Main code", uid: "main", admin: true } : null;
      const users = await loadUsers(store);
      const u = userAt(users, sess.uid);
      if (u && !u.disabled) return asRole(u, team);
    }
  }
  return null;
}
// A team's test copy ("ID-test") lets in the same coaches as the real team.
export const TEST_SUFFIX = "-test";
export const testOf = (team) => (typeof team === "string" && team.endsWith(TEST_SUFFIX) ? team.slice(0, -TEST_SUFFIX.length) : null);
function asRole(u, team) {
  if (u.admin) return { role: "head", name: u.name, uid: u.id, admin: true };
  const role = team && u.roles ? u.roles[team] || (testOf(team) ? u.roles[testOf(team)] : null) : null;
  return role && ROLES[role] ? { role, name: u.name, uid: u.id, admin: false } : { role: null, name: u.name, uid: u.id, admin: false };
}
async function userByCode(store, code) {
  if (String(code).length < 4) return null;
  const users = await loadUsers(store);
  const h = await sha("user:" + code);
  return Object.values(users).find((u) => u.codeHash === h && !u.disabled) || null;
}
const atLeast = (w, role) => !!w && (w.admin || (ROLES[w.role] || 0) >= ROLES[role]);
// What a team's head coach sees about a coach: their role on this team only.
const teamUser = (u, team) => ({ id: u.id, name: u.name, email: u.email || "", role: (u.roles || {})[team] || null, hasCode: !!u.codeHash, admin: !!u.admin });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email || "", admin: !!u.admin, roles: u.roles || {}, hasCode: !!u.codeHash, disabled: !!u.disabled });

// ---------- change history ----------
async function audit(store, team, w, kind, what, gid) {
  if (!what) return;
  const key = "audit-" + team;
  const list = (await store.get(key, { type: "json" })) || [];
  list.push({ at: Date.now(), who: w ? w.name : "Unknown", kind, gid: gid || "", what: clip(what, 300) });
  await store.setJSON(key, list.slice(-500));
}
const scoreOf = (g) => {
  const gl = (g && Array.isArray(g.goals)) ? g.goals : [];
  const pk = g && g.pk ? ` (PKs ${(g.pk.us || []).filter((k) => k.made).length}–${(g.pk.them || []).filter(Boolean).length})` : "";
  return gl.filter((x) => x.side === "us").length + "–" + gl.filter((x) => x.side === "them").length + pk;
};
export function describeGameChange(a, b) {
  if (!a) return b && b.fullDone ? "Result added: " + scoreOf(b) : "";
  const out = [];
  if (a.started && !b.started) out.push("Game reset (was " + scoreOf(a) + ")");
  else {
    if (!a.started && b.started) out.push("Kicked off");
    if (scoreOf(a) !== scoreOf(b)) out.push("Score " + scoreOf(a) + " → " + scoreOf(b));
    if (!a.fullDone && b.fullDone) out.push("Final " + scoreOf(b));
    if (a.fullDone && !b.fullDone) out.push("Reopened");
  }
  const ev = (g) => (Array.isArray(g.events) ? g.events.length : 0);
  if (b.started && a.started && ev(b) < ev(a)) out.push("Subs undone");
  if (!same(a.plan, b.plan)) out.push("Rotation plan changed");
  return out.join("; ");
}
function describeConfigChange(a, b) {
  if (!a) return "Team created";
  const out = [];
  const ids = (x) => new Set((x.players || []).map((p) => p.id));
  const pa = ids(a), pb = ids(b);
  const added = (b.players || []).filter((p) => !pa.has(p.id)).map((p) => p.name);
  const removed = (a.players || []).filter((p) => !pb.has(p.id)).map((p) => p.name);
  if (added.length) out.push("Added " + added.join(", "));
  if (removed.length) out.push("Removed " + removed.join(", "));
  const ga = new Set((a.games || []).map((g) => g.id)), gb = new Set((b.games || []).map((g) => g.id));
  const gAdd = (b.games || []).filter((g) => !ga.has(g.id)).map((g) => g.title || g.opp || g.id);
  const gDel = (a.games || []).filter((g) => !gb.has(g.id)).map((g) => g.title || g.opp || g.id);
  if (gAdd.length) out.push("New game: " + gAdd.join(", "));
  if (gDel.length) out.push("Removed game: " + gDel.join(", "));
  if (!out.length && !same(a, b)) out.push("Team settings changed");
  return out.join("; ");
}

// ---------- email sign-in ----------
async function sendLoginEmail(env, to, name, link) {
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key) return false;
  const from = String(env.MAIL_FROM || "Cottontown Coach <onboarding@resend.dev>");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: "Your Cottontown Coach sign-in link",
      text: `Hi ${name},\n\nTap to sign in to Cottontown Coach:\n${link}\n\nThe link works once and expires in 20 minutes.` }),
  });
  return r.ok;
}
// A copy of each feedback note by email, only if FEEDBACK_TO (and RESEND_API_KEY) are set in Netlify.
async function sendFeedbackEmail(env, f) {
  const key = String(env.RESEND_API_KEY || "").trim(), to = String(env.FEEDBACK_TO || "").trim();
  if (!key || !to) return false;
  const from = String(env.MAIL_FROM || "Cottontown Coach <onboarding@resend.dev>");
  const lines = [f.text, "", f.type ? "Type: " + f.type : "", f.name ? "From: " + f.name : "", f.contact ? "Contact: " + f.contact : "",
    "Page: " + (f.page || "?") + (f.team ? " (team " + f.team + (f.game ? ", game " + f.game : "") + ")" : ""), f.role ? "Viewing as: " + f.role : ""].filter((x) => x !== "");
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: "Cottontown Coach feedback" + (f.type ? " (" + f.type + ")" : ""), text: lines.join("\n") }) });
  return r.ok;
}
async function newSession(store, uid, env) {
  const t = token();
  // Main-code sessions remember which main code made them, so changing COACH_CODE signs them out.
  const mh = uid === "main" ? await sha("main:" + String(env.COACH_CODE || "").trim()) : undefined;
  await store.setJSON("sess-" + t, { uid, exp: Date.now() + 60 * DAY, at: Date.now(), mh });
  return t;
}

// ---------- input cleanup ----------
function cleanPractice(p, w) {
  const blocks = (Array.isArray(p.blocks) ? p.blocks : []).slice(0, 30).map((x) => ({
    id: clip(x.id, 40), drill: clip(x.drill, 60), title: clip(x.title, 120), min: Math.max(0, Math.min(120, Math.round(Number(x.min) || 0))), notes: clip(x.notes, 2000),
  }));
  const att = {};
  if (p.attendance && typeof p.attendance === "object") Object.entries(p.attendance).slice(0, 60).forEach(([k, v]) => { if (okTok(k)) att[k] = !!v; });
  return { id: clip(p.id, 40), date: clip(p.date, 16), title: clip(p.title, 120), focus: clip(p.focus, 200), place: clip(p.place, 200),
    notes: clip(p.notes, 4000), blocks, attendance: att, updatedAt: Date.now(), by: w.name };
}
function cleanDrill(d, w, team) {
  const arr = (x, n, m) => (Array.isArray(x) ? x : []).slice(0, n).map((s) => clip(s, m));
  const items = d.diagram && Array.isArray(d.diagram.items) ? d.diagram.items.slice(0, 60) : [];
  return { id: clip(d.id, 60), title: clip(d.title, 120), topic: clip(d.topic, 40), ages: arr(d.ages, 3, 8), players: clip(d.players, 20),
    minutes: Math.max(0, Math.min(60, Math.round(Number(d.minutes) || 0))), intensity: clip(d.intensity, 10), space: clip(d.space, 40),
    equipment: arr(d.equipment, 12, 80), summary: clip(d.summary, 300), setup: clip(d.setup, 1500), how: arr(d.how, 12, 600), coaching: arr(d.coaching, 10, 300),
    easier: clip(d.easier, 600), harder: clip(d.harder, 600), video: /^https:\/\//.test(String(d.video || "")) ? clip(d.video, 300) : "",
    diagram: items.length ? { w: Number(d.diagram.w) || 40, h: Number(d.diagram.h) || 30, items } : null,
    custom: true, by: w.name, byUid: w.uid, team: team || "", updatedAt: Date.now() };
}

// ---------- the handler ----------
export async function handle(req, { store, env }) {
  const now = Date.now();
  const url = new URL(req.url);
  const q = url.searchParams;
  const hdr = (k) => req.headers.get(k) || "";

  if (req.method === "POST") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
    if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
    if (!String(env.COACH_CODE || "").trim()) return json({ error: "COACH_CODE is not set in Netlify" }, 500);
    const team = b.team ? b.team : "cottontown";
    if (!okId(team)) return json({ error: "bad team" }, 400);
    const kind = b.kind || (b.verify ? "verify" : "");
    const creds = { code: b.code, session: b.session || hdr("x-session") };

    // --- feedback from anyone (no sign-in); only admins can read it ---
    if (kind === "feedback") {
      const f = b.feedback && typeof b.feedback === "object" ? b.feedback : {};
      if (f.website) return json({ ok: true, now }); // hidden field only bots fill in
      const text = String(f.text || "").trim();
      if (text.length < 3) return json({ error: "Write a little more so we know what you mean." }, 400);
      const list = (await store.get("feedback", { type: "json" })) || [];
      if (list.filter((x) => now - x.at < 10 * 60000).length >= 30) return json({ error: "Lots of feedback just came in. Please try again in a few minutes." }, 429);
      const types = ["idea", "problem", "question", "praise"];
      const item = { id: "f" + now.toString(36) + Math.random().toString(36).slice(2, 6), at: now, text: clip(text, 2000),
        type: types.includes(f.type) ? f.type : "", name: clip(String(f.name || "").trim(), 60), contact: clip(String(f.contact || "").trim(), 120),
        page: clip(String(f.page || ""), 200), team: okId(f.team) ? f.team : "", game: okGid(f.game) ? f.game : "", tab: clip(String(f.tab || ""), 20),
        role: ["parent", "coach"].includes(f.role) ? f.role : "", ver: clip(String(f.ver || ""), 20), screen: clip(String(f.screen || ""), 20), done: false };
      list.unshift(item);
      await store.setJSON("feedback", list.slice(0, 500));
      await sendFeedbackEmail(env, item).catch(() => {});
      return json({ ok: true, now });
    }

    // --- parents' positive stats (no sign-in) ---
    if (kind === "pstat" || kind === "pstatdel") {
      if (!okGid(b.gid)) return json({ error: "bad request" }, 400);
      const cfg = await store.get("team-" + team, { type: "json" });
      const games = cfg && cfg.team && Array.isArray(cfg.team.games) ? cfg.team.games : [];
      if (!games.some((g) => g && g.id === b.gid)) return json({ error: "no such game" }, 404);
      const key = "pstats-" + team + "-" + b.gid;
      const list = (await store.get(key, { type: "json" })) || [];
      if (kind === "pstat") {
        const s = b.stat || {};
        const players = Array.isArray(cfg.team.players) ? cfg.team.players : [];
        if (!POSITIVE.has(s.k) || !okTok(s.id) || !players.some((p) => p && p.id === s.id) || !okTok(s.u) || !okTok(s.dv)) return json({ error: "bad stat" }, 400);
        const t = Math.max(0, Math.min(4 * 3600000, Math.round(Number(s.t) || 0)));
        if (list.length >= 3000) return json({ error: "too many" }, 413);
        if (!list.some((x) => x.u === s.u)) list.push({ id: s.id, k: s.k, t, u: s.u, dv: s.dv, at: now });
        await store.setJSON(key, list);
        return json({ ok: true, now, n: list.length });
      }
      const w = await whoIs(store, env, team, creds);
      const coach = atLeast(w, "stats");
      const i = list.findIndex((x) => x.u === b.u && (coach || x.dv === b.dv));
      if (i < 0) return json({ error: "not found" }, 404);
      list.splice(i, 1);
      await store.setJSON(key, list);
      return json({ ok: true, now });
    }

    // --- signing in ---
    if (kind === "login") {
      const code = String(b.code ?? "").trim();
      if (code && code === String(env.COACH_CODE).trim()) {
        return json({ ok: true, now, session: await newSession(store, "main", env), user: { id: "main", name: "Main code", admin: true, roles: {} } });
      }
      const u = await userByCode(store, code);
      if (!u) return json({ error: "That code didn’t work" }, 401);
      return json({ ok: true, now, session: await newSession(store, u.id, env), user: publicUser(u) });
    }
    if (kind === "login-email") {
      const email = String(b.email || "").trim().toLowerCase();
      const users = await loadUsers(store);
      const u = Object.values(users).find((x) => x.email === email && !x.disabled);
      if (!String(env.RESEND_API_KEY || "").trim() && !flag(env.DEV_SHOW_LINK)) return json({ error: "Email sign-in isn’t set up yet. Use your coach code.", setup: false }, 501);
      // Same answer whether or not the email is on file, so the form can't be used to find coaches' emails.
      if (u) {
        const t = token();
        await store.setJSON("magic-" + t, { uid: u.id, exp: now + 20 * 60000 });
        const site = String(env.SITE_URL || url.origin).replace(/\/+$/, "");
        const link = site + "/?team=" + encodeURIComponent(team) + "&login=" + t;
        if (flag(env.DEV_SHOW_LINK)) return json({ ok: true, now, devLink: link });
        await sendLoginEmail(env, email, u.name, link);
      }
      return json({ ok: true, now });
    }
    if (kind === "login-link") {
      const t = String(b.token || "");
      if (!/^[a-f0-9]{48}$/.test(t)) return json({ error: "That link didn’t work" }, 400);
      const m = await store.get("magic-" + t, { type: "json" });
      await store.delete("magic-" + t);
      if (!m || m.exp < now) return json({ error: "That link has expired. Ask for a new one." }, 401);
      const users = await loadUsers(store);
      const u = userAt(users, m.uid);
      if (!u || u.disabled) return json({ error: "That account is turned off" }, 401);
      return json({ ok: true, now, session: await newSession(store, u.id, env), user: publicUser(u) });
    }
    if (kind === "logout") {
      const s = String(creds.session || "");
      if (/^[a-f0-9]{48}$/.test(s)) await store.delete("sess-" + s);
      return json({ ok: true, now });
    }

    const w = await whoIs(store, env, team, creds);

    // --- a coach's own favorites ---
    if (kind === "fav") {
      if (!w || !w.uid || w.uid === "team-code") return json({ error: "Sign in to save favorites" }, 401);
      const key = "favs-" + w.uid;
      const list = new Set((await store.get(key, { type: "json" })) || []);
      if (b.on) list.add(clip(b.id, 60)); else list.delete(clip(b.id, 60));
      await store.setJSON(key, [...list].slice(0, 500));
      return json({ ok: true, now, favs: [...list] });
    }
    if (kind === "mycode") {
      if (!w || !w.uid || w.uid === "main" || w.uid === "team-code") return json({ error: "Sign in first" }, 401);
      const nc = String(b.newCode ?? "").trim();
      if (nc.length < 6) return json({ error: "Use at least 6 characters" }, 400);
      if (await userByCode(store, nc)) return json({ error: "Pick a different code" }, 409);
      const users = await loadUsers(store);
      if (!userAt(users, w.uid)) return json({ error: "not found" }, 404);
      users[w.uid].codeHash = await sha("user:" + nc);
      await store.setJSON("users", users);
      return json({ ok: true, now });
    }

    if (!w || (!w.admin && !w.role)) return json({ error: "wrong code" }, 401);
    if (kind === "verify") return json({ ok: true, now, master: !!w.admin, role: w.role, name: w.name });

    // --- team settings, roster, schedule ---
    if (kind === "config") {
      if (!b.config || typeof b.config !== "object") return json({ error: "bad request" }, 400);
      if (JSON.stringify(b.config).length > 1500000) return json({ error: "too large" }, 413);
      const cur = await store.get("team-" + team, { type: "json" });
      if (!cur && !w.admin) return json({ error: "only the main code can create teams" }, 403);
      if (!atLeast(w, "head") && !(atLeast(w, "assistant") && cur && sameRoster(cur.team, b.config))) return json({ error: "Only a head coach can change the roster or schedule" }, 403);
      const rev = ((cur && cur.rev) || 0) + 1;
      // A test team keeps its label and never joins the team list (club page, team switcher).
      if (testOf(team) || (cur && cur.team && cur.team.test)) Object.assign(b.config, { test: true, testOf: testOf(team) || cur.team.testOf });
      await store.setJSON("team-" + team, { rev, team: b.config, at: now });
      if (!b.config.test) {
        const idx = (await store.get("teams", { type: "json" })) || [];
        const name = clip(b.config.name || team, 80);
        const i = idx.findIndex((t) => t.id === team);
        if (i < 0) idx.push({ id: team, name }); else idx[i].name = name;
        await store.setJSON("teams", idx);
      }
      await audit(store, team, w, "config", describeConfigChange(cur && cur.team, b.config));
      return json({ ok: true, now, rev });
    }

    // --- one game's record ---
    if (kind === "game") {
      if (!okGid(b.gid) || !b.game || typeof b.game !== "object") return json({ error: "bad request" }, 400);
      if (JSON.stringify(b.game).length > 400000) return json({ error: "too large" }, 413);
      const cfg = await store.get("team-" + team, { type: "json" });
      if (!cfg || !cfg.team || !(cfg.team.games || []).some((g) => g && g.id === b.gid)) return json({ error: "That game isn’t on this team’s schedule" }, 404);
      const key = "game-" + team + "-" + b.gid;
      const cur = await store.get(key, { type: "json" });
      const old = cur && cur.game;
      if (!old && w.role === "stats" && !w.admin) return json({ error: "A coach needs to open this game first" }, 403);
      if (old && w.role === "stats" && !w.admin) {
        const changed = new Set([...Object.keys(old), ...Object.keys(b.game)].filter((k) => !same(old[k], b.game[k])));
        if ([...changed].some((k) => !STATS_ONLY.has(k))) return json({ error: "Stats helpers can only add goals and stats" }, 403);
      }
      const lockedIds = isLocked(cur, now) ? new Set([...(old.goals || []), ...(old.saves || [])].map((x) => x && x.u).filter(Boolean)) : null;
      const delsLocked = lockedIds && (Array.isArray(b.game.del) ? b.game.del : []).some((u) => lockedIds.has(u));
      if (isLocked(cur, now) && (delsLocked || LOCKED.some((k) => !same(old[k], b.game[k])))) {
        if (!b.unlock) return json({ error: "locked", message: "This game is final. Unlock it to change the result." }, 409);
        if (!atLeast(w, "head")) return json({ error: "Only a head coach can change a finished game" }, 403);
      }
      // A finished game's result is never cleared by an ordinary save (a stale phone, a reset, a bad update):
      // wiping it back to not-started, or dropping its shootout, takes a head coach who unlocked it.
      if (wipesResult(old, b.game)) {
        if (!b.unlock) return json({ error: "locked", message: "This game is final. Unlock it to change the result." }, 409);
        if (!atLeast(w, "head")) return json({ error: "Only a head coach can change a finished game" }, 403);
      }
      const rev = ((cur && cur.rev) || 0) + 1;
      // doneAt: when the game first went final. It stays editable for LOCK_AFTER (shootouts, quick fixes), then locks.
      const doneAt = b.game.fullDone ? ((old && old.fullDone && cur.doneAt) || now) : null;
      await store.setJSON(key, { rev, game: b.game, at: now, doneAt });
      await audit(store, team, w, "game", describeGameChange(old, b.game) + (b.unlock && old && old.fullDone ? " (unlocked)" : ""), b.gid);
      return json({ ok: true, now, rev });
    }

    // --- tournaments: shared records (one id per event) that games point to with `tid` ---
    if (kind === "tournament") {
      if (!atLeast(w, "head")) return json({ error: "Only a head coach can add or change tournaments" }, 403);
      const t = cleanTournament(b.tournament);
      if (!t) return json({ error: "A tournament needs a name; dates must be YYYY-MM-DD, end on or after start" }, 400);
      const list = await loadTournaments(store);
      const cur = t.id ? list.find((x) => x.id === t.id) : null;
      if (cur) {
        if (!w.admin && cur.team !== team) return json({ error: "Only the coach who added this tournament or an admin can change it" }, 403);
        Object.assign(cur, { name: t.name, start: t.start, end: t.end, venue: t.venue, link: t.link, at: now });
        await store.setJSON("tournaments", list);
        return json({ ok: true, now, id: cur.id, tournaments: list });
      }
      // The same event typed a little differently (case, spacing, punctuation) reuses the existing record.
      const same = list.find((x) => tourKey(x.name) === tourKey(t.name) && (!t.start || !x.start || x.start.slice(0, 4) === t.start.slice(0, 4)));
      if (same) return json({ ok: true, now, id: same.id, existing: true, tournaments: list });
      let id = (tourKey(t.name).replace(/ /g, "-").slice(0, 30) || "event") + (t.start ? "-" + t.start.slice(0, 7) : "");
      for (let i = 2; list.some((x) => x.id === id); i++) id = id.replace(/-\d+$/, "") + "-" + i;
      list.push({ ...t, id, team, by: clip(w.name, 60), at: now });
      await store.setJSON("tournaments", list);
      return json({ ok: true, now, id, tournaments: list });
    }
    if (kind === "feedback-done" || kind === "feedback-del") {
      if (!w.admin) return json({ error: "Admins only" }, 403);
      const list = (await store.get("feedback", { type: "json" })) || [];
      const i = list.findIndex((x) => x.id === b.id);
      if (i < 0) return json({ error: "not found" }, 404);
      if (kind === "feedback-del") list.splice(i, 1); else list[i].done = !!b.done;
      await store.setJSON("feedback", list);
      return json({ ok: true, now, feedback: list });
    }
    if (kind === "tournament-del") {
      if (!w.admin) return json({ error: "Only an admin can remove a tournament" }, 403);
      const list = (await loadTournaments(store)).filter((x) => x.id !== b.id);
      await store.setJSON("tournaments", list);
      return json({ ok: true, now, tournaments: list });
    }

    if (kind === "club") {
      if (!w.admin) return json({ error: "only the main code can edit the club" }, 403);
      const cur = (await store.get("club", { type: "json" })) || {};
      const c = b.club || {};
      const club = { ...cur, name: clip(c.name, 80), logo: typeof c.logo === "string" && c.logo.length < 400000 ? c.logo : null };
      await store.setJSON("club", club);
      return json({ ok: true, now });
    }
    if (kind === "clubfav") {
      if (!w.admin) return json({ error: "Only an admin can change club favorites" }, 403);
      const cur = (await store.get("club", { type: "json" })) || {};
      const favs = new Set(cur.favDrills || []);
      if (b.on) favs.add(clip(b.id, 60)); else favs.delete(clip(b.id, 60));
      await store.setJSON("club", { ...cur, favDrills: [...favs] });
      return json({ ok: true, now, favDrills: [...favs] });
    }

    // Test team: a private copy of this team (players, games, plans, practices, coach code) to try things on.
    // Making or resetting it copies the real team again; deleting removes it. Head coaches only.
    if (kind === "testcopy" || kind === "testdel") {
      if (testOf(team)) return json({ error: "This is already the test team" }, 400);
      if (!atLeast(w, "head")) return json({ error: "Only a head coach can do that" }, 403);
      const tid = team + TEST_SUFFIX;
      if (!okId(tid)) return json({ error: "That team's name is too long for a test copy" }, 400);
      const old = await store.list({ prefix: "game-" + tid + "-" });
      for (const x of old.blobs) await store.delete(x.key);
      if (kind === "testdel") {
        for (const k of ["team-", "practices-", "auth-", "audit-"]) await store.delete(k + tid);
        return json({ ok: true, now });
      }
      const src = await store.get("team-" + team, { type: "json" });
      if (!src || !src.team) return json({ error: "Save the team first" }, 400);
      const c = JSON.parse(JSON.stringify(src.team));
      const realName = c.name || team;
      Object.assign(c, { name: "TEST · " + realName, short: "TEST", test: true, testOf: team });
      const cur = await store.get("team-" + tid, { type: "json" });
      await store.setJSON("team-" + tid, { rev: ((cur && cur.rev) || 0) + 1, team: c, at: now });
      const games = await store.list({ prefix: "game-" + team + "-" });
      let n = 0;
      for (const x of games.blobs) {
        const v = await store.get(x.key, { type: "json" });
        if (!v) continue;
        await store.setJSON("game-" + tid + "-" + x.key.slice(("game-" + team + "-").length), { ...v, rev: (v.rev || 0) + 1000, at: now });
        n++;
      }
      for (const k of ["practices-", "auth-"]) { const v = await store.get(k + team, { type: "json" }); if (v) await store.setJSON(k + tid, v); else await store.delete(k + tid); }
      await audit(store, team, w, "config", "Test team copied from this team");
      return json({ ok: true, now, team: tid, games: n });
    }

    if (kind === "setcode") {
      if (!atLeast(w, "head")) return json({ error: "Only a head coach can set the team code" }, 403);
      const nc = String(b.newCode ?? "").trim();
      if (nc.length < 4) return json({ error: "code must be at least 4 characters" }, 400);
      await store.setJSON("auth-" + team, { hash: await sha(nc) });
      await audit(store, team, w, "code", "Team code changed");
      return json({ ok: true, now });
    }

    // --- practices ---
    if (kind === "practice" || kind === "practice-del") {
      if (!atLeast(w, "assistant")) return json({ error: "Coaches only" }, 403);
      const key = "practices-" + team;
      const list = (await store.get(key, { type: "json" })) || [];
      const id = clip(kind === "practice" ? b.practice && b.practice.id : b.id, 40);
      if (!okTok(id)) return json({ error: "bad request" }, 400);
      const i = list.findIndex((p) => p.id === id);
      if (kind === "practice-del") { if (i >= 0) list.splice(i, 1); }
      else {
        if (JSON.stringify(b.practice).length > 60000) return json({ error: "too large" }, 413);
        const p = cleanPractice(b.practice, w);
        if (i >= 0) list[i] = p; else { if (list.length >= 400) return json({ error: "too many" }, 413); list.push(p); }
      }
      await store.setJSON(key, list);
      return json({ ok: true, now });
    }

    // --- drills coaches add (shared with the whole club) ---
    if (kind === "drill" || kind === "drill-del") {
      if (!atLeast(w, "assistant")) return json({ error: "Coaches only" }, 403);
      const list = (await store.get("drills-club", { type: "json" })) || [];
      const id = clip(kind === "drill" ? b.drill && b.drill.id : b.id, 60);
      if (!/^[a-z0-9-]{3,60}$/.test(id)) return json({ error: "bad request" }, 400);
      const i = list.findIndex((d) => d.id === id);
      if (i >= 0 && !w.admin && list[i].byUid && list[i].byUid !== w.uid) return json({ error: "Only the coach who added it (or an admin) can change it" }, 403);
      if (kind === "drill-del") { if (i >= 0) list.splice(i, 1); }
      else {
        if (JSON.stringify(b.drill).length > 30000) return json({ error: "too large" }, 413);
        const d = cleanDrill(b.drill, w, team);
        if (!d.title) return json({ error: "Give the drill a name" }, 400);
        if (i >= 0) list[i] = d; else { if (list.length >= 600) return json({ error: "too many" }, 413); list.push(d); }
      }
      await store.setJSON("drills-club", list);
      return json({ ok: true, now });
    }

    // --- a team's coaches (that team's head coaches, or admins) ---
    // Head coaches manage roles on their own team only. They can set a code only for a coach whose roles
    // are all on teams they head (never an admin), so they can't take over anyone else's account.
    if (kind === "team-coach" || kind === "team-coach-remove" || kind === "team-coach-code") {
      if (!atLeast(w, "head")) return json({ error: "Only a head coach can manage this team’s coaches" }, 403);
      const users = await loadUsers(store);
      const headOf = async (t) => w.admin || (await whoIs(store, env, t, creds))?.role === "head";
      if (kind === "team-coach") {
        const email = String(b.email || "").trim().toLowerCase();
        const role = String(b.role || "");
        if (!ROLES[role]) return json({ error: "Pick a role" }, 400);
        if (email && !okEmail(email)) return json({ error: "That email doesn’t look right" }, 400);
        let u = b.id ? userAt(users, b.id) : email ? Object.values(users).find((x) => x.email === email) : null;
        if (b.id && !u) return json({ error: "not found" }, 404);
        if (!u) {
          if (!clip(b.name, 60)) return json({ error: "Give the coach a name" }, 400);
          const id = "u" + token().slice(0, 10);
          u = users[id] = { id, name: clip(b.name, 60), email, admin: false, roles: {}, created: now };
        }
        // An existing coach's email is only changed by a club admin (it's where their sign-in links go).
        u.roles = { ...(u.roles || {}), [team]: role };
        await store.setJSON("users", users);
        await audit(store, team, w, "coach", `${u.name} is now ${role === "head" ? "a head coach" : role === "assistant" ? "an assistant" : "a stats helper"}`);
        return json({ ok: true, now, user: teamUser(u, team) });
      }
      const u = userAt(users, b.id);
      if (!u) return json({ error: "not found" }, 404);
      if (kind === "team-coach-remove") {
        if (u.roles) delete u.roles[team];
        await store.setJSON("users", users);
        await audit(store, team, w, "coach", `${u.name} removed from the team`);
        return json({ ok: true, now });
      }
      if (!w.admin) {
        const teams = Object.keys(u.roles || {});
        if (u.admin || !teams.length) return json({ error: "Ask a club admin to set this coach’s code" }, 403);
        for (const t of teams) if (!(await headOf(t))) return json({ error: "This coach also works with another team. Ask a club admin to set their code." }, 403);
      }
      const nc = String(b.newCode ?? "").trim();
      if (nc.length < 6) return json({ error: "Use at least 6 characters" }, 400);
      const other = await userByCode(store, nc);
      if (other && other.id !== u.id) return json({ error: "Pick a different code" }, 409);
      u.codeHash = await sha("user:" + nc);
      await store.setJSON("users", users);
      return json({ ok: true, now });
    }

    // --- coach accounts (admins) ---
    if (kind === "user-save" || kind === "user-del" || kind === "user-code") {
      if (!w.admin) return json({ error: "Only an admin can manage coaches" }, 403);
      const users = await loadUsers(store);
      const src = b.user || {};
      const id = clip(src.id || b.id || "", 40) || "u" + token().slice(0, 10);
      if (!okUid(id)) return json({ error: "bad request" }, 400);
      if (kind === "user-del") { delete users[id]; await store.setJSON("users", users); return json({ ok: true, now }); }
      if (kind === "user-code") {
        if (!userAt(users, id)) return json({ error: "not found" }, 404);
        const nc = String(b.newCode ?? "").trim();
        if (nc.length < 6) return json({ error: "Use at least 6 characters" }, 400);
        const other = await userByCode(store, nc);
        if (other && other.id !== id) return json({ error: "Pick a different code" }, 409);
        users[id].codeHash = await sha("user:" + nc);
        await store.setJSON("users", users);
        return json({ ok: true, now });
      }
      const email = String(src.email || "").trim().toLowerCase();
      if (email && !okEmail(email)) return json({ error: "That email doesn’t look right" }, 400);
      if (email && Object.values(users).some((u) => u.email === email && u.id !== id)) return json({ error: "Another coach already uses that email" }, 409);
      const roles = {};
      Object.entries(src.roles || {}).forEach(([t, r]) => { if (okId(t) && ROLES[r]) roles[t] = r; });
      const prev = userAt(users, id) || { created: now };
      users[id] = { ...prev, id, name: clip(src.name, 60) || "Coach", email, admin: !!src.admin, roles, disabled: !!src.disabled };
      await store.setJSON("users", users);
      return json({ ok: true, now, user: publicUser(users[id]) });
    }

    // --- backups (admins) ---
    if (kind === "backup-now") {
      if (!w.admin) return json({ error: "Admins only" }, 403);
      const date = await takeBackup(store);
      return json({ ok: true, now, date });
    }
    if (kind === "restore-game") {
      // Admins, or a head coach putting back one of their own team's games.
      if (!atLeast(w, "head")) return json({ error: "Head coaches only" }, 403);
      if (!okGid(b.gid) || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ""))) return json({ error: "bad request" }, 400);
      const snap = await store.get("backup/" + b.date, { type: "json" });
      const v = snap && snap.data && snap.data["game-" + team + "-" + b.gid];
      if (!v || !v.game) return json({ error: "That game isn’t in this backup" }, 404);
      const key = "game-" + team + "-" + b.gid;
      const cur = await store.get(key, { type: "json" });
      const rev = ((cur && cur.rev) || 0) + 1;
      await store.setJSON(key, { rev, game: v.game, at: now, doneAt: v.game.fullDone ? (v.doneAt || now - LOCK_AFTER - 1) : null });
      await audit(store, team, w, "restore", "Restored from the " + b.date + " backup: " + scoreOf(v.game), b.gid);
      return json({ ok: true, now, rev });
    }

    return json({ error: "bad request" }, 400);
  }

  // ---------- GET ----------
  const creds = { code: hdr("x-code"), session: hdr("x-session") };

  if (q.get("authcfg")) {
    return json({ now, authRequired: flag(env.AUTH_REQUIRED), email: !!String(env.RESEND_API_KEY || "").trim() || flag(env.DEV_SHOW_LINK) });
  }
  if (q.get("me")) {
    const w = await whoIs(store, env, "", creds);
    if (!w) return json({ now, user: null });
    if (w.uid === "main") return json({ now, user: { id: "main", name: "Main code", admin: true, roles: {} }, favs: [] });
    const users = await loadUsers(store);
    const u = userAt(users, w.uid);
    const favs = (await store.get("favs-" + w.uid, { type: "json" })) || [];
    return json({ now, user: u ? publicUser(u) : null, favs });
  }
  if (q.get("feedback")) {
    const w = await whoIs(store, env, "", creds);
    if (!w || !w.admin) return json({ error: "Admins only" }, 403);
    return json({ now, feedback: (await store.get("feedback", { type: "json" })) || [] });
  }
  if (q.get("users")) {
    const w = await whoIs(store, env, "", creds);
    if (!w || !w.admin) return json({ error: "Admins only" }, 403);
    const users = await loadUsers(store);
    return json({ now, users: Object.values(users).map(publicUser) });
  }
  if (q.get("coaches")) {
    const team = q.get("coaches");
    if (!okId(team)) return json({ error: "bad team" }, 400);
    const w = await whoIs(store, env, team, creds);
    if (!atLeast(w, "head")) return json({ error: "Head coaches only" }, 403);
    const users = await loadUsers(store);
    return json({ now, coaches: Object.values(users).filter((u) => (u.roles || {})[team]).map((u) => teamUser(u, team)) });
  }
  if (q.get("drills")) {
    const [list, club] = await Promise.all([store.get("drills-club", { type: "json" }), store.get("club", { type: "json" })]);
    return json({ now, drills: (list || []).map(({ byUid, ...d }) => d), clubFavs: (club && club.favDrills) || [] });
  }
  if (q.get("practices") || q.get("audit")) {
    const team = q.get("practices") || q.get("audit");
    if (!okId(team)) return json({ error: "bad team" }, 400);
    const w = await whoIs(store, env, team, creds);
    if (!atLeast(w, "stats")) return json({ error: "Coaches only" }, 403);
    if (q.get("audit")) return json({ now, audit: ((await store.get("audit-" + team, { type: "json" })) || []).slice(-200).reverse() });
    return json({ now, practices: (await store.get("practices-" + team, { type: "json" })) || [] });
  }
  // One game across the nightly backups (newest first), so a head coach can put a wiped game back.
  // Only that team's game is read out; the rest of the club's data stays private.
  if (q.get("gamehist")) {
    const team = q.get("gamehist"), gid = q.get("gid") || "";
    if (!okId(team) || !okGid(gid)) return json({ error: "bad request" }, 400);
    const w = await whoIs(store, env, team, creds);
    if (!atLeast(w, "head")) return json({ error: "Head coaches only" }, 403);
    const { blobs } = await store.list({ prefix: "backup/" });
    const dates = blobs.map((x) => x.key.slice(7)).sort().reverse().slice(0, 45);
    const out = [];
    for (const date of dates) {
      const snap = await store.get("backup/" + date, { type: "json" });
      const v = snap && snap.data && snap.data["game-" + team + "-" + gid];
      if (!v || !v.game) continue;
      const g = v.game, pk = g.pk && ((g.pk.us || []).length || (g.pk.them || []).length);
      out.push({ date, started: !!g.started, fullDone: !!g.fullDone, goals: (g.goals || []).length, pk: !!pk, events: (g.events || []).length, score: scoreOf(g) });
    }
    return json({ now, versions: out });
  }
  if (q.get("backups") || q.get("backup")) {
    const w = await whoIs(store, env, "", creds);
    if (!w || !w.admin) return json({ error: "Admins only" }, 403);
    if (q.get("backup")) {
      const d = q.get("backup");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return json({ error: "bad request" }, 400);
      const snap = await store.get("backup/" + d, { type: "json" });
      return snap ? json(snap) : json({ error: "not found" }, 404);
    }
    const { blobs } = await store.list({ prefix: "backup/" });
    return json({ now, backups: blobs.map((x) => x.key.slice(7)).sort().reverse() });
  }

  if (q.get("club")) {
    // Coach display names (never emails) so the club page can search by coach.
    const coachNames = {};
    Object.values(await loadUsers(store)).forEach((u) => { if (u.disabled) return; Object.keys(u.roles || {}).forEach((t) => (coachNames[t] = coachNames[t] || []).push(clip(u.name, 60))); });
    const idx = (await store.get("teams", { type: "json" })) || [];
    if (!idx.some((t) => t.id === "cottontown")) idx.unshift({ id: "cottontown", name: "Cottontown United" });
    const club = await store.get("club", { type: "json" });
    const teams = await Promise.all(
      idx.slice(0, 40).map(async (t) => {
        const cfg = await store.get("team-" + t.id, { type: "json" });
        if (!cfg || !cfg.team) return { id: t.id, name: t.name, games: [] };
        const c = cfg.team;
        const pname = {};
        (c.players || []).forEach((p) => (pname[p.id] = p.name));
        const games = await Promise.all(
          (c.games || []).slice(0, 80).map(async (g) => {
            const v = g && okGid(g.id) ? await store.get("game-" + t.id + "-" + g.id, { type: "json" }) : null;
            return { id: g.id, title: g.title || "", oppLogo: typeof g.oppLogo === "string" ? g.oppLogo : "", opp: g.opp || "", dt: g.dt || "", when: g.when || "", field: g.field || "", place: g.place || "",
              half: g.half || 30, status: g.status === "postponed" ? "postponed" : "", tid: typeof g.tid === "string" ? clip(g.tid, 40) : "",
              at: v && v.at ? v.at : 0, s: v && v.game ? summarize(v.game, pname) : null };
          })
        );
        return { id: t.id, name: c.name || t.name, short: c.short || "", sub: c.sub || "", logo: c.logo || null, format: c.format || "", placing: c.placing || null, ...teamInfoOf(c), coaches: coachNames[t.id] || [], entries: entriesOf(c), games };
      })
    );
    return json({ now, club: club ? { name: club.name, logo: club.logo } : null, teams, tournaments: await loadTournaments(store) });
  }
  if (q.get("list")) {
    const idx = (await store.get("teams", { type: "json" })) || [];
    if (!idx.some((t) => t.id === "cottontown")) idx.unshift({ id: "cottontown", name: "Cottontown United" });
    // Each team's short name and info, for the team switcher's titles, badges and filters.
    const teams = await Promise.all(idx.slice(0, 60).map(async (t) => {
      const cfg = await store.get("team-" + t.id, { type: "json" });
      const c = cfg && cfg.team;
      return c ? { id: t.id, name: c.name || t.name, short: c.short || "", sub: c.sub || "", ...teamInfoOf(c) } : t;
    }));
    return json({ now, teams });
  }

  const team = q.get("team") || "cottontown";
  if (!okId(team)) return json({ error: "bad team" }, 400);
  const config = await store.get("team-" + team, { type: "json" });
  const games = {};
  const pstats = {};
  if (config && config.team && Array.isArray(config.team.games)) {
    await Promise.all(
      config.team.games.slice(0, 120).map(async (g) => {
        if (!g || !okGid(g.id)) return;
        const [v, ps] = await Promise.all([
          store.get("game-" + team + "-" + g.id, { type: "json" }),
          g.imported ? null : store.get("pstats-" + team + "-" + g.id, { type: "json" }),
        ]);
        if (v) games[g.id] = v;
        if (ps && ps.length) pstats[g.id] = ps.map((x) => ({ id: x.id, k: x.k, t: x.t, u: x.u }));
      })
    );
  }
  return json({ now, team, config: config || null, games, pstats, tournaments: await loadTournaments(store), legacy: null });
}

// An assistant may save team settings only to change rotation plans or who's out; everything else
// (roster, schedule, team name and settings) is the head coach's.
function sameRoster(a, b) {
  const strip = (c) => ({ ...c, fixes: undefined, games: (c.games || []).map(({ plan, out, ...g }) => g) });
  return same(strip(a), strip(b));
}

// Structured team info saved by coaches. A field is only included once a coach has set it (blank counts as set),
// so the page can tell a confirmed "Unspecified" from one that still needs confirming.
export function teamInfoOf(c) {
  const out = {};
  for (const k of ["division", "birthYear", "ageGroup", "ident"]) if (typeof c[k] === "string") out[k] = clip(c[k], 40);
  if (out.division !== undefined && !["girls", "boys", "coed", ""].includes(out.division)) out.division = "";
  if (typeof c.program === "string" && c.program.trim()) out.program = clip(c.program.trim(), 60);
  return out;
}

// ---------- tournaments ----------
// Tournaments a team has signed up for, before any games are posted: [{ tid, status: "entered" | "applied" }].
export const entriesOf = (c) => (Array.isArray(c.entries) ? c.entries : []).filter((e) => e && typeof e.tid === "string" && /^[a-z0-9-]{1,48}$/.test(e.tid)).slice(0, 20).map((e) => ({ tid: e.tid, status: e.status === "applied" ? "applied" : "entered" }));
// Name key for spotting the same event typed differently: "KICKS  Invitational!" = "kicks invitational".
export const tourKey = (n) => String(n || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|annual)\b/g, " ").replace(/\s+/g, " ").trim();
async function loadTournaments(store) { const v = await store.get("tournaments", { type: "json" }); return Array.isArray(v) ? v : []; }
function cleanTournament(t) {
  if (!t || typeof t !== "object") return null;
  const name = clip(String(t.name || "").replace(/\s+/g, " ").trim(), 80);
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
  const start = day(t.start), end = day(t.end) || start;
  if (name.length < 2 || (t.start && !start) || (t.end && !day(t.end)) || (start && end < start)) return null;
  const link = /^https?:\/\/\S+$/.test(String(t.link || "")) ? clip(t.link, 300) : "";
  return { id: typeof t.id === "string" && /^[a-z0-9-]{1,48}$/.test(t.id) ? t.id : "", name, start, end, venue: clip(String(t.venue || "").trim(), 120), link };
}

export function summarize(g, pname) {
  const goals = Array.isArray(g.goals) ? g.goals : [];
  return {
    started: !!g.started, running: !!g.running, acc: g.acc || 0, runStart: g.runStart || 0, half: g.half || 30,
    ot: g.ot || null, fullDone: !!g.fullDone, stops: Array.isArray(g.stops) ? g.stops : [], xt: Array.isArray(g.xt) ? g.xt : [],
    us: goals.filter((x) => x.side === "us").length, them: goals.filter((x) => x.side === "them").length,
    pk: g.pk ? { us: (g.pk.us || []).filter((k) => k.made).length, them: (g.pk.them || []).filter(Boolean).length } : null,
    scorers: goals.filter((x) => x.side === "us").map((x) => ({ t: x.t, by: x.by ? pname[x.by] || "" : "" })),
  };
}

// ---------- backups ----------
// Copies every team, game, parent stat, practice, drill and coach account into backup/YYYY-MM-DD. Keeps 30.
const BACKUP_SKIP = /^(sess-|magic-|auth-|backup\/)/;
export async function takeBackup(store, date = new Date().toISOString().slice(0, 10)) {
  const { blobs } = await store.list();
  const data = {};
  for (const { key } of blobs) {
    if (BACKUP_SKIP.test(key)) continue;
    const v = await store.get(key, { type: "json" });
    // Coach accounts are backed up without their code hashes.
    data[key] = key === "users" && v ? Object.fromEntries(Object.entries(v).map(([id, u]) => [id, { ...u, codeHash: undefined }])) : v;
  }
  await store.setJSON("backup/" + date, { date, at: Date.now(), count: Object.keys(data).length, data });
  const { blobs: old } = await store.list({ prefix: "backup/" });
  const keep = old.map((x) => x.key).sort().reverse();
  for (const k of keep.slice(30)) await store.delete(k);
  return date;
}
