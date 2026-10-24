"use strict";
/* Header navigation built for a whole season: tap the team name to switch teams, tap the game button to pick
   any game from a list (live, coming up, results). The clock-fix panel opens as a bottom sheet with a Done button
   instead of growing the header, which on a phone could cover the field. */
const NAV={open:'',allRes:false};
const gameLabel=gc=>gc.opp?(gc.title&&gc.title!==gc.opp&&!gc.opp.startsWith(gc.title)?gc.title+' · '+gc.opp:gc.opp):(gc.title||'Game');

renderBrand=(base=>function(){
  base();
  const b=document.querySelector('.top .brand');
  if(b){b.dataset.act='teampick';b.setAttribute('role','button');b.tabIndex=0;b.setAttribute('aria-label','Switch team. Now showing '+CFG().name);b.setAttribute('aria-haspopup','dialog');}
  const n=$('bname');if(n&&!n.querySelector('.caret'))n.insertAdjacentHTML('beforeend',' <span class="caret" aria-hidden="true">▾</span>');
})(renderBrand);

renderGames=function(){
  const gc=GC();if(!gc)return;const i=curIdx();
  $('games').innerHTML=`<a class="gbtn clubbtn" href="${clubLink()}" aria-label="All teams"><b>‹ All teams</b></a>
    <button class="gbtn gpick" data-act="gamepick" aria-haspopup="dialog" aria-label="Pick a game: ${esc(gameLabel(gc))}"><span class="gpt"><b>${esc(gameLabel(gc))}</b><small data-lv="gstat" data-i="${i}">${esc(status(gc))}</small></span><span class="caret" aria-hidden="true">▾</span></button>`;
};

function resultChip(st,gc){
  const k=gc?gStatus(gc):'';
  if(k==='live'||k==='halftime')return `<span class="livepill">${k==='halftime'?'Halftime':'Live'}</span>`;
  if(k==='awaiting')return `<span class="stpill">${esc(statusLabel(k,st))}</span>`;
  if(k==='postponed')return '<span class="stpill">Postponed</span>';
  if(!st||!st.fullDone)return '';
  const sc=scoreOf(st);const r=sc.us>sc.them?'W':sc.us<sc.them?'L':(st.pk?(pkScore(st).us>pkScore(st).them?'W':'L'):'D');
  return `<span class="res r${r}">${r}</span> <b>${sc.us}–${sc.them}</b>`;
}
function gamePickHTML(){
  if(NAV.open!=='game'||!CFG())return '';
  const now=T();
  const games=CFG().games.map((gc,i)=>({gc,i,st:TS().games[gc.id],t:kickoffMs(gc)}));
  const by=b=>games.filter(x=>gBucket(x.gc)===b);
  const asc=(a,b)=>a.t-b.t,desc=(a,b)=>b.t-a.t;
  const live=by('live'),today=by('today').sort(asc),up=by('upcoming').sort(asc),needs=by('needs-result').sort(desc),undated=by('undated');
  const done=by('final').sort((a,b)=>(Number.isFinite(b.t)?b.t:0)-(Number.isFinite(a.t)?a.t:0));
  const row=x=>`<button class="grow ${x.i===curIdx()?'cur':''}" data-act="navgame" data-i="${x.i}">${logoImg(oppLogoOf(x.gc),'glg')}<span class="grt"><b>${esc(gameLabel(x.gc))}</b><small>${esc(whenText(x.gc))}${x.gc.field?', '+esc(x.gc.field):''}</small></span><span class="grr">${resultChip(x.st,x.gc)}</span></button>`;
  const sec=(t,l,note)=>l.length?`<h4>${t}</h4>${note?`<p class="fine">${note}</p>`:''}${l.map(row).join('')}`:'';
  const shown=NAV.allRes?done:done.slice(0,8);
  return `<div class="ovbg" data-act="navclose"></div><div class="ovp navp" role="dialog" aria-label="Games">
    <div class="sh"><div><b>${esc(teamShortTitle(CFG()))}</b><div class="fine">${games.length} game${games.length===1?'':'s'}</div></div><button class="btn small" data-act="navclose">Close</button></div>
    ${sec('Live now',live)}${sec('Today',today)}${sec('Coming up',up)}
    ${sec('Needs result',needs,'These dates have passed without a result. Open one to enter the score.')}
    ${sec('Date not set',undated)}${sec('Results',shown)}
    ${done.length>shown.length?`<button class="btn small" data-act="navallres">Show all ${done.length} results</button>`:''}
    ${!games.length?'<p class="fine">No games yet.</p>':''}
    ${canEdit()&&isHead()?'<div class="gacts"><button class="btn small" data-act="navaddgame">+ Add a game</button></div>':''}</div>`;
}
/* Every team with its info: the live list from the server, plus teams on this device. */
function pickerTeams(){
  const m=new Map();
  (UI.teamList||[]).forEach(t=>m.set(t.id,Object.assign({},t)));
  Object.keys(S.T).forEach(id=>{const c=S.T[id].cfg;if(!c||c.test)return; /* test teams are only reached from Setup */const t=Object.assign({id},m.get(id)||{},{name:c.name,short:c.short||'',sub:c.sub||''});INFO_FIELDS.forEach(k=>{if(typeof c[k]==='string')t[k]=c[k];});t.program=c.program||'';m.set(id,t);});
  return [...m.values()];
}
function teamPickListHTML(){
  const all=pickerTeams(),list=all.filter(t=>teamMatches(t,clubFilter(),clubQuery())).sort(teamSortCmp);
  const mine=t=>isAdmin()||!!myRole(t.id)||(t.id===S.team&&!!myCode())||!!S.auth[t.id];
  const favs=list.filter(t=>isFavTeam(t.id)),rest=list.filter(t=>!isFavTeam(t.id));
  const yours=rest.filter(mine),others=rest.filter(t=>!mine(t));
  const row=t=>`<div class="grow trow ${t.id===S.team?'cur':''}"><button class="trbtn" data-act="navteam" data-id="${esc(t.id)}"><span class="grt"><b>${esc(teamShortTitle(t))}</b><small>${programOf(t)?esc(programOf(t))+' · ':''}${teamBadgeList(t).map(esc).join(' · ')}${teamBadgeList(t).length?' · ':''}${t.id===S.team?'Open now':myRole(t.id)?ROLE_NAME[myRole(t.id)]:isAdmin()?'Admin':'View only'}</small></span></button>${starHTML(t,'act')}</div>`;
  if(!list.length)return `<div class="empty"><p>No teams match.</p><button class="btn small primary-s" data-act="navclear">Clear filters</button></div>`;
  const rows=ts=>{const mixed=new Set(ts.map(teamDivisionKey)).size>1;let last=null;return ts.map(t=>{const d=teamDivisionKey(t),h=mixed&&d!==last?`<div class="gdiv">${esc(divisionLabel(d==='unspecified'?'':d))}</div>`:'';last=d;return h+row(t);}).join('');};
  return (favs.length?`<h4>My teams</h4>${rows(favs)}`:'')
    +(yours.length&&(others.length||favs.length)?'<h4>Your teams</h4>':'')+rows(yours)
    +(others.length?`<h4>${yours.length||favs.length?'Other teams':'Teams'}</h4>${rows(others)}`:'');
}
function teamPickHTML(){
  if(NAV.open!=='team')return '';
  const counts=divisionCounts(pickerTeams());
  return `<div class="ovbg" data-act="navclose"></div><div class="ovp navp" role="dialog" aria-label="Teams">
    <div class="sh"><div><b>Teams</b><div class="fine">${esc(clubName())}</div></div><button class="btn small" data-act="navclose">Close</button></div>
    <div class="cfilters" role="group" aria-label="Show teams">${counts.map(c=>`<button class="cfbtn" data-act="navfilter" data-v="${c.key}" aria-pressed="${clubFilter()===c.key}">${c.label} <span class="cfn">${c.count}</span></button>`).join('')}</div>
    <div class="csearch"><label class="sr" for="nav-q">Search teams</label><input id="nav-q" type="search" placeholder="Search teams" autocomplete="off" value="${esc(clubQuery())}"></div>
    ${!UI.teamList&&SY.on?'<p class="fine">Loading teams…</p>':''}
    <div id="nav-tlist">${teamPickListHTML()}</div>
    <div class="gacts"><a class="btn small" href="${clubLink()}">Club scoreboard</a>${isAdmin()?'<button class="btn small primary-s" data-act="adminopen">Club admin</button>':''}</div></div>`;
}
/* The ⋯ menu: less frequent actions, kept out of the way during a game. Parents find coach sign-in here. */
function menuHTML(){
  if(NAV.open!=='menu'||!CFG())return '';
  const g=G(),ed=canEdit();
  let h=`<div class="ovbg" data-act="navclose"></div><div class="ovp navp menup" role="dialog" aria-label="Menu">
    <div class="sh"><div><b>${esc(teamShortTitle(CFG()))}</b><div class="fine">${esc(CFG().name)}</div></div><button class="btn small" data-act="navclose">Close</button></div>
    <div class="mlist"><button class="mitem" data-act="teampick">Switch team</button><a class="mitem" href="${clubLink()}">All teams</a>${typeof canOfferInstall==='function'&&canOfferInstall()?'<button class="mitem" data-install>Add to Home Screen</button>':''}<button class="mitem" data-feedback>Send feedback</button></div>`;
  if(ed){
    h+=`<h4>This game</h4><div class="mlist"><button class="mitem" data-act="menuundo" ${g.events.length?'':'disabled'}>Undo last sub</button>
      <button class="mitem" data-act="menuclock" ${g.started?'':'disabled'}>Fix the clock or add time</button></div>`;
    if(g.started&&!g.fullDone)h+=`<div class="mlist mdanger"><button class="mitem danger ${armed('endgame')?'armed':''}" data-act="menuend">${armed('endgame')?'Tap again to end the game':'End game'}</button></div>`;
    h+=`<h4>This device</h4><div class="mlist">${ME.user?`<p class="fine">Signed in as ${whoLine()}</p><button class="mitem" data-act="signout">Sign out</button>`:`<button class="mitem" data-act="editor">Stop editing on this device</button>`}</div>`;
  }else h+=`<h4>Coaches</h4>${renderCoachUnlock()}`;
  return h+'</div>';
}
OVERLAYS.unshift(gamePickHTML,teamPickHTML,menuHTML);
EXT.menu=()=>{NAV.open=NAV.open==='menu'?'':'menu';};
EXT.menuundo=()=>{NAV.open='';act('undo',{});return false;};
EXT.menuclock=()=>{NAV.open='';UI.adj=true;};
EXT.menuend=()=>{act('endgame',{});if(G().fullDone)NAV.open='';renderAll();return false;};

['teampick','gamepick','navclose','navgame','navteam','navallres','navfilter','navclear','fav','menu'].forEach(a=>VIEW_OK.add(a));
EXT.navfilter=ds=>{S.clubFilter=ds.v;saveLocal();};
EXT.navclear=()=>{S.clubFilter='all';S.clubQ='';saveLocal();const q=$('nav-q');if(q){q.value='';q.blur();}};
// Stars in the team switcher (favorites live on this device; they never grant editing).
EXT.fav=ds=>{toggleFavTeam(ds.id);};
document.addEventListener('input',e=>{if(e.target&&e.target.id==='nav-q'){S.clubQ=e.target.value;saveLocal();const el=$('nav-tlist');if(el)el.innerHTML=teamPickListHTML();}});
EXT.teampick=()=>{NAV.open=NAV.open==='team'?'':'team';if(!UI.teamList)loadTeamList().then(()=>renderAll());};
EXT.gamepick=()=>{NAV.open=NAV.open==='game'?'':'game';};
EXT.navclose=()=>{NAV.open='';};
EXT.navallres=()=>{NAV.allRes=true;};
EXT.navgame=ds=>{NAV.open='';act('game',ds);return false;};
EXT.navteam=ds=>{NAV.open='';if(ds.id!==S.team)switchTeam(ds.id);};
EXT.navaddgame=()=>{NAV.open='';act('gmadd',{});S.mode='team';S.tab='schedule';saveLocal();renderAll();return false;};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(NAV.open||UI.adj)){const was=NAV.open;NAV.open='';UI.adj=false;renderAll();
  // Return focus to what opened the panel.
  const back=was==='menu'?$('menubtn'):was==='team'?document.querySelector('.top .brand'):was==='game'?document.querySelector('.gpick'):null;if(back)back.focus();}});
