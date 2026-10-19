// Browser-code tests: loads the real app scripts into a sandbox with a stand-in page, then tests
// saving across team switches, game timing, team info and filters, the home page, and fair play.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const JS = new URL("../public/js/", import.meta.url);
const FILES = ["teaminfo.js", "app.js", "auth.js", "drills.js", "practice.js", "season.js", "nav.js", "admin.js", "home.js"];

// A stand-in for anything on the page: every property and call returns another stand-in.
function anything() {
  const p = new Proxy(function () {}, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => "";
      if (k === Symbol.iterator) return function* () {};
      if (k === "then") return undefined;
      return k in t ? t[k] : p;
    },
    set(t, k, v) { t[k] = v; return true; },
    apply() { return p; },
    construct() { return p; },
  });
  return p;
}

function loadApp() {
  const pending = [];
  const sandbox = {
    document: anything(), navigator: {}, history: { replaceState() {} },
    location: { search: "", pathname: "/", origin: "http://test", href: "http://test/" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, clearTimeout() {},
    fetch: (url, opts) => new Promise((resolve) => pending.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null, resolve })),
    CSS: { escape: (s) => s }, Audio: function () {}, console, URL, URLSearchParams, TextEncoder,
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of FILES) vm.runInContext(readFileSync(new URL(f, JS), "utf8"), ctx, { filename: f });
  const run = (code) => vm.runInContext(code, ctx);
  return { ctx, run, pending };
}
const flush = () => new Promise((r) => setImmediate(r));
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

// ---------- 1. saves don't leak across team switches ----------
test("a save that finishes after a team switch doesn't touch the new team's sync state", async () => {
  const { run, pending } = loadApp();
  run(`
    const mkTeam=(id)=>({cfg:fixCfg({id,name:'Team '+id,format:'9v9',formation:'3-3-2',players:[],games:[{id:'g1',title:'Game 1'}]}),games:{g1:fixGame({started:false,goals:[]})}});
    S={v:2,team:'a',cur:{},tab:'bench',beep:false,auth:{a:'code-a',b:'code-b'},T:{a:mkTeam('a'),b:mkTeam('b')}};
    SY.on=true;resetSync();SY.first=false;
  `);
  run("push('g1')"); // Team A's save is in flight...
  assert.equal(pending.length, 1);
  assert.equal(pending[0].body.team, "a");
  run("S.team='b';resetSync();SY.first=false;push('g1')"); // ...the coach switches to Team B, which saves too.
  assert.equal(pending[1].body.team, "b");
  assert.equal(run("SY.inflight.g1"), 1, "Team B has one save in flight");

  pending[0].resolve(reply(200, { ok: true, rev: 7 })); // Team A's answer arrives late.
  await flush();
  assert.equal(run("SY.inflight.g1"), 1, "Team A's answer didn't change Team B's count");
  assert.equal(run("SY.rev.g1"), undefined, "Team A's revision didn't land on Team B");
  assert.ok(run("SY.lastSent.g1"), "Team B's last-sent record is intact");

  pending[1].resolve(reply(200, { ok: true, rev: 3 }));
  await flush();
  assert.equal(run("SY.inflight.g1"), 0, "Team B finished cleanly; its game isn't stuck as busy");
  assert.equal(run("SY.rev.g1"), 3);
});

test("a refusal for the old team doesn't sign out or flag the new team", async () => {
  const { run, pending } = loadApp();
  run(`
    const mkTeam=(id)=>({cfg:fixCfg({id,name:'Team '+id,format:'9v9',formation:'3-3-2',players:[],games:[{id:'g1',title:'Game 1'}]}),games:{g1:fixGame({started:false,goals:[]})}});
    S={v:2,team:'a',cur:{},tab:'bench',beep:false,auth:{a:'code-a',b:'code-b'},T:{a:mkTeam('a'),b:mkTeam('b')},sess:'s1'};
    ME.user={id:'u1',name:'Coach',roles:{b:'head'}};SY.on=true;resetSync();SY.first=false;
  `);
  run("push('g1')");
  run("S.team='b';resetSync();SY.first=false;");
  pending[0].resolve(reply(409, { error: "locked" }));
  await flush();
  assert.equal(run("UI.revert.g1"), undefined, "Team B's game isn't reverted");
  pending.length = 0;
  run("push('g1')");
  run("S.team='a';resetSync();SY.first=false;");
  pending[0].resolve(reply(401, { error: "wrong code" }));
  await flush();
  assert.equal(run("S.sess"), "s1", "still signed in");
  assert.equal(run("S.auth.a"), "code-a", "the current team's code is untouched");
});

// ---------- 2. game timing ----------
test("upcoming lists only future unstarted games; past ones need a result; undated is explicit", () => {
  const { run } = loadApp();
  const now = new Date(2026, 9, 21, 12, 0).getTime(); // Wed Oct 21 2026, noon
  run(`globalThis.NOW=${now}`);
  const b = (dt, s) => run(`gameBucket(${JSON.stringify({ dt, half: 30 })},${JSON.stringify(s || null)},NOW)`);
  assert.equal(b("2026-10-24T09:00"), "upcoming");
  assert.equal(b("2026-10-21T18:00"), "today");
  assert.equal(b("2026-10-21T11:30"), "today", "kicked off 30 min ago, might be in progress");
  assert.equal(b("2026-10-21T08:00"), "needs-result", "earlier today, long over");
  assert.equal(b("2026-10-18T09:45"), "needs-result");
  assert.equal(b(""), "undated");
  assert.equal(b("not a date"), "undated");
  assert.equal(b("2026-10-18T09:45", { started: true, fullDone: false }), "live");
  assert.equal(b("2026-10-18T09:45", { started: true, fullDone: true }), "final");
  const games = [{ id: "old", dt: "2026-10-18T09:45" }, { id: "nodate", dt: "" }, { id: "sat", dt: "2026-10-24T09:00" }, { id: "fri", dt: "2026-10-23T18:00" }];
  assert.equal(run(`nextGameOf(${JSON.stringify(games)},()=>null,NOW).id`), "fri");
  assert.equal(run(`nextGameOf(${JSON.stringify(games.slice(0, 2))},()=>null,NOW)`), null, "no next game rather than a past or undated one");
});

// ---------- 4/5/6. team info, titles, filters ----------
test("team info: clear suggestions from names, ambiguity left blank, coach values win", () => {
  const { run } = loadApp();
  const info = (t) => JSON.parse(run(`JSON.stringify([teamShortTitle(${JSON.stringify(t)}),teamInfo(${JSON.stringify(t)})])`));
  assert.equal(info({ name: "Cottontown United 13/14 Girls", sub: "U14 Girls, Green #21 (AL)" })[0], "13/14 Girls");
  assert.equal(info({ name: "Cottontown United Boys - White", sub: "U16 Boys" })[0], "U16 Boys · White");
  assert.equal(info({ name: "Cottontown United 2015", sub: "U12 Boys" })[0], "2015 Boys");
  const mixed = info({ name: "Cottontown Girls and Boys", sub: "U10 or U11" })[1];
  assert.equal(mixed.division, "", "Girls and Boys both named: left for a coach");
  assert.equal(mixed.ageGroup, "", "two age groups: left blank");
  const saved = info({ name: "Cottontown United 13/14 Girls", division: "", ageGroup: "U14", birthYear: "2013-2014", ident: "" })[1];
  assert.equal(saved.division, "", "a coach's 'Unspecified' is kept, not re-suggested");
  assert.deepEqual(saved.suggested, []);
});

test("filters and search: divisions with counts, search by year, identifier and coach name", () => {
  const { run } = loadApp();
  run(`globalThis.TEAMS=[
    {id:'a',name:'Cottontown United 13/14 Girls',sub:'U14 Girls',coaches:['Randy Wells']},
    {id:'b',name:'Cottontown United Boys - White',sub:'U16 Boys'},
    {id:'c',name:'Cottontown United 2015',sub:'U12 Boys'},
    {id:'d',name:'Cottontown Futsal Club',sub:''}]`);
  const ids = (f, q) => JSON.parse(run(`JSON.stringify(TEAMS.filter(t=>teamMatches(t,${JSON.stringify(f)},${JSON.stringify(q)})).map(t=>t.id))`));
  assert.deepEqual(JSON.parse(run("JSON.stringify(divisionCounts(TEAMS))")), [
    { key: "all", label: "All", count: 4 }, { key: "girls", label: "Girls", count: 1 }, { key: "boys", label: "Boys", count: 2 }, { key: "unspecified", label: "Unspecified", count: 1 }]);
  assert.deepEqual(ids("boys", ""), ["b", "c"]);
  assert.deepEqual(ids("all", "2015"), ["c"]);
  assert.deepEqual(ids("all", "13/14"), ["a"]);
  assert.deepEqual(ids("all", "2013"), ["a"]);
  assert.deepEqual(ids("all", "white"), ["b"]);
  assert.deepEqual(ids("all", "randy"), ["a"]);
  assert.deepEqual(ids("girls", "white"), []);
});

// ---------- 6/7/8. home page ----------
function clubData(now) {
  const day = (d, h) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); const z = (n) => String(n).padStart(2, "0"); return `${x.getFullYear()}-${z(x.getMonth() + 1)}-${z(x.getDate())}T${z(h)}:00`; };
  const fin = (us, them) => ({ started: true, fullDone: true, us, them, pk: null, scorers: [], half: 30, stops: [], acc: 0, runStart: 0 });
  return {
    club: null,
    teams: [
      { id: "girls1314", name: "Cottontown United 13/14 Girls", sub: "U14 Girls", format: "11v11", games: [
        { id: "g1", opp: "Vero FC", dt: day(-3, 8), field: "Field 6", s: fin(2, 3) },
        { id: "g2", opp: "Past No Result", dt: day(-2, 9), field: "Field 4", s: null },
        { id: "g3", opp: "Future Opp", dt: day(4, 9), field: "Field 2", place: "3501 Triana Blvd SW, Huntsville, AL", s: null }] },
      { id: "white", name: "Cottontown United Boys - White", sub: "U16 Boys", format: "11v11", games: [
        { id: "g1", opp: "Live Opp", dt: day(0, 10), field: "Field 18", s: { started: true, fullDone: false, us: 1, them: 0, scorers: [], half: 40, stops: [], acc: 600000, runStart: 0, running: false } }] },
      { id: "u2015", name: "Cottontown United 2015", sub: "U12 Boys", format: "9v9", games: [{ id: "g1", opp: "No Date", dt: "", s: null }] },
    ],
  };
}
test("home page: order, one card per team, next game details, filters across sections, empty state", () => {
  const { run } = loadApp();
  const now = new Date(2026, 9, 21, 12, 0).getTime();
  run(`S={v:2,team:'cottontown',cur:{},T:{},auth:{},favTeams:['white','gone'],clubFilter:'all',clubQ:''};OFF=${now}-Date.now();globalThis.D=${JSON.stringify(clubData(now))};`);
  let h = run("clubBodyHTML(D)");
  const at = (s) => h.indexOf(s);
  assert.ok(at(">Live now<") >= 0 && at(">Live now<") < at(">My teams<"), "Live now comes first");
  assert.ok(at(">My teams<") < at(">Playing this weekend") && at(">Playing this weekend") < at("Recent results"), "then My teams, weekend, remaining, results");
  assert.equal((h.match(/aria-label="U16 Boys · White"/g) || []).length, 1, "a starred team's card appears once");
  assert.ok(h.includes("no longer listed"), "a starred team that's gone is handled");
  assert.ok(h.includes("vs Future Opp") && h.includes("Field 2") && h.includes("View game") && h.includes("Directions"), "next game: opponent, field, View game, Directions");
  assert.ok(!/Next<\/span><div><b>vs Past No Result/.test(h), "a past game without a result is never Next");
  assert.ok(h.includes("1 past game needs a result"));
  assert.ok(h.includes("No upcoming games scheduled."), "undated game isn't treated as upcoming");
  assert.ok(h.includes(">13/14 Girls<") && !/<h3>Cottontown United/.test(h), "short titles, not the club name, are the card headings");
  // Girls filter applies to live games and results too
  run("S.clubFilter='girls'");
  h = run("clubBodyHTML(D)");
  assert.ok(!h.includes("Live Opp"), "the Boys team's live game is filtered out");
  assert.ok(h.includes("Vero FC"), "the Girls team's result stays");
  assert.ok(h.includes("Clear filters"));
  // No matches
  run("S.clubQ='zzz'");
  h = run("clubBodyHTML(D)");
  assert.ok(h.includes("No teams match") && h.includes('data-cact="clearfilters"'));
});

test("school programs get their own page; the club page keeps its own teams", () => {
  const { run } = loadApp();
  const now = new Date(2026, 9, 21, 12, 0).getTime();
  const d = clubData(now);
  d.teams.push({ id: "ahs-girls", name: "Athens High School Girls Varsity", program: "Athens City Schools", division: "girls", ageGroup: "Varsity", logo: "data:image/png;base64,AA", games: [] },
    { id: "llca-boys", name: "Lindsay Lane Boys Varsity", program: "Lindsay Lane Christian Academy", division: "boys", ageGroup: "Varsity", games: [] });
  run(`S={v:2,team:'cottontown',cur:{},T:{},auth:{},favTeams:['ahs-girls'],clubFilter:'all',clubQ:''};OFF=${now}-Date.now();globalThis.D=${JSON.stringify(d)};`);
  const ids = () => JSON.parse(run("JSON.stringify(programTeams(D).map(t=>t.id))"));
  assert.ok(!ids().includes("ahs-girls") && !ids().includes("llca-boys") && ids().includes("white"), "the club page shows only the club's teams");
  let nav = run("programNavHTML(D)");
  assert.ok(nav.includes(">Athens City Schools<") && nav.includes("program=lindsay-lane-christian-academy") && /aria-current="page">Cottontown United/.test(nav));
  // A starred school team isn't reported as missing on the club page.
  assert.ok(!run("clubBodyHTML(Object.assign({},D,{teams:programTeams(D),allTeams:D.teams}))").includes("no longer listed"));
  run("location.search='?club=1&program=athens-city-schools'");
  assert.deepEqual(ids(), ["ahs-girls"]);
  assert.equal(run("pageName(D)"), "Athens City Schools");
  assert.equal(run("pageLogo(D)"), "data:image/png;base64,AA", "the school's logo heads its page");
  assert.equal(run("teamShortTitle(D.teams.find(t=>t.id==='ahs-girls'))"), "Varsity Girls");
  run("location.search='?club=1&program=nope'");
  assert.equal(run("pageName(D)"), "Cottontown United", "an unknown program falls back to the club page");
  // A school team's links go back to its own page.
  run("S.T['ahs-girls']={cfg:{id:'ahs-girls',name:'x',program:'Athens City Schools',players:[],games:[]},games:{}};S.team='ahs-girls'");
  assert.equal(run("clubLink()"), "/?club=1&program=athens-city-schools");
});

test("favorites are per device and never grant editing", () => {
  const { run } = loadApp();
  run("S={v:2,team:'cottontown',cur:{},T:{},auth:{},favTeams:[]};SY.on=true;");
  run("toggleFavTeam('white');toggleFavTeam('girls1314');toggleFavTeam('white')");
  assert.deepEqual(JSON.parse(run("JSON.stringify(S.favTeams)")), ["girls1314"]);
  assert.equal(run("canEdit()"), false, "a favorite doesn't make this device a coach");
  assert.equal(run("S.auth.girls1314"), undefined);
});

// ---------- 3. fair play ----------
test("fair play: zero-minute available games count, unavailable and results-only games don't, unknown is reported", () => {
  const { run } = loadApp();
  const H = 30 * 60000, full = 2 * H;
  const tracked = (avail, start, events) => ({ form: "7v7/2-3-1", started: true, fullDone: true, running: false, acc: full, half: 30, sub: 10, avail, start, events, goals: [], saves: [], stats: [] });
  run(`
    const players=[{id:'k',name:'Keeper',gr:['GK']},{id:'a',name:'Ava',gr:['MID']},{id:'b',name:'Bea',gr:['MID']},{id:'c',name:'Cam',gr:['MID']},{id:'d',name:'Dee',gr:['MID']}];
    const cfg=fixCfg({id:'t',name:'Test',format:'7v7',formation:'2-3-1',players,games:[
      {id:'g1',title:'Game 1',dt:'2026-09-05T09:00'},{id:'g2',title:'Game 2',dt:'2026-09-12T09:00'},{id:'r1',title:'Results only',dt:'2026-09-19T09:00',imported:true}]});
    S={v:2,team:'t',cur:{t:0},T:{t:{cfg,games:{
      // Game 1: Ava plays all 60; Bea is available but sits all game; Cam is marked out; Dee has no availability record.
      g1:fixGame(${JSON.stringify(tracked({ k: true, a: true, b: true, c: false }, { GK: "k", CM: "a" }, []))}),
      // Game 2: Ava 60; Bea in for 30 at half; Cam 60.
      g2:fixGame(${JSON.stringify(tracked({ k: true, a: true, b: true, c: true, d: false }, { GK: "k", CM: "a", LM: "c" }, [{ b: 1, t: H, pos: "RM", from: null, to: "b" }]))}),
      r1:fixGame({started:true,fullDone:true,imported:true,acc:${full},goals:[{side:'us',by:'b',t:0},{side:'us',by:'b',t:0}],avail:{}})}}},auth:{}};
    PST.srv.t={};SEA.since='all';useTeam();
  `);
  const rows = JSON.parse(run("JSON.stringify(Object.fromEntries(seasonData().list.map(r=>[r.p.id,{min:Math.round(r.min/60000),availG:r.availG,outG:r.outG,unknownG:r.unknownG,avg:Math.round(r.avg/60000),low:r.low}])))"));
  assert.deepEqual(rows.b, { min: 30, availG: 2, outG: 0, unknownG: 0, avg: 15, low: true }, "Bea's zero-minute game counts: 30 min over 2 available games");
  assert.deepEqual(rows.c, { min: 60, availG: 1, outG: 1, unknownG: 0, avg: 60, low: false }, "Cam's game marked out is left out");
  assert.equal(rows.d.unknownG, 1, "Dee's missing record is reported, not assumed");
  assert.equal(rows.d.availG, 0);
  assert.equal(rows.a.availG, 2, "results-only game isn't a tracked game");
  assert.equal(rows.k.low, false, "keeper-only players aren't in the fair-play check");
  const sd = JSON.parse(run("JSON.stringify({unknown:seasonData().unknown.map(r=>r.p.id),goalsB:seasonData().list.find(r=>r.p.id==='b').g})"));
  assert.deepEqual(sd.unknown, ["d"]);
  assert.equal(sd.goalsB, 2, "results-only goals still count");
});
