"use strict";
/* Header navigation built for a whole season: tap the team name to switch teams, tap the game button to pick
   any game from a list (live, coming up, results). The clock-fix panel opens as a bottom sheet with a Done button
   instead of growing the header, which on a phone could cover the field. */
const NAV={open:'',allRes:false};
const gameLabel=gc=>gc.opp?(gc.title&&gc.title!==gc.opp&&!gc.opp.startsWith(gc.title)?gc.title+' · '+gc.opp:gc.opp):(gc.title||'Game');

renderBrand=(base=>function(){
  base();
  const b=document.querySelector('.top .brand');
  if(b){b.dataset.act='teampick';b.setAttribute('role','button');b.tabIndex=0;b.setAttribute('aria-label','Switch team');b.setAttribute('aria-haspopup','dialog');}
  const n=$('bname');if(n&&!n.querySelector('.caret'))n.insertAdjacentHTML('beforeend',' <span class="caret" aria-hidden="true">▾</span>');
})(renderBrand);

renderGames=function(){
  const gc=GC();if(!gc)return;const i=curIdx();
  $('games').innerHTML=`<a class="gbtn clubbtn" href="${clubLink()}"><b>‹ Club</b><small>All teams</small></a>
    <button class="gbtn gpick" data-act="gamepick" aria-haspopup="dialog" aria-label="Pick a game: ${esc(gameLabel(gc))}"><span class="gpt"><b>${esc(gameLabel(gc))}</b><small data-lv="gstat" data-i="${i}">${esc(status(gc))}</small></span><span class="caret" aria-hidden="true">▾</span></button>`;
};

function resultChip(st){
  if(!st||!st.started)return '';
  if(!st.fullDone)return '<span class="livepill">Live</span>';
  const sc=scoreOf(st);const r=sc.us>sc.them?'W':sc.us<sc.them?'L':(st.pk?(pkScore(st).us>pkScore(st).them?'W':'L'):'D');
  return `<span class="res r${r}">${r}</span> <b>${sc.us}–${sc.them}</b>`;
}
function gamePickHTML(){
  if(NAV.open!=='game'||!CFG())return '';
  const now=Date.now(),day=new Date().toDateString();
  const games=CFG().games.map((gc,i)=>({gc,i,st:TS().games[gc.id],t:new Date(gc.dt).getTime()}));
  const live=games.filter(x=>x.st&&x.st.started&&!x.st.fullDone);
  const done=games.filter(x=>x.st&&x.st.fullDone).sort((a,b)=>(b.t||0)-(a.t||0));
  const rest=games.filter(x=>!(x.st&&x.st.started));
  const today=rest.filter(x=>!isNaN(x.t)&&new Date(x.t).toDateString()===day);
  const up=rest.filter(x=>!today.includes(x)).sort((a,b)=>(isNaN(a.t)?Infinity:a.t)-(isNaN(b.t)?Infinity:b.t));
  const row=x=>`<button class="grow ${x.i===curIdx()?'cur':''}" data-act="navgame" data-i="${x.i}">${logoImg(oppLogoOf(x.gc),'glg')}<span class="grt"><b>${esc(gameLabel(x.gc))}</b><small>${esc(whenText(x.gc))}${x.gc.field?', '+esc(x.gc.field):''}</small></span><span class="grr">${resultChip(x.st)}</span></button>`;
  const sec=(t,l)=>l.length?`<h4>${t}</h4>${l.map(row).join('')}`:'';
  const shown=NAV.allRes?done:done.slice(0,8);
  return `<div class="ovbg" data-act="navclose"></div><div class="ovp navp" role="dialog" aria-label="Games">
    <div class="sh"><div><b>${esc(CFG().name)}</b><div class="fine">${games.length} game${games.length===1?'':'s'}</div></div><button class="btn small" data-act="navclose">Close</button></div>
    ${sec('Live now',live)}${sec('Today',today)}${sec('Coming up',up)}${sec('Results',shown)}
    ${done.length>shown.length?`<button class="btn small" data-act="navallres">Show all ${done.length} results</button>`:''}
    ${!games.length?'<p class="fine">No games yet.</p>':''}
    ${canEdit()&&isHead()?'<div class="gacts"><button class="btn small" data-act="navaddgame">+ Add a game</button></div>':''}</div>`;
}
function teamPickHTML(){
  if(NAV.open!=='team')return '';
  const list=teamsList();
  const mine=t=>isAdmin()||!!myRole(t.id)||(t.id===S.team&&!!myCode())||!!S.auth[t.id];
  const yours=list.filter(mine),others=list.filter(t=>!mine(t));
  const row=t=>`<button class="grow ${t.id===S.team?'cur':''}" data-act="navteam" data-id="${esc(t.id)}"><span class="grt"><b>${esc(t.name)}</b><small>${t.id===S.team?'Open now':myRole(t.id)?ROLE_NAME[myRole(t.id)]:isAdmin()?'Admin':'View only'}</small></span></button>`;
  return `<div class="ovbg" data-act="navclose"></div><div class="ovp navp" role="dialog" aria-label="Teams">
    <div class="sh"><div><b>Teams</b><div class="fine">${esc(clubName())}</div></div><button class="btn small" data-act="navclose">Close</button></div>
    ${!UI.teamList&&SY.on?'<p class="fine">Loading teams…</p>':''}
    ${yours.length&&others.length?'<h4>Your teams</h4>':''}${yours.map(row).join('')}
    ${others.length?`<h4>${yours.length?'Other teams':'Teams'}</h4>${others.map(row).join('')}`:''}
    <div class="gacts"><a class="btn small" href="${clubLink()}">Club scoreboard</a>${isAdmin()?'<button class="btn small primary-s" data-act="adminopen">Club admin</button>':''}</div></div>`;
}
OVERLAYS.unshift(gamePickHTML,teamPickHTML);

['teampick','gamepick','navclose','navgame','navteam','navallres'].forEach(a=>VIEW_OK.add(a));
EXT.teampick=()=>{NAV.open=NAV.open==='team'?'':'team';if(!UI.teamList)loadTeamList().then(()=>renderAll());};
EXT.gamepick=()=>{NAV.open=NAV.open==='game'?'':'game';};
EXT.navclose=()=>{NAV.open='';};
EXT.navallres=()=>{NAV.allRes=true;};
EXT.navgame=ds=>{NAV.open='';act('game',ds);return false;};
EXT.navteam=ds=>{NAV.open='';if(ds.id!==S.team)switchTeam(ds.id);};
EXT.navaddgame=()=>{NAV.open='';act('gmadd',{});S.tab='setup';saveLocal();return false;};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(NAV.open||UI.adj)){NAV.open='';UI.adj=false;renderAll();}});
