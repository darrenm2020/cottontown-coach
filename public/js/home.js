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
  el.innerHTML = `<header class="clubtop"><img id="club-logo-img" src="${esc(clubLogo())}" alt=""><div><h1 id="club-title">${esc(clubName())}</h1><p>Club scoreboard <span id="club-sync"></span></p></div></header>
    <div class="clubctl" role="search">
      <div class="cfilters" id="club-filters" role="group" aria-label="Show teams"></div>
      <div class="csearch"><label class="sr" for="club-q">Search teams</label><input id="club-q" type="search" placeholder="Search teams, age groups, birth years, coaches" autocomplete="off" value="${esc(clubQuery())}"></div>
    </div>
    <main class="clubmain" id="club-body" aria-live="polite"></main>`;
  HOME.built = true;
}
function setIfChanged(id, html) { const el = $(id); if (el && el.innerHTML !== html) el.innerHTML = html; }

renderClub = function () {
  const d = CLUB.data;
  if (!d) { $("club").innerHTML = '<div class="empty">Loading the club…</div>'; HOME.built = false; return; }
  if (!HOME.built || !$("club-body")) buildClubShell();
  const t = $("club-title"); if (t && t.textContent !== clubName()) t.textContent = clubName();
  const lg = $("club-logo-img"); if (lg && lg.getAttribute("src") !== clubLogo()) lg.setAttribute("src", clubLogo());
  setIfChanged("club-sync", CLUB.on ? (CLUB.ok ? '<span class="sync run">Live</span>' : '<span class="sync lost">Reconnecting</span>') : "");
  const counts = divisionCounts(d.teams);
  if (!counts.some((c) => c.key === clubFilter())) S.clubFilter = "all";
  setIfChanged("club-filters", counts.map((c) => `<button class="cfbtn" data-cact="filter" data-v="${c.key}" aria-pressed="${clubFilter() === c.key}">${c.label} <span class="cfn">${c.count}</span></button>`).join(""));
  setIfChanged("club-body", clubBodyHTML(d));
};

function clubBodyHTML(d) {
  const now = T();
  d.teams.forEach((t) => t.games.forEach((g) => { if (g.s && g.s.scorers) g.s.scorers = g.s.scorers.filter((x) => x.by || x.t > 0); }));
  const shown = d.teams.filter((t) => teamMatches(t, clubFilter(), clubQuery()));
  const missingFavs = favTeams().filter((id) => !d.teams.some((t) => t.id === id));
  const bucket = (g) => gameBucket(g, g.s, now);
  const nowD = new Date(now);
  const season = new Date(nowD.getMonth() >= 7 ? nowD.getFullYear() : nowD.getFullYear() - 1, 7, 1).getTime();
  const inSeason = (g) => { const v = kickoffMs(g); return Number.isFinite(v) && v >= season; };
  // Weekend window: Friday 00:00 through Sunday 23:59 of this week (or the coming one, Mon-Thu)
  const wd = nowD.getDay(); const sun = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() + ((7 - wd) % 7));
  const wkStart = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() - 2).getTime(), wkEnd = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate(), 23, 59, 59).getTime();
  const inWk = (g) => { const v = kickoffMs(g); return Number.isFinite(v) && v >= wkStart && v <= wkEnd; };
  const wkLabel = new Date(wkStart + 864e5).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + "–" + new Date(wkEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const recOf = (t) => { let w = 0, l = 0, dr = 0; t.games.forEach((g) => { if (!inSeason(g)) return; const r = sResult(g.s); if (r === "W") w++; else if (r === "L") l++; else if (r === "D") dr++; }); return `${w}-${dr}-${l}`; };
  const hasRecord = (t) => t.games.some((g) => inSeason(g) && g.s && g.s.fullDone);

  const gameLine = (t, g) => { const s = g.s; let st;
    if (s && s.started && !s.fullDone) st = `<span class="gl-live"><b>${s.us}–${s.them}</b> <span data-ck="${t.id}/${g.id}">${fmtClock(sClock(s))}</span> <span class="per" data-cp="${t.id}/${g.id}">${sPeriod(s)}</span></span>`;
    else if (s && s.fullDone) { const r = sResult(s); st = `<span class="res r${r}" aria-label="${r === "W" ? "Win" : r === "L" ? "Loss" : "Draw"}">${r}</span> <b class="glsc">${scoreStr(s)}</b>`; }
    else if (bucket(g) === "needs-result") st = '<span class="tbadge warnb">Needs result</span>';
    else { const cd = countdown(g); st = cd ? `<span class="cd" data-kick="${esc(g.dt)}">${cd}</span>` : ""; }
    return `<div class="gl ${s && s.started && !s.fullDone ? "on" : ""}">${logoImg(oppLogoOf(g), "cls")}<div class="cinfo"><b>vs ${esc(g.opp || g.title || "Opponent")}</b><div class="fine">${esc(gameWhen(g))}${g.field ? " · " + esc(g.field) : ""}</div></div><div class="glst">${st}</div></div>`; };

  /* Team card: short title, text badges, record, and the next game (opponent, day, time, field) with View game and Directions. */
  const teamCard = (t, opts = {}) => {
    const live = t.games.some((g) => bucket(g) === "live");
    const nx = nextGameOf(t.games, (g) => g.s, now);
    const needs = t.games.filter((g) => bucket(g) === "needs-result").length;
    // Other games this weekend (the next game has its own block above them, with View game and Directions).
    const wk = opts.weekend ? t.games.filter((g) => inWk(g) && g !== nx).sort((a, b) => kickoffMs(a) - kickoffMs(b)) : [];
    const nextBlock = nx ? `<div class="cnext"><span class="cnl">${bucket(nx) === "today" ? "Today" : "Next"}</span><div><b>vs ${esc(nx.opp || nx.title || "Opponent")}</b><div class="fine">${esc(gameWhen(nx))}${nx.field ? " · " + esc(nx.field) : ""}</div></div>
        <div class="cnacts"><a class="btn small" href="${gameLink(t.id, nx.id)}">View game</a>${nx.place ? `<a class="btn small" href="${mapUrl(nx.place)}" target="_blank" rel="noopener">Directions</a>` : ""}</div></div>`
      : '<p class="fine cnone">No upcoming games scheduled.</p>';
    return `<article class="ccard tcard ${live ? "live" : ""}" aria-label="${esc(teamShortTitle(t))}">
      <div class="ct">${teamBadge(t, "cl")}<div class="ctt"><a class="cta" href="${teamLink(t.id)}"><h3>${esc(teamShortTitle(t))}</h3></a>
        <div class="tbadges">${badgesHTML(t)}${live ? '<span class="livepill">Live</span>' : ""}</div>
        <div class="fine">${t.placing ? `<span class="cplace">${esc(placeText(t.placing))}</span> · ` : ""}${hasRecord(t) ? recOf(t) + " this season (W-D-L)" : esc(t.format || "")}</div></div>${starHTML(t, "cact")}</div>
      ${nextBlock}
      ${wk.length ? `<div class="gls" aria-label="Also this weekend">${wk.map((g) => `<a class="gla" href="${gameLink(t.id, g.id)}">${gameLine(t, g)}</a>`).join("")}</div>` : ""}
      ${needs ? `<p class="fine cneeds">${needs} past game${needs === 1 ? "" : "s"} need${needs === 1 ? "s" : ""} a result.</p>` : ""}
      <a class="open" href="${teamLink(t.id)}">Open ${esc(teamShortTitle(t))} ›</a></article>`;
  };

  let h = "";
  // Live now
  const live = []; shown.forEach((t) => t.games.forEach((g) => { if (bucket(g) === "live") live.push({ t, g }); }));
  if (live.length) h += `<section class="cs"><h2>Live now</h2><div class="clist">${live.map(({ t, g }) => `<a class="crow" href="${gameLink(t.id, g.id)}">${teamBadge(t, "cls")}<div class="cinfo"><b>${esc(teamShortTitle(t))}</b>${gameLine(t, g)}</div></a>`).join("")}</div></section>`;
  // My teams (favorites), then the weekend, then everyone else; each team appears once.
  const favs = shown.filter((t) => isFavTeam(t.id));
  const used = new Set(favs.map((t) => t.id));
  if (favs.length || missingFavs.length) {
    h += `<section class="cs"><h2>My teams</h2>${favs.length ? `<div class="cgrid">${favs.map((t) => teamCard(t, { weekend: t.games.some(inWk) })).join("")}</div>` : ""}
      ${!favs.length && favTeams().length && missingFavs.length < favTeams().length ? '<p class="fine">Your starred teams are hidden by the current filter.</p>' : ""}
      ${missingFavs.length ? `<p class="fine">${missingFavs.length} starred team${missingFavs.length === 1 ? " is" : "s are"} no longer listed. <button class="btn small" data-cact="favclean">Remove ${missingFavs.length === 1 ? "it" : "them"}</button></p>` : ""}</section>`;
  }
  const wkTeams = shown.filter((t) => !used.has(t.id) && t.games.some(inWk))
    .map((t) => ({ t, live: t.games.some((g) => bucket(g) === "live"), first: Math.min(...t.games.filter(inWk).map(kickoffMs)) }))
    .sort((a, b) => (b.live - a.live) || (a.first - b.first));
  wkTeams.forEach(({ t }) => used.add(t.id));
  h += `<section class="cs"><h2>Playing this weekend <span class="wk">${wkLabel}</span></h2>${wkTeams.length ? `<div class="cgrid">${wkTeams.map(({ t }) => teamCard(t, { weekend: true })).join("")}</div>` : '<p class="muted">No other teams play this weekend.</p>'}</section>`;
  const rest = shown.filter((t) => !used.has(t.id)).sort((a, b) => teamShortTitle(a).localeCompare(teamShortTitle(b), "en", { numeric: true }));
  if (rest.length) h += `<section class="cs"><h2>${favs.length || wkTeams.length ? "Remaining teams" : "Teams"}</h2><div class="cgrid">${rest.map((t) => teamCard(t)).join("")}</div></section>`;
  // Recent results
  const results = []; shown.forEach((t) => t.games.forEach((g) => { if (g.s && g.s.fullDone && inSeason(g)) results.push({ t, g }); }));
  results.sort((a, b) => kickoffMs(b.g) - kickoffMs(a.g));
  h += `<section class="cs"><h2>Recent results</h2>${results.length ? '<div class="clist">' + results.slice(0, 15).map(({ t, g }) => { const s = g.s; const r = sResult(s);
    return `<a class="crow" href="${gameLink(t.id, g.id)}">${teamBadge(t, "cls")}<div class="cinfo"><b>${esc(teamShortTitle(t))}</b> vs ${esc(g.opp || "Opponent")}${logoImg(oppLogoOf(g), "ilg")}<div class="fine">${esc(gameWhen(g))}${s.scorers.length ? ": " + s.scorers.map((x) => esc(x.by || "Goal")).join(", ") : ""}</div></div><span class="res r${r}" aria-label="${r === "W" ? "Win" : r === "L" ? "Loss" : "Draw"}">${r}</span><span class="cfinal">${scoreStr(s)}</span></a>`; }).join("") + "</div>" : '<p class="muted">No finished games yet this season.</p>'}</section>`;
  // Nothing matches
  if (!shown.length && d.teams.length) h = `<div class="empty cempty"><p>No teams match${clubQuery() ? ` “${esc(clubQuery())}”` : ""}${clubFilter() !== "all" ? ` in ${esc((divisionCounts(d.teams).find((c) => c.key === clubFilter()) || {}).label || "")}` : ""}.</p><button class="btn small primary-s" data-cact="clearfilters">Clear filters</button></div>`;
  else if (clubFilter() !== "all" || clubQuery()) h = `<p class="fine cshowing">Showing ${shown.length} of ${d.teams.length} teams. <button class="btn small" data-cact="clearfilters">Clear filters</button></p>` + h;
  // Coach tools and club settings, as before
  if (CLUB.on && S.master) h += `<section class="cs"><h2>Coach tools</h2><button class="btn small primary-s" data-cact="puball" ${UI.pubBusy ? "disabled" : ""}>${UI.pubBusy ? "Loading teams…" : "Load all teams"}</button>${CLUB.msg ? `<p class="fine">${esc(CLUB.msg)}</p>` : '<p class="fine">Adds every team saved on this device to the club page. Teams already here aren’t changed.</p>'}</section>`;
  if (!CLUB.on || S.master) h += `<section class="cs"><h2>Club settings</h2>${CLUB.edit ? `<div class="card"><label class="fld">Club name<input id="club-name" value="${esc(clubName())}"></label>
      <div class="fld">Club logo<div class="logorow"><img src="${esc(clubLogo())}" alt=""><label class="btn small filebtn">Upload<input type="file" accept="image/*" id="club-logo" hidden></label></div></div>
      <div class="gacts"><button class="btn small primary-s" data-cact="save">Save</button><button class="btn small" data-cact="cancel">Cancel</button></div></div>` : `<button class="btn small" data-cact="edit">Edit club name and logo</button>`}</section>`;
  h += `<p class="fine cfoot">Tap a team or game to follow it. Star teams to keep them under My teams on this device. ${CLUB.on ? "Scores update every few seconds." : ""}</p>`;
  return h;
}

/* ---------- home page actions ---------- */
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-cact]"); if (!b) return;
  const a = b.dataset.cact;
  if (a === "filter") { S.clubFilter = b.dataset.v; saveLocal(); renderClub(); }
  else if (a === "fav") { toggleFavTeam(b.dataset.id); renderClub(); const nb = document.querySelector(`[data-cact="fav"][data-id="${CSS.escape(b.dataset.id)}"]`); if (nb) nb.focus(); }
  else if (a === "favclean") { const ids = new Set((CLUB.data ? CLUB.data.teams : []).map((t) => t.id)); S.favTeams = favTeams().filter((id) => ids.has(id)); saveLocal(); renderClub(); }
  else if (a === "clearfilters") { S.clubFilter = "all"; S.clubQ = ""; saveLocal(); const q = $("club-q"); if (q) q.value = ""; renderClub(); }
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
