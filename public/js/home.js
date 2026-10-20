"use strict";
/* Club home page: filters (All / Girls / Boys ...), search, favorite teams ("My teams"), and sections in this order:
   Live now, My teams, Playing this weekend, Remaining teams, Recent results.
   The header, filters and search box are drawn once; automatic refreshes only replace the sections below them,
   so typing in the search box is never interrupted. Favorites live on this device and never grant editing. */

const HOME = { built: false };
const favTeams = () => (Array.isArray(S.favTeams) ? S.favTeams : []);
const isFavTeam = (id) => favTeams().includes(id);
function toggleFavTeam(id) {
  S.favTeams = isFavTeam(id) ? favTeams().filter((x) => x !== id) : favTeams().concat(id);
  saveLocal();
}
const clubFilter = () => S.clubFilter || "all";
/* Program page: ?club=1 shows the club's own teams; ?club=1&program=athens-city-schools shows that school's. */
const urlProgram = () => { try { return new URLSearchParams(location.search).get("program") || ""; } catch (e) { return ""; } };
function clubProgram(d) { const k = urlProgram(); return k && programsOf(d.teams).some((p) => p.key === k) ? k : ""; }
const programTeams = (d) => { const k = clubProgram(d); return d.teams.filter((t) => programKey(programOf(t)) === k); };
const pageName = (d) => { const k = clubProgram(d); return k ? programsOf(d.teams).find((p) => p.key === k).name : clubName(); };
const pageLogo = (d) => { const k = clubProgram(d); return (k && programsOf(d.teams).find((p) => p.key === k).logo) || clubLogo(); };
function programNavHTML(d) {
  const progs = programsOf(d.teams); if (!progs.length) return "";
  const cur = clubProgram(d), base = location.pathname + "?club=1";
  const link = (k, name) => `<a class="cprog ${cur === k ? "on" : ""}" href="${k ? base + "&program=" + encodeURIComponent(k) : base}"${cur === k ? ' aria-current="page"' : ""}>${esc(name)}</a>`;
  return link("", clubName()) + progs.map((p) => link(p.key, p.name)).join("");
}
const clubQuery = () => S.clubQ || "";

/* Text badges for a team (age group, Girls/Boys, identifier). */
const badgesHTML = (t) => teamBadgeList(t).map((b) => `<span class="tbadge">${esc(b)}</span>`).join("");
const starHTML = (t, act) => {
  const on = isFavTeam(t.id), title = teamShortTitle(t);
  return `<button class="starbtn ${on ? "on" : ""}" data-${act}="fav" data-id="${esc(t.id)}" aria-pressed="${on}" aria-label="${on ? "Remove " + esc(title) + " from My teams" : "Add " + esc(title) + " to My teams"}" title="${on ? "Remove from My teams" : "Add to My teams"}"><span aria-hidden="true">${on ? "★" : "☆"}</span></button>`;
};
const gameWhen = (g) => { const t = kickoffMs(g); if (!Number.isFinite(t)) return g.when || "Date to be set";
  const d = new Date(t); return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };

/* ---------- page shell (drawn once) ---------- */
function buildClubShell() {
  const el = $("club");
  const d = CLUB.data, prog = clubProgram(d);
  el.innerHTML = `<header class="clubtop"><img id="club-logo-img" src="${esc(pageLogo(d))}" alt=""><div class="clubtt"><h1 id="club-title">${esc(pageName(d))}</h1><p>${prog ? "Soccer" : "Club scoreboard"} <span id="club-sync"></span></p></div><button class="btn small fbbtn" data-feedback>Feedback</button></header>
    <nav class="cprogs" id="club-progs" aria-label="Clubs and schools"></nav>
    <div class="clubctl" role="search">
      <div class="cfilters" id="club-filters" role="group" aria-label="Show teams"></div>
      <div class="cfilters ctours" id="club-tours" role="group" aria-label="Tournament"></div>
      <div class="csearch"><label class="sr" for="club-q">Search teams</label><input id="club-q" type="search" placeholder="Search teams, ages or coaches" autocomplete="off" value="${esc(clubQuery())}"></div>
    </div>
    <main class="clubmain" id="club-body" aria-live="polite"></main>
    <footer class="appfoot"><button class="fblink" data-feedback>Send feedback</button></footer>`;
  HOME.built = true;
}
function setIfChanged(id, html) { const el = $(id); if (el && el.innerHTML !== html) el.innerHTML = html; }

renderClub = function () {
  const d = CLUB.data;
  if (!d) { $("club").innerHTML = '<div class="empty">Loading the club…</div>'; HOME.built = false; return; }
  if (!HOME.built || !$("club-body")) buildClubShell();
  const t = $("club-title"); if (t && t.textContent !== pageName(d)) t.textContent = pageName(d);
  const lg = $("club-logo-img"); if (lg && lg.getAttribute("src") !== pageLogo(d)) lg.setAttribute("src", pageLogo(d));
  if (document.title !== pageName(d)) document.title = pageName(d);
  setIfChanged("club-progs", programNavHTML(d));
  const pd = Object.assign({}, d, { teams: programTeams(d), allTeams: d.teams });
  // Connection status, never "Live" (that word is only for games being played).
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  setIfChanged("club-sync", offline ? '<span class="sync lost">Offline</span>' : CLUB.on ? (CLUB.ok ? '<span class="sync view">Connected</span>' : '<span class="sync lost">Reconnecting…</span>') : "");
  const counts = divisionCounts(pd.teams);
  if (!counts.some((c) => c.key === clubFilter())) S.clubFilter = "all";
  setIfChanged("club-filters", counts.map((c) => `<button class="cfbtn" data-cact="filter" data-v="${c.key}" aria-pressed="${clubFilter() === c.key}">${c.label} <span class="cfn">${c.count}</span></button>`).join(""));
  const tours = relevantTours(pd.teams, T());
  if (S.clubTour && !tours.some((x) => x.id === S.clubTour)) S.clubTour = "";
  setIfChanged("club-tours", tours.length >= 2 ? [`<button class="cfbtn" data-cact="tour" data-v="" aria-pressed="${!S.clubTour}">All events</button>`].concat(tours.map((x) => `<button class="cfbtn" data-cact="tour" data-v="${esc(x.id)}" aria-pressed="${S.clubTour === x.id}"><span aria-hidden="true">🏆</span> ${esc(x.name)}</button>`)).join("") : "");
  setIfChanged("club-body", clubBodyHTML(pd, !!clubProgram(d)));
};

/* Tournaments with games from these teams in the recent past or the next few weeks (for the event filter). */
function relevantTours(teams, now) {
  const ids = new Set();
  teams.forEach((t) => t.games.forEach((g) => { const k = kickoffMs(g); if (g.tid && Number.isFinite(k) && k > now - 10 * 864e5 && k < now + 30 * 864e5) ids.add(g.tid); }));
  return tourList().filter((x) => ids.has(x.id));
}
/* Can this device edit the team? Only then are missing-result reminders shown. */
const canEditTeam = (t) => !!(S.master || (S.auth && S.auth[t.id]) || (typeof myRole === "function" && myRole(t.id)));
/* Badges that add something to the title: no "Girls" badge under "13/14 Girls". */
function cardBadges(t) {
  const title = teamShortTitle(t).toLowerCase(), i = teamInfo(t);
  return teamBadgeList(t).filter((b) => {
    if (/^born /i.test(b)) return !title.includes(yearsShort(i.birthYear).toLowerCase()) && !title.includes(String(i.birthYear).toLowerCase());
    return !title.includes(b.toLowerCase());
  });
}

function clubBodyHTML(d, isProgram) {
  const now = T();
  d.teams.forEach((t) => t.games.forEach((g) => { if (g.s && g.s.scorers) g.s.scorers = g.s.scorers.filter((x) => x.by || x.t > 0); }));
  const tour = S.clubTour || "";
  const gamesOf = (t) => (tour ? t.games.filter((g) => g.tid === tour) : t.games);
  const shown = d.teams.filter((t) => teamMatches(t, clubFilter(), clubQuery()) && (!tour || gamesOf(t).length));
  const missingFavs = favTeams().filter((id) => !(d.allTeams || d.teams).some((t) => t.id === id));
  const st = (g) => gameStatus(g, g.s, now, g.at);
  const nowD = new Date(now);
  const season = new Date(nowD.getMonth() >= 7 ? nowD.getFullYear() : nowD.getFullYear() - 1, 7, 1).getTime();
  const lastSeason = new Date(new Date(season).getFullYear() - 1, 7, 1).getTime();
  // Spring sports (school teams) finished before this season's cutoff: show last season's results in the off-season.
  const resultWindow = shown.some((t) => t.games.some((g) => g.s && g.s.fullDone && kickoffMs(g) >= season)) ? season : lastSeason;
  const byKick = (a, b) => kickoffMs(a) - kickoffMs(b);
  const resultTag = (s) => { const r = sResult(s); return `<span class="res r${r}" aria-label="${r === "W" ? "Win" : r === "L" ? "Loss" : "Draw"}">${r}</span>`; };

  /* The one game a team card is about: the active game, else the next one, else the latest result. */
  const focusGame = (t) => {
    const gs = gamesOf(t);
    const live = gs.filter((g) => ["live", "halftime"].includes(st(g))).sort(byKick)[0];
    if (live) return { g: live, kind: "live" };
    const next = gs.filter((g) => ["today", "upcoming"].includes(st(g))).sort(byKick)[0];
    if (next) return { g: next, kind: "next" };
    const last = gs.filter((g) => st(g) === "final" && Number.isFinite(kickoffMs(g))).sort((a, b) => byKick(b, a))[0];
    return last ? { g: last, kind: "result" } : null;
  };
  const when = (g) => gameWhen(g) + (g.field ? " · " + g.field : "");
  const dayOf = (g) => new Date(kickoffMs(g)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const gameBlock = (t, f) => {
    if (!f) return '<p class="tgline muted">No games scheduled.</p>';
    const g = f.g, s = g.s, k = st(g), opp = esc(g.opp || g.title || "Opponent");
    if (f.kind === "live") return `<p class="tgline"><span class="livepill">${k === "halftime" ? "Halftime" : "Live"}</span> <b class="tsc">${s.us}–${s.them}</b> vs ${opp}${k === "live" ? ` <span class="fine" data-ck="${t.id}/${g.id}">${fmtClock(sClock(s))}</span>` : ""}</p>`;
    if (f.kind === "result") return `<p class="tgline">${resultTag(s)} <b class="tsc">${scoreStr(s)}</b> vs ${opp}<span class="tgwhen">${esc(dayOf(g))}</span></p>`;
    return `<p class="tgline"><span class="tglabel">${k === "today" ? "Today" : "Next"}</span> vs <b>${opp}</b><span class="tgwhen">${esc(when(g))}</span></p>`;
  };
  const teamCard = (t) => {
    const f = focusGame(t), g = f && f.g, pend = pendingEntries(t, now)[0];
    // The event for the game shown; or, with nothing coming up, an event the team has signed up for.
    const ev = g && f.kind !== "result" ? tourOf(g) : pend && (!g || f.kind === "result") ? pend.t : g ? tourOf(g) : null;
    const needs = canEditTeam(t) ? t.games.filter((x) => st(x) === "awaiting") : [];
    const badges = cardBadges(t);
    return `<article class="ccard tcard ${f && f.kind === "live" ? "live" : ""}" aria-label="${esc(teamShortTitle(t))}">
      <div class="tchead">${teamBadge(t, "cl")}<div class="tct"><h3><a class="cta" href="${teamLink(t.id)}">${esc(teamShortTitle(t))}</a></h3>${badges.length ? `<div class="tbadges">${badges.map((b) => `<span class="tbadge">${esc(b)}</span>`).join("")}</div>` : ""}</div>${starHTML(t, "cact")}</div>
      ${ev ? `<p class="tev"><span aria-hidden="true">🏆</span> ${esc(ev.name)}${pend && ev === pend.t ? ` <span class="fine">· ${esc(tourDates(ev))} · ${pend.e.status === "applied" ? "applied" : "signed up"}, schedule not posted</span>` : ""}</p>` : ""}
      ${gameBlock(t, f)}
      ${g ? `<div class="tacts"><a class="btn primary-s" href="${gameLink(t.id, g.id)}">View game</a>${g.place && f.kind !== "result" ? `<a class="tlink" href="${mapUrl(g.place)}" target="_blank" rel="noopener">Directions</a>` : ""}</div>` : `<div class="tacts"><a class="tlink" href="${teamLink(t.id)}">Team page</a></div>`}
      ${needs.length ? `<a class="remind" href="${gameLink(t.id, needs[0].id)}">${needs.length} game${needs.length === 1 ? " needs" : "s need"} a final score ›</a>` : ""}
    </article>`;
  };
  /* A compact directory row for teams with nothing coming up soon. */
  const teamRow = (t) => {
    const f = focusGame(t), g = f && f.g;
    const pend = pendingEntries(t, now)[0];
    const line = (!f || f.kind === "result") && pend ? `${pend.t.name} · ${tourDates(pend.t)} · schedule not posted` : !f ? "No games scheduled" : f.kind === "result" ? `${sResult(g.s)} ${scoreStr(g.s)} vs ${g.opp || "Opponent"} · ${dayOf(g)}` : f.kind === "live" ? `Live: ${g.s.us}–${g.s.them} vs ${g.opp || "Opponent"}` : `Next: ${g.opp || g.title || "Opponent"} · ${gameWhen(g)}`;
    return `<div class="dirrow"><a class="dira" href="${teamLink(t.id)}">${teamBadge(t, "cls")}<span class="dirt"><b>${esc(teamShortTitle(t))}</b><span class="fine">${esc(line)}</span></span></a>${starHTML(t, "cact")}</div>`;
  };

  let h = "";
  // 1. Live now: compact rows
  const live = [];
  shown.forEach((t) => gamesOf(t).forEach((g) => { const k = st(g); if (k === "live" || k === "halftime") live.push({ t, g, k }); }));
  if (live.length) h += `<section class="cs"><h2>Live now</h2><div class="clist">${live.map(({ t, g, k }) => `<a class="crow liverow" href="${gameLink(t.id, g.id)}">${teamBadge(t, "cls")}<div class="cinfo"><b>${esc(teamShortTitle(t))}</b> <span class="muted">vs ${esc(g.opp || g.title || "Opponent")}</span><div class="fine">${k === "halftime" ? "Halftime" : `<span data-ck="${t.id}/${g.id}">${fmtClock(sClock(g.s))}</span> · <span data-cp="${t.id}/${g.id}">${sPeriod(g.s)}</span>`}</div></div><b class="cfinal">${g.s.us}–${g.s.them}</b></a>`).join("")}</div></section>`;
  // 2. My teams
  const favs = shown.filter((t) => isFavTeam(t.id));
  const used = new Set(favs.map((t) => t.id));
  if (favs.length || missingFavs.length) {
    h += `<section class="cs"><h2>My teams</h2>${favs.length ? `<div class="cgrid">${favs.map(teamCard).join("")}</div>` : ""}
      ${missingFavs.length ? `<p class="fine">${missingFavs.length} starred team${missingFavs.length === 1 ? " is" : "s are"} no longer listed. <button class="btn small" data-cact="favclean">Remove ${missingFavs.length === 1 ? "it" : "them"}</button></p>` : ""}</section>`;
  } else if (d.teams.some((t) => isFavTeam(t.id))) h += '<p class="fine cshowing">Your starred teams are hidden by the current filter.</p>';
  // 3. Coming up: from Thursday, this weekend's games; otherwise the next 7 days. Hidden when empty.
  const wd = nowD.getDay(), weekendish = wd === 0 || wd >= 4;
  const sun = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() + ((7 - wd) % 7), 23, 59, 59).getTime();
  const until = weekendish ? sun : now + 7 * 864e5;
  const soon = shown.filter((t) => !used.has(t.id)).map((t) => ({ t, f: focusGame(t) }))
    .filter(({ t, f }) => (f && (f.kind === "live" || (f.kind === "next" && kickoffMs(f.g) <= until))) || (!(f && f.kind === "next") && pendingEntries(t, now).some((p) => new Date(p.t.start + "T00:00").getTime() <= until)))
    .sort((a, b) => ((b.f && b.f.kind === "live") - (a.f && a.f.kind === "live")) || ((a.f && a.f.kind === "next" ? kickoffMs(a.f.g) : Infinity) - (b.f && b.f.kind === "next" ? kickoffMs(b.f.g) : Infinity)));
  soon.forEach(({ t }) => used.add(t.id));
  if (soon.length) h += `<section class="cs"><h2>${weekendish ? "This weekend" : "Coming up"}</h2><div class="cgrid">${soon.map(({ t }) => teamCard(t)).join("")}</div></section>`;
  // 4. Recent results: five, then View all
  const results = []; shown.forEach((t) => gamesOf(t).forEach((g) => { if (g.s && g.s.fullDone && kickoffMs(g) >= resultWindow) results.push({ t, g }); }));
  results.sort((a, b) => byKick(b.g, a.g));
  if (results.length) {
    const showN = HOME.allRes ? results.length : 5;
    h += `<section class="cs"><h2>Recent results</h2><div class="clist">${results.slice(0, showN).map(({ t, g }) => `<a class="crow" href="${gameLink(t.id, g.id)}">${teamBadge(t, "cls")}<div class="cinfo"><b>${esc(teamShortTitle(t))}</b> <span class="muted">vs ${esc(g.opp || "Opponent")}</span><div class="fine">${esc(dayOf(g))}${tourOf(g) ? " · " + esc(tourOf(g).name) : ""}</div></div>${resultTag(g.s)}<b class="cfinal">${scoreStr(g.s)}</b></a>`).join("")}</div>
      ${results.length > 5 ? `<button class="btn small morebtn" data-cact="allres">${HOME.allRes ? "Show fewer" : `View all results (${results.length})`}</button>` : ""}</section>`;
  }
  // 5. Everyone else, as a compact directory
  const rest = shown.filter((t) => !used.has(t.id));
  const level = (t) => ({ varsity: 0, jv: 1, "middle school": 2 })[String(teamInfo(t).ageGroup).toLowerCase()] ?? 3;
  rest.sort((a, b) => (level(a) - level(b)) || teamShortTitle(a).localeCompare(teamShortTitle(b), "en", { numeric: true }));
  if (rest.length) h += `<section class="cs"><h2>${favs.length || soon.length ? "All teams" : "Teams"}</h2><div class="dirlist">${rest.map(teamRow).join("")}</div></section>`;

  if (!shown.length && d.teams.length) h = `<div class="empty cempty"><p>No teams match${clubQuery() ? ` “${esc(clubQuery())}”` : ""}${clubFilter() !== "all" ? ` in ${esc((divisionCounts(d.teams).find((c) => c.key === clubFilter()) || {}).label || "")}` : ""}${tour ? " at this tournament" : ""}.</p><button class="btn small primary-s" data-cact="clearfilters">Clear filters</button></div>`;
  else if (clubFilter() !== "all" || clubQuery() || tour) h = `<p class="fine cshowing">Showing ${shown.length} of ${d.teams.length} teams. <button class="btn small" data-cact="clearfilters">Clear filters</button></p>` + h;
  if (!d.teams.length) h = '<div class="empty cempty"><p>No teams yet.</p></div>';
  // Coach and admin tools stay out of the way at the bottom.
  if (!isProgram && (!CLUB.on || S.master)) {
    h += `<details class="cs ctools"${CLUB.edit ? " open" : ""}><summary>Club settings</summary>`;
    if (CLUB.on && S.master) h += `<button class="btn small" data-cact="puball" ${UI.pubBusy ? "disabled" : ""}>${UI.pubBusy ? "Loading teams…" : "Load all teams"}</button>${CLUB.msg ? `<p class="fine">${esc(CLUB.msg)}</p>` : '<p class="fine">Adds every team saved on this device to the club page. Teams already here aren’t changed.</p>'}`;
    h += CLUB.edit ? `<div class="card"><label class="fld">Club name<input id="club-name" value="${esc(clubName())}"></label>
      <div class="fld">Club logo<div class="logorow"><img src="${esc(clubLogo())}" alt=""><label class="btn small filebtn">Upload<input type="file" accept="image/*" id="club-logo" hidden></label></div></div>
      <div class="gacts"><button class="btn small primary-s" data-cact="save">Save</button><button class="btn small" data-cact="cancel">Cancel</button></div></div>` : `<button class="btn small" data-cact="edit">Edit club name and logo</button>`;
    h += "</details>";
  }
  return h;
}

/* ---------- home page actions ---------- */
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-cact]"); if (!b) return;
  const a = b.dataset.cact;
  if (a === "filter") { S.clubFilter = b.dataset.v; saveLocal(); renderClub(); }
  else if (a === "fav") { toggleFavTeam(b.dataset.id); renderClub(); const nb = document.querySelector(`[data-cact="fav"][data-id="${CSS.escape(b.dataset.id)}"]`); if (nb) nb.focus(); }
  else if (a === "favclean") { const ids = new Set((CLUB.data ? CLUB.data.teams : []).map((t) => t.id)); S.favTeams = favTeams().filter((id) => ids.has(id)); saveLocal(); renderClub(); }
  else if (a === "clearfilters") { S.clubFilter = "all"; S.clubQ = ""; S.clubTour = ""; saveLocal(); const q = $("club-q"); if (q) q.value = ""; renderClub(); }
  else if (a === "tour") { S.clubTour = b.dataset.v || ""; saveLocal(); renderClub(); const nb = document.querySelector(`[data-cact="tour"][data-v="${CSS.escape(S.clubTour)}"]`); if (nb) nb.focus(); }
  else if (a === "allres") { HOME.allRes = !HOME.allRes; renderClub(); }
});
document.addEventListener("input", (e) => { if (e.target && e.target.id === "club-q") { S.clubQ = e.target.value; saveLocal(); renderClub(); } });

/* ---------- Setup tab: structured team info ---------- */
const INFO_LABEL = { division: "Division", birthYear: "Birth year", ageGroup: "Age group", ident: "Team identifier" };
function teamInfoFieldsHTML(c) {
  const i = teamInfo(c);
  const has = (k) => typeof c[k] === "string";
  const sug = suggestTeamInfo(c.name, c.sub);
  const pending = INFO_FIELDS.filter((k) => !has(k));
  return `<div class="tinfo"><h4>Team details</h4><p class="fine" style="margin-top:-2px">Used for the club page’s titles, badges, filters and search. Preview: <b>${esc(teamShortTitle(c))}</b></p>
    <div class="grid2"><label class="fld">Division<select data-cfg="team" data-f="division">${Object.entries(DIVISIONS).map(([k, l]) => `<option value="${k}" ${i.division === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="fld">Birth year or range<input data-cfg="team" data-f="birthYear" value="${esc(i.birthYear)}" placeholder="e.g. 2014 or 2014-2015" inputmode="numeric"></label></div>
    <div class="grid2"><label class="fld">Age group<input data-cfg="team" data-f="ageGroup" value="${esc(i.ageGroup)}" placeholder="e.g. U12"></label>
      <label class="fld">Team identifier (optional)<input data-cfg="team" data-f="ident" value="${esc(i.ident)}" placeholder="e.g. White, Red"></label></div>
    <label class="fld">Club or school program<input data-cfg="team" data-f="program" value="${esc(c.program || "")}" list="prog-list" placeholder="Leave blank for ${esc(clubName())}" autocomplete="off"></label>
    <datalist id="prog-list">${programsOf(typeof pickerTeams === "function" ? pickerTeams() : []).map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist>
    <p class="fine" style="margin-top:-4px">Teams in a school program (like Athens City Schools) get their own page, linked from the club page.</p>
    ${pending.length ? `<p class="fine tinfonote">${pending.map((k) => esc(INFO_LABEL[k]) + (sug[k] ? " (suggested from the team name)" : " (not set)")).join(", ")}: not confirmed yet. <button class="btn small" data-act="teaminfoconfirm">Confirm these details</button></p>` : '<p class="fine">Details confirmed.</p>'}</div>`;
}
/* Normalize what's typed before the tracker saves it: "2014/15" → "2014-2015", "u12" → "U12". */
document.addEventListener("change", (e) => {
  const el = e.target; if (!el || !el.dataset || el.dataset.cfg !== "team") return;
  if (el.dataset.f === "birthYear") { const v = el.value.trim(); const m = v.match(/^(20\d\d)\s*[\/\-–]\s*(?:20)?(\d\d)$/); el.value = m ? m[1] + "-20" + m[2] : /^20\d\d$/.test(v) || !v ? v : v.replace(/[^\d\-]/g, "").slice(0, 9); }
  if (el.dataset.f === "ageGroup") { const m = el.value.trim().match(/^u-?(\d{1,2})$/i); if (m) el.value = "U" + +m[1]; }
  if (el.dataset.f === "ident") el.value = el.value.trim().slice(0, 24);
}, true);
EXT.teaminfoconfirm = () => {
  if (!isHead()) { say("Only a head coach can change the team details"); return; }
  const c = CFG(); const i = teamInfo(c);
  INFO_FIELDS.forEach((k) => { if (typeof c[k] !== "string") c[k] = i[k]; });
  say("Team details confirmed"); save();
};
