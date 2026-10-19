# One-time fixes from the code review (server). Kept as a record; safe to delete.
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
R = []
def rep(a, b, n=1):
    R.append((a, b, n))

# 1. Coach records: no prototype, strict ids, own-property lookups only.
rep('(await store.get("users", { type: "json" })) || {}', 'await loadUsers(store)', 10)
rep('const okTok = (s) => typeof s === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(s);',
    'const okTok = (s) => typeof s === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(s);\n'
    '// Coach ids: letters, digits, dash or underscore, starting with a letter or digit (never "__proto__" and the like).\n'
    'const okUid = (s) => typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(s);\n'
    '// Coach records keyed by id, with no prototype, so a request can only ever reach a real coach.\n'
    'async function loadUsers(store) { return Object.assign(Object.create(null), (await store.get("users", { type: "json" })) || {}); }\n'
    'const userAt = (users, id) => (okUid(id) && Object.hasOwn(users, id) ? users[id] : null);')

rep('      const u = users[sess.uid];', '      const u = userAt(users, sess.uid);')
rep('      const u = users[m.uid];', '      const u = userAt(users, m.uid);')
rep('      if (!users[w.uid]) return json({ error: "not found" }, 404);\n      users[w.uid].codeHash',
    '      if (!userAt(users, w.uid)) return json({ error: "not found" }, 404);\n      users[w.uid].codeHash')
rep('    const u = users[w.uid];\n    const favs', '    const u = userAt(users, w.uid);\n    const favs')

# 2. Head coaches add a role; they don't change an existing coach's email. Emails stay unique.
rep('''        let u = b.id ? users[b.id] : email ? Object.values(users).find((x) => x.email === email) : null;
        if (!u) {
          if (!clip(b.name, 60)) return json({ error: "Give the coach a name" }, 400);
          const id = "u" + token().slice(0, 10);
          u = users[id] = { id, name: clip(b.name, 60), email, admin: false, roles: {}, created: now };
        }
        u.roles = { ...(u.roles || {}), [team]: role };
        if (!u.email && email) u.email = email;''',
'''        let u = b.id ? userAt(users, b.id) : email ? Object.values(users).find((x) => x.email === email) : null;
        if (b.id && !u) return json({ error: "not found" }, 404);
        if (!u) {
          if (!clip(b.name, 60)) return json({ error: "Give the coach a name" }, 400);
          const id = "u" + token().slice(0, 10);
          u = users[id] = { id, name: clip(b.name, 60), email, admin: false, roles: {}, created: now };
        }
        // An existing coach's email is only changed by a club admin (it's where their sign-in links go).
        u.roles = { ...(u.roles || {}), [team]: role };''')
rep('      const u = users[clip(b.id, 40)];\n      if (!u) return json({ error: "not found" }, 404);',
    '      const u = userAt(users, b.id);\n      if (!u) return json({ error: "not found" }, 404);')
rep('      const id = clip(src.id || b.id || "", 40) || "u" + token().slice(0, 10);\n      if (!okTok(id)) return json({ error: "bad request" }, 400);',
    '      const id = clip(src.id || b.id || "", 40) || "u" + token().slice(0, 10);\n      if (!okUid(id)) return json({ error: "bad request" }, 400);')
rep('        if (!users[id]) return json({ error: "not found" }, 404);\n        const nc',
    '        if (!userAt(users, id)) return json({ error: "not found" }, 404);\n        const nc')
rep('      const prev = users[id] || { created: now };', '      const prev = userAt(users, id) || { created: now };')

# 3. Assistants may change only lineup planning (plans, who's out), not the schedule or team identity.
rep('''function sameRoster(a, b) {
  return same(a.players, b.players) && same((a.games || []).map((g) => g.id), (b.games || []).map((g) => g.id));
}''',
'''function sameRoster(a, b) {
  const strip = (c) => ({ ...c, fixes: undefined, games: (c.games || []).map(({ plan, out, ...g }) => g) });
  return same(strip(a), strip(b));
}''')
rep("// An assistant may save team settings only when the roster and schedule are unchanged (e.g. a game's lineup notes).",
    "// An assistant may save team settings only to change rotation plans or who's out; everything else\n// (roster, schedule, team name and settings) is the head coach's.")

# 4. Game records only for games on the team's schedule; stats helpers can't create one from scratch.
rep('''      const key = "game-" + team + "-" + b.gid;
      const cur = await store.get(key, { type: "json" });
      const old = cur && cur.game;
      if (old && w.role === "stats" && !w.admin) {''',
'''      const cfg = await store.get("team-" + team, { type: "json" });
      if (!cfg || !cfg.team || !(cfg.team.games || []).some((g) => g && g.id === b.gid)) return json({ error: "That game isn’t on this team’s schedule" }, 404);
      const key = "game-" + team + "-" + b.gid;
      const cur = await store.get(key, { type: "json" });
      const old = cur && cur.game;
      if (!old && w.role === "stats" && !w.admin) return json({ error: "A coach needs to open this game first" }, 403);
      if (old && w.role === "stats" && !w.admin) {''')

# 7. More of a finished game is locked; a locked game's goals and saves can't be deleted by listing them in del.
rep('const LOCKED = ["goals", "saves", "events", "start", "acc", "started", "fullDone", "halfDone", "pk", "stops", "ot", "xt"];',
    'const LOCKED = ["goals", "saves", "events", "start", "acc", "started", "fullDone", "halfDone", "pk", "stops", "ot", "xt", "half", "form", "avail"];')
rep('''      if (isLocked(cur, now) && LOCKED.some((k) => !same(old[k], b.game[k]))) {''',
'''      const lockedIds = isLocked(cur, now) ? new Set([...(old.goals || []), ...(old.saves || [])].map((x) => x && x.u).filter(Boolean)) : null;
      const delsLocked = lockedIds && (Array.isArray(b.game.del) ? b.game.del : []).some((u) => lockedIds.has(u));
      if (isLocked(cur, now) && (delsLocked || LOCKED.some((k) => !same(old[k], b.game[k])))) {''')

# 9. A main-code sign-in ends when the main code changes.
rep('''async function newSession(store, uid) {
  const t = token();
  await store.setJSON("sess-" + t, { uid, exp: Date.now() + 60 * DAY, at: Date.now() });''',
'''async function newSession(store, uid, env) {
  const t = token();
  // Main-code sessions remember which main code made them, so changing COACH_CODE signs them out.
  const mh = uid === "main" ? await sha("main:" + String(env.COACH_CODE || "").trim()) : undefined;
  await store.setJSON("sess-" + t, { uid, exp: Date.now() + 60 * DAY, at: Date.now(), mh });''')
rep('newSession(store, "main")', 'newSession(store, "main", env)')
rep('newSession(store, u.id)', 'newSession(store, u.id, env)', 2)
rep('      if (sess.uid === "main") return { role: "head", name: "Main code", uid: "main", admin: true };',
    '      if (sess.uid === "main") return sess.mh && sess.mh === (await sha("main:" + master)) ? { role: "head", name: "Main code", uid: "main", admin: true } : null;')

# 10. Backups leave out code hashes (they're only needed live).
rep('const BACKUP_SKIP = /^(sess-|magic-|backup\\/)/;', 'const BACKUP_SKIP = /^(sess-|magic-|auth-|backup\\/)/;')
rep('''    data[key] = await store.get(key, { type: "json" });''',
'''    const v = await store.get(key, { type: "json" });
    // Coach accounts are backed up without their code hashes.
    data[key] = key === "users" && v ? Object.fromEntries(Object.entries(v).map(([id, u]) => [id, { ...u, codeHash: undefined }])) : v;''')

for a, b, n in R:
    c = s.count(a)
    assert c == n, (c, n, a[:90])
    s = s.replace(a, b)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('applied', len(R))
