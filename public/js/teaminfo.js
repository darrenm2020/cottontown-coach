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

/* ---------- games ---------- */
const kickoffMs = (g) => { if (!g || !g.dt) return NaN; const v = new Date(g.dt).getTime(); return v; };
/* Where a game belongs: live, final, today (not started yet), upcoming, needs-result (date passed, no result), undated. */
function gameBucket(g, s, now) {
  if (s && s.started && !s.fullDone) return "live";
  if (s && s.fullDone) return "final";
  const t = kickoffMs(g);
  if (!Number.isFinite(t)) return "undated";
  const lengthMs = (2 * (+(g.half || (s && s.half)) || 30) + 30) * 60000; // two halves plus a break and a little delay
  if (t + lengthMs < now) return "needs-result";
  const a = new Date(t), b = new Date(now);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()) return "today";
  return t > now ? "upcoming" : "today";
}
/* The next game to show for a team: today's or a future unstarted game. Never a past or undated one. */
function nextGameOf(games, stateOf, now) {
  return games.filter((g) => ["today", "upcoming"].includes(gameBucket(g, stateOf(g), now))).sort((a, b) => kickoffMs(a) - kickoffMs(b))[0] || null;
}

/* ---------- filtering ---------- */
function teamDivisionKey(t) { const d = teamInfo(t).division; return d || "unspecified"; }
function teamSearchText(t) {
  const i = teamInfo(t);
  return [t.name, t.short, t.sub, teamShortTitle(t), i.ageGroup, i.birthYear, i.birthYear.replace("-", " "), yearsShort(i.birthYear), i.ident, divisionLabel(i.division), ...(t.coaches || [])].filter(Boolean).join(" ").toLowerCase();
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
