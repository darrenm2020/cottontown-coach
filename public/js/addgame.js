"use strict";
/* Add a game. Two ways in, both from the top of the game list and the Schedule tab:
   Quick game: starting now, the opponent is optional, opens straight to the game.
   Schedule a game: opponent, home or away, our jersey color, date and time (time can be TBD), field, type. */
const ADD={open:false,mode:'',d:null};
const JERSEYS=[['Red','#c8202a'],['White','#ffffff'],['Black','#111111'],['Blue','#1d4ed8'],['Navy','#1e2a4a'],['Green','#15803d'],['Yellow','#facc15'],['Orange','#ea580c'],['Purple','#7c3aed'],['Gray','#9ca3af']];
const HOME_AWAY={home:'Home',away:'Away',neutral:'Neutral site'};
const GAME_KINDS={league:'League',friendly:'Friendly',tournament:'Tournament'};
/* One short line for schedules: "Home · Red jerseys · Friendly". */
function gameMeta(gc){return [HOME_AWAY[gc.ha]||'',gc.jersey?gc.jersey+' jerseys':'',gc.kind==='friendly'?'Friendly':''].filter(Boolean).join(' · ');}
const localDate=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const localTime=d=>String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
function addDefaults(){
  const c=CFG(),l=c.games.filter(x=>!x.imported).slice(-1)[0]||c.games[c.games.length-1]||{};
  const half=l.half||(c.format==='7v7'?25:c.format==='11v11'?35:30);
  return {opp:'',ha:'',jersey:c.jersey||'',date:localDate(new Date(T())),time:'',field:'',place:'',kind:'league',tid:'',half,sub:l.sub||10};
}
function openGame(gc){
  const i=CFG().games.findIndex(x=>x.id===gc.id);if(i<0)return;
  S.cur[S.team]=i;S.pick=S.pick||{};S.pick[S.team]={id:gc.id,at:Date.now()};UI.curSet=UI.curSet||{};UI.curSet[S.team]=true;
  UI.planK=null;UI.goal=null;UI.pk=null;UI.sel=null;UI.pick=null;UI.win=undefined;useTeam();
}
function newGame(f){
  const c=CFG();const gc={id:uid('g'),title:f.title,opp:f.opp||'',dt:f.dt||'',field:f.field||'',place:f.place||'',half:+f.half||30,sub:+f.sub||10,out:[]};
  ['ha','jersey','kind','tid'].forEach(k=>{if(f[k])gc[k]=f[k];});
  if(gc.kind==='league')delete gc.kind;if(gc.kind!=='tournament')delete gc.tid;else delete gc.kind;
  if(f.jersey)c.jersey=f.jersey; // the team's usual color comes up first next time
  if(gc.dt)addGame(c,gc);else c.games.push(gc); // no date yet: last on the list
  return gc;
}
function addGameHTML(){
  if(!ADD.open||!CFG())return '';const d=ADD.d,m=ADD.mode;
  let h=`<div class="ovbg" data-act="agclose"></div><div class="ovp navp agp" role="dialog" aria-label="Add a game">
    <div class="sh"><div><b>${m==='quick'?'Quick game':m==='full'?'Schedule a game':'Add a game'}</b><div class="fine">${esc(teamShortTitle(CFG()))}</div></div><button class="btn small" data-act="agclose">Close</button></div>`;
  if(!m){
    h+=`<button class="agpick" data-act="agmode" data-m="quick"><b>⚡ Quick game</b><small>Playing now. Add the opponent if you know it; everything else can wait.</small></button>
      <button class="agpick" data-act="agmode" data-m="full"><b>📅 Schedule a game</b><small>Date and time, home or away, jersey color, field and type.</small></button>`;
  }else if(m==='quick'){
    h+=`<label class="fld">Opponent <small class="fine">(optional)</small><input data-ag="opp" value="${esc(d.opp)}" placeholder="e.g. Madison United" autocomplete="off" enterkeyhint="go"></label>
      <p class="fine">Starts today at ${esc(new Date(T()).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}))}, ${d.half}-minute halves, subs every ${d.sub} minutes. You can change any of it later on the Schedule tab.</p>
      <div class="gacts"><button class="btn primary-s" data-act="agquick">Add and open</button><button class="btn" data-act="agmode" data-m="">‹ Back</button></div>`;
  }else{
    const seg=(k,opts)=>`<div class="seg agseg">${Object.entries(opts).map(([v,l])=>`<button data-act="agset" data-k="${k}" data-v="${v}" aria-pressed="${d[k]===v}">${l}</button>`).join('')}</div>`;
    const tours=typeof tourList==='function'?tourList():[];
    h+=`<label class="fld">Opponent<input data-ag="opp" value="${esc(d.opp)}" placeholder="e.g. Madison United 2014 Girls" autocomplete="off"></label>
      <div class="fld">Home or away${seg('ha',HOME_AWAY)}</div>
      <div class="fld">Our jersey color<div class="jchips">${JERSEYS.map(([n,col])=>`<button class="jchip" data-act="agset" data-k="jersey" data-v="${n}" aria-pressed="${d.jersey===n}"><i style="background:${col}"></i>${n}</button>`).join('')}</div>
        <input data-ag="jersey" value="${esc(JERSEYS.some(j=>j[0]===d.jersey)?'':d.jersey)}" placeholder="Or type a color (e.g. Maroon / white)" aria-label="Other jersey color"></div>
      <div class="grid2"><label class="fld">Date<input type="date" data-ag="date" value="${esc(d.date)}"></label><label class="fld">Kickoff time <small class="fine">(blank = TBD)</small><input type="time" data-ag="time" value="${esc(d.time)}"></label></div>
      <label class="fld">Field<input data-ag="field" value="${esc(d.field)}" placeholder="e.g. Field 12A"></label>
      <label class="fld">Address or park name (for the map link)<input data-ag="place" value="${esc(d.place)}" placeholder="e.g. Merrimack Soccer Complex"></label>
      <div class="fld">Type${seg('kind',GAME_KINDS)}</div>
      ${d.kind==='tournament'?(tours.length?`<label class="fld">Tournament<select data-ag="tid"><option value="">Choose…</option>${tours.map(t=>`<option value="${esc(t.id)}" ${d.tid===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label>`:'<p class="fine">No tournaments yet. Add one on the Schedule tab, then pick it for this game.</p>'):''}
      <div class="grid2"><label class="fld">Half length (min)<input type="number" inputmode="numeric" min="5" max="60" data-ag="half" value="${d.half}"></label><label class="fld">Sub every (min)<input type="number" inputmode="numeric" min="2" max="30" data-ag="sub" value="${d.sub}"></label></div>
      <div class="gacts"><button class="btn primary-s" data-act="agsave">Add game</button><button class="btn" data-act="agmode" data-m="">‹ Back</button></div>`;
  }
  return h+'</div>';
}
OVERLAYS.unshift(addGameHTML);
const agStore=e=>{const el=e.target;if(!el||!el.dataset||!el.dataset.ag||!ADD.d)return;const k=el.dataset.ag;ADD.d[k]=(k==='half'||k==='sub')?(+el.value||ADD.d[k]):el.value;
  if(k==='jersey'){document.querySelectorAll('.jchip').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===el.value)));}};
document.addEventListener('input',agStore);document.addEventListener('change',agStore);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target&&e.target.dataset&&e.target.dataset.ag==='opp'&&ADD.mode==='quick'){e.preventDefault();act('agquick',{});}});

EXT.gmadd=()=>{NAV.open='';ADD.open=true;ADD.mode='';ADD.d=addDefaults();};
EXT.navaddgame=EXT.gmadd;
EXT.agclose=()=>{ADD.open=false;};
EXT.agmode=ds=>{ADD.mode=ds.m||'';};
EXT.agset=ds=>{ADD.d[ds.k]=ADD.d[ds.k]===ds.v&&ds.k!=='kind'?'':ds.v;};
EXT.agquick=()=>{const d=ADD.d,now=new Date(T());const n=CFG().games.length+1;
  const gc=newGame({title:d.opp.trim()||'Quick game',opp:d.opp.trim(),dt:localDate(now)+'T'+localTime(now),half:d.half,sub:d.sub});
  ADD.open=false;openGame(gc);S.mode='game';S.tab=usePlan()?'plan':'bench';say('Game added'+(gc.opp?': '+gc.opp:''));save();};
EXT.agsave=()=>{const d=ADD.d;const opp=d.opp.trim();
  if(!opp&&!d.date){say('Add an opponent or a date');renderHint();return false;}
  const gc=newGame({title:opp||'Game '+(CFG().games.length+1),opp,dt:d.date?(d.time?d.date+'T'+d.time:d.date):'',field:d.field.trim(),place:d.place.trim(),
    ha:d.ha,jersey:String(d.jersey||'').trim(),kind:d.kind,tid:d.tid,half:d.half,sub:d.sub});
  ADD.open=false;openGame(gc);say('Game added: '+gameLabel(gc)+', '+whenText(gc));save();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ADD.open){ADD.open=false;renderAll();}});

/* A finished game points to the next one, and opening the app after a game is over goes to the next game. */
function nextGameIdx(){const cur=curIdx();const L=CFG().games.map((gc,i)=>({gc,i,st:gStatus(gc),t:kickoffMs(gc)})).filter(x=>x.i!==cur);
  const t0=x=>Number.isFinite(x.t)?x.t:Infinity;
  const x=L.filter(x=>['live','halftime'].includes(x.st)).sort((a,b)=>t0(a)-t0(b))[0]||L.filter(x=>['today','upcoming'].includes(x.st)).sort((a,b)=>t0(a)-t0(b))[0];
  return x?x.i:-1;}
renderBanner=(base=>function(){
  base();const el=$('banner');if(!el||el.innerHTML)return;
  const g=G();if(!g||!g.fullDone)return;const ni=nextGameIdx();if(ni<0)return;const ngc=CFG().games[ni];
  el.innerHTML=`<div class="nextbar"><span><b>Final.</b> Next up: ${esc(gameLabel(ngc))}, ${esc(whenText(ngc))}</span><button class="btn small primary-s" data-act="game" data-i="${ni}">Open next game ›</button></div>`;
})(renderBanner);
VIEW_OK.add('game');
