"use strict";
/* Team identity and game timing shared by the club page, the team switcher and the game list.
   Plain functions with no page access, so tests can load this file on its own. */

const DIVISIONS = { girls: "Girls", boys: "Boys", coed: "Coed", "": "Unspecified" };
const INFO_FIELDS = ["division", "birthYear", "ageGroup", "ident"];

/* Suggestions read from a team's name and subtitle. Only clear-cut values are suggested;
   anything ambiguous is left blank for a coach to fill in. */
function suggestTeamInfo(name, sub) {
  const text = String(name || "") + " " + String(sub || "");
  const out = { division: "", birthYear: "", ageGroup: "", ident: "" };
  const girls = /\bgirls?\b/i.test(text), boys = /\bboys?\b/i.test(text), coed = /\bco-?ed\b/i.test(text);
  if (coed && !girls && !boys) out.division = "coed";
  else if (girls && !boys) out.division = "girls";
  else if (boys && !girls) out.division = "boys";
  const years = new Set();
  const plausible = (y) => y >= 2000 && y <= 2025;
  for (const m of text.matchAll(/\b(20\d\d)\s*[\/\-–]\s*(?:20)?(\d\d)\b/g)) { const a = +m[1], b = 2000 + +m[2]; if (plausible(a) && b === a + 1) years.add(a + "-" + b); }
  if (!years.size) for (const m of text.matchAll(/(?<![\d#])(\d\d)\s*\/\s*(\d\d)(?!\d)/g)) { const a = 2000 + +m[1], b = 2000 + +m[2]; if (plausible(a) && b === a + 1) years.add(a + "-" + b); }
  if (!years.size) for (const m of text.matchAll(/\b(20\d\d)\b/g)) if (plausible(+m[1])) years.add(m[1]);
  if (years.size === 1) out.birthYear = [...years][0];
  const ages = new Set([...text.matchAll(/\bU-?(\d{1,2})\b/gi)].map((m) => "U" + +m[1]));
  if (ages.size === 1) out.ageGroup = [...ages][0];
  // Identifier: what's left of the team name once the club, years, age group and Girls/Boys are taken out.
  let rest = String(name || "").replace(/^\s*cotton\s*town(\s+united)?(\s+soccer\s+club)?/i, "")
    .replace(/\b20\d\d\s*[\/\-–]\s*(20)?\d\d\b|\b\d\d\s*\/\s*\d\d\b|\b20\d\d\b/g, " ")
    .replace(/\bU-?\d{1,2}\b/gi, " ").replace(/\b(girls?|boys?|co-?ed)\b/gi, " ").replace(/[-–·|,()]+/g, " ").replace(/\s+/g, " ").trim();
  if (rest && rest.length <= 24 && rest.split(" ").length <= 3) out.ident = rest;
  return out;
}

/* A team's info: what a coach saved, otherwise the suggestion. `suggested` lists the fields not yet confirmed. */
function teamInfo(t) {
  const sug = suggestTeamInfo(t && t.name, t && t.sub);
  const info = { division: "", birthYear: "", ageGroup: "", ident: "", suggested: [] };
  for (const k of INFO_FIELDS) {
    if (t && typeof t[k] === "string") info[k] = t[k];
    else { info[k] = sug[k]; if (sug[k]) info.suggested.push(k); }
  }
  if (!DIVISIONS[info.division]) info.division = "";
  return info;
}
const divisionLabel = (d) => DIVISIONS[d] || "Unspecified";
const yearsShort = (y) => { const m = String(y || "").match(/^(20\d\d)\s*-\s*(20\d\d)$/); return m ? m[1].slice(2) + "/" + m[2].slice(2) : String(y || ""); };

/* Short, distinctive title for a team card: "13/14 Girls", "U16 Boys · White". */
function teamShortTitle(t) {
  const i = teamInfo(t);
  const base = [i.birthYear ? yearsShort(i.birthYear) : i.ageGroup, i.division ? divisionLabel(i.division) : ""].filter(Boolean).join(" ");
  const fallback = String((t && (t.short || t.name)) || "Team").replace(/^\s*cotton\s*town(\s+united)?\s*/i, "").trim() || String(t && t.name || "Team");
  return (base || fallback) + (i.ident ? " · " + i.ident : "");
}
/* Text badges (never color alone): age group, Girls/Boys, identifier. */
function teamBadgeList(t) {
  const i = teamInfo(t);
  return [i.ageGroup, i.division ? divisionLabel(i.division) : "", i.birthYear && i.ageGroup ? "Born " + i.birthYear.replace("-", "–") : "", i.ident].filter(Boolean);
}

/* ---------- programs ---------- */
/* Which club or school program a team belongs to (e.g. "Athens City Schools"). Blank means the club itself.
   Each program gets its own page: ?club=1&program=<key>. */
const programOf = (t) => String((t && t.program) || "").trim();
const programKey = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
function programsOf(teams) {
  const m = new Map();
  teams.forEach((t) => { const p = programOf(t); if (!p) return; const k = programKey(p);
    if (!m.has(k)) m.set(k, { key: k, name: p, logo: t.logo || null, count: 0 }); const x = m.get(k); x.count++; if (!x.logo && t.logo) x.logo = t.logo; });
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- school grades ---------- */
/* A player's graduation year is saved, so the grade moves up on its own each August. */
const schoolYearEnd = (now) => { const d = new Date(now); return d.getMonth() >= 7 ? d.getFullYear() + 1 : d.getFullYear(); };
const gradeOf = (grad, now) => (grad ? 12 - (+grad - schoolYearEnd(now)) : null);
const gradFor = (grade, now) => schoolYearEnd(now) + (12 - grade);
function gradeTag(grad, now) {
  const g = gradeOf(grad, now); if (g == null || g < 1) return "";
  return g > 12 ? "Class of " + grad : "Gr " + g;
}

/* ---------- games ---------- */
/* A game can have a date with the time still to be set (dt "2026-11-01"). It sorts at noon that day and isn't
   "awaiting a result" until the day is over. */
const timeTBD = (g) => /^\d{4}-\d{2}-\d{2}$/.test(String((g && g.dt) || ""));
const kickoffMs = (g) => {
  if (!g || !g.dt) return NaN;
  if (timeTBD(g)) { const [y, m, d] = g.dt.split("-").map(Number); return new Date(y, m - 1, d, 12, 0).getTime(); }
  return new Date(g.dt).getTime();
};
/* ---------- game status ----------
   One answer for "what's happening with this game", used everywhere a game is shown.
   A game is only Live with evidence of play (the clock has run) inside a believable time window. A game
   that started but has gone quiet well past its expected end is "awaiting" a final score: nothing is ever
   finalized or scored automatically; a coach confirms the result. `lastAt` is the last time the game was
   saved (when known). */
const STALE_GRACE = 60 * 60000, QUIET = 45 * 60000;
function expectedLengthMs(g, s) {
  const half = +((s && s.half) || (g && g.half)) || 30;
  const ot = s && s.ot ? (+(s.ot.n || s.otN) || 2) * (+(s.ot.len || s.otLen) || 5) : 0;
  return (2 * half + 15 + ot) * 60000; // both halves, a halftime break and any overtime
}
function gameStatus(g, s, now, lastAt) {
  if (s && s.fullDone) return "final";
  const played = !!(s && s.started && (s.running || s.acc > 0 || (s.stops && s.stops.length)));
  if (g && g.status === "postponed" && !played) return "postponed";
  const k = kickoffMs(g), len = expectedLengthMs(g, s);
  if (played) {
    const clockMs = s.running ? (s.acc || 0) + Math.max(0, now - (s.runStart || now)) : (s.acc || 0);
    const last = Math.max(+lastAt || 0, s.running ? +s.runStart || 0 : 0);
    const quiet = !last || now - last > QUIET;
    const pastWindow = Number.isFinite(k) ? now > k + len + STALE_GRACE : !!last && now - last > 4 * 3600000;
    if ((pastWindow && quiet) || clockMs > len + STALE_GRACE) return "awaiting";
    const halfMs = (+((s && s.half) || (g && g.half)) || 30) * 60000;
    if (!s.running && (s.acc || 0) === halfMs) return "halftime";
    return "live";
  }
  if (!Number.isFinite(k)) return "undated";
  const ends = timeTBD(g) ? new Date(new Date(k).setHours(23, 59, 59, 0)).getTime() : k + len;
  if (ends < now) return "awaiting";
  const a = new Date(k), b = new Date(now);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()) return "today";
  return k > now ? "upcoming" : "today";
}
const STATUS_LABEL = { live: "Live", halftime: "Halftime", final: "Final", postponed: "Postponed", awaiting: "Awaiting result", today: "Today", upcoming: "Scheduled", undated: "Date to be set" };
/* "Awaiting final score" when play was recorded (a score so far), "Awaiting result" when nothing was. */
function statusLabel(st, s) {
  const goals = s ? (s.us != null ? (s.us || 0) + (s.them || 0) : (s.goals || []).length) : 0;
  return st === "awaiting" && s && s.started && (goals > 0 || s.acc > 0) ? "Awaiting final score" : STATUS_LABEL[st] || "";
}
/* Where a game is listed: live (incl. halftime), final, postponed, today, upcoming, needs-result (awaiting), undated. */
function gameBucket(g, s, now, lastAt) {
  const st = gameStatus(g, s, now, lastAt);
  return st === "halftime" ? "live" : st === "awaiting" ? "needs-result" : st;
}
/* The next game to show for a team: today's or a future unstarted game. Never a past or undated one. */
function nextGameOf(games, stateOf, now, atOf) {
  return games.filter((g) => ["today", "upcoming"].includes(gameBucket(g, stateOf(g), now, atOf ? atOf(g) : 0))).sort((a, b) => kickoffMs(a) - kickoffMs(b))[0] || null;
}

/* ---------- filtering ---------- */
function teamDivisionKey(t) { const d = teamInfo(t).division; return d || "unspecified"; }
function teamSearchText(t) {
  const i = teamInfo(t);
  return [t.name, t.short, t.sub, programOf(t), teamShortTitle(t), i.ageGroup, i.birthYear, i.birthYear.replace("-", " "), yearsShort(i.birthYear), i.ident, divisionLabel(i.division), ...(t.coaches || [])].filter(Boolean).join(" ").toLowerCase();
}
function teamMatches(t, filter, q) {
  if (filter && filter !== "all" && teamDivisionKey(t) !== filter) return false;
  const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = teamSearchText(t);
  return words.every((w) => hay.includes(w));
}
/* Filter buttons: All, Girls, Boys always; Coed and Unspecified only when such teams exist. */
function divisionCounts(teams) {
  const c = { all: teams.length, girls: 0, boys: 0, coed: 0, unspecified: 0 };
  teams.forEach((t) => c[teamDivisionKey(t)]++);
  return [["all", "All"], ["girls", "Girls"], ["boys", "Boys"], ["coed", "Coed"], ["unspecified", "Unspecified"]]
    .filter(([k]) => k === "all" || k === "girls" || k === "boys" || c[k] > 0).map(([k, l]) => ({ key: k, label: l, count: c[k] }));
}
