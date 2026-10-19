"use strict";
/* Season tab: each player's totals across every game this season, minutes by position, a fair-play check,
   a player card to share with that family (positive stats only), and a spreadsheet download. */
const SEA={card:null,since:'season'};
const GRP_LABEL={GK:'Keeper',DEF:'Defense',MID:'Midfield',FWD:'Forward'};

function seasonStartMs(){const n=new Date();return new Date(n.getMonth()>=7?n.getFullYear():n.getFullYear()-1,7,1).getTime();}
/* Games with a record this season (played in the tracker, or a result entered). */
function seasonGames(){
  const from=SEA.since==='all'?0:seasonStartMs();
  return CFG().games.map(gc=>({gc,g:TS().games[gc.id]})).filter(x=>{
    if(!x.g||!x.g.started)return false;const t=new Date(x.gc.dt).getTime();return isNaN(t)||t>=from;})
    .sort((a,b)=>String(a.gc.dt).localeCompare(String(b.gc.dt)));
}
/* Minutes each player spent at each position group in one game, from its starting lineup and sub log. */
function posMinutes(g){
  const F=formOf(g.form);const grp=Object.fromEntries(F.map(p=>[p.id,p.g]));
  const L=Object.assign({},g.start||{});const out={};let t0=0;const end=Math.max(0,clock(g));
  const add=(t1)=>{const dt=Math.max(0,Math.min(t1,end)-t0);if(!dt)return;Object.entries(L).forEach(([pos,id])=>{if(!id||!grp[pos])return;const o=out[id]=out[id]||{};o[grp[pos]]=(o[grp[pos]]||0)+dt;});};
  for(const e of (g.events||[])){add(e.t);t0=Math.max(t0,Math.min(e.t,end));L[e.pos]=e.to||null;}
  add(end);return out;
}
function seasonData(){
  const games=seasonGames();const rows={};
  PLAYERS.forEach(p=>rows[p.id]={p,gp:0,starts:0,min:0,pos:{},g:0,a:0,sv:0,pos_stats:{},par:0,games:[],availG:0,outG:0,unknownG:0});
  let teamMin=0,counted=0;
  for(const {gc,g} of games){
    const tracked=!!(g.events&&(g.events.length||Object.keys(g.start||{}).length))&&!g.imported;
    const pm=tracked?posMinutes(g):{};
    if(tracked)counted++;
    const startIds=new Set(Object.values(g.start||{}).filter(Boolean));
    const coach=(g.stats||[]).filter(s=>POS_STATS.includes(s.k)&&s.k!=='save');
    const par=gc.id&&pstatsOf(gc.id)||[];
    const sc=scoreOf(g);const res=g.fullDone?(sc.us>sc.them?'W':sc.us<sc.them?'L':(g.pk?(pkScore(g).us>pkScore(g).them?'W':'L'):'D')):'';
    for(const r of Object.values(rows)){
      const id=r.p.id;const m=Object.values(pm[id]||{}).reduce((a,b)=>a+b,0);
      const gl=g.goals.filter(x=>x.side==='us'&&x.by===id).length,as=g.goals.filter(x=>x.side==='us'&&x.ast===id).length;
      if(m>0||gl||as){r.gp++;r.games.push({gc,res,score:sc.us+'–'+sc.them,min:m,g:gl,a:as});}
      if(tracked&&startIds.has(id))r.starts++;
      // Availability in tracked games: marked available, or played at all, counts; marked out (and didn't play) doesn't;
      // no record (e.g. added to the roster later) is unknown and left out of the average rather than guessed.
      if(tracked){const a=g.avail||{};if(m>0||a[id]===true)r.availG++;else if(a[id]===false)r.outG++;else r.unknownG++;}
      r.min+=m;Object.entries(pm[id]||{}).forEach(([k,v])=>r.pos[k]=(r.pos[k]||0)+v);
      r.g+=gl;r.a+=as;r.sv+=(g.saves||[]).filter(s=>s.gk===id).length;
      coach.concat(par).filter(s=>s.id===id).forEach(s=>r.pos_stats[s.k]=(r.pos_stats[s.k]||0)+1);
      r.par+=par.filter(s=>s.id===id).length;
    }
    if(tracked)teamMin+=Object.values(pm).reduce((n,o)=>n+Object.values(o).reduce((a,b)=>a+b,0),0);
  }
  const list=Object.values(rows);
  // Fair play: minutes per tracked game the player was available for (zero-minute games included), compared with
  // the team's average for field players. Keeper-only players are left out; keeper minutes of other players count.
  list.forEach(r=>{r.avg=r.availG?r.min/r.availG:0;});
  const field=list.filter(r=>!pureGK(r.p)&&r.availG>0);
  const avg=field.length?field.reduce((n,r)=>n+r.avg,0)/field.length:0;
  list.forEach(r=>{r.low=!pureGK(r.p)&&r.availG>0&&avg>0&&r.avg<avg*0.75;});
  const unknown=list.filter(r=>r.unknownG>0);
  return {games,list,counted,avg,unknown};
}
const posStatTotal=r=>Object.values(r.pos_stats).reduce((a,b)=>a+b,0);
const posMix=r=>{const tot=Object.values(r.pos).reduce((a,b)=>a+b,0)||1;
  return ['GK','DEF','MID','FWD'].filter(k=>r.pos[k]).map(k=>`<span class="pm-${k}" style="flex:${r.pos[k]/tot}" title="${GRP_LABEL[k]} ${mins(r.pos[k])} min">${Math.round(100*r.pos[k]/tot)>=18?k:''}</span>`).join('');};

function renderSeason(){
  const sd=seasonData();
  let h=`<div class="seg"><button data-act="seasince" data-v="season" aria-pressed="${SEA.since==='season'}">This season</button><button data-act="seasince" data-v="all" aria-pressed="${SEA.since==='all'}">All games</button></div>`;
  if(!sd.games.length)return h+'<div class="empty">No games yet this season. Totals build up as you track games.</div>';
  const res=sd.games.filter(x=>x.g.fullDone).map(x=>{const s=scoreOf(x.g);return s.us>s.them?'W':s.us<s.them?'L':(x.g.pk?(pkScore(x.g).us>pkScore(x.g).them?'W':'L'):'D');});
  const rec=['W','D','L'].map(k=>res.filter(x=>x===k).length).join('-');
  h+=`<p class="fine">${sd.games.length} game${sd.games.length===1?'':'s'} (${rec} W-D-L). Minutes and positions come from the ${sd.counted} game${sd.counted===1?'':'s'} tracked live; results-only games count goals.</p>`;
  const lows=sd.list.filter(r=>r.low);
  if(lows.length)h+=`<div class="notice">Fair play check: ${lows.map(r=>esc(r.p.name)).join(', ')} ${lows.length>1?'are':'is'} averaging under 75% of the team’s minutes per available game (${mins(sd.avg)} min). Worth a look in the next rotation.</div>`;
  if(sd.unknown.length)h+=`<p class="fine">Availability wasn’t recorded for ${sd.unknown.map(r=>esc(r.p.name)+' ('+r.unknownG+' game'+(r.unknownG===1?'':'s')+')').join(', ')}, so those games aren’t counted in their average.</p>`;
  h+=`<div class="rwrap"><table class="rtable season"><thead><tr><th>Player</th><th>GP</th><th title="Tracked games available">Avail</th><th>Starts</th><th>Min</th><th title="Minutes per available tracked game">Avg</th><th>Positions</th><th>G</th><th>A</th><th>Great plays</th></tr></thead><tbody>`;
  sd.list.slice().sort((a,b)=>b.min-a.min||a.p.name.localeCompare(b.p.name)).forEach(r=>{
    h+=`<tr class="${r.low?'low':''}"><td class="pn"><button class="lnk" data-act="seacard" data-id="${r.p.id}">${esc(r.p.name)}</button>${jn(r.p)}</td><td>${r.gp}</td><td>${r.availG}${r.unknownG?`<span class="fine" title="Availability not recorded for ${r.unknownG} game${r.unknownG===1?'':'s'}">+?</span>`:''}</td><td>${r.starts}</td><td>${mins(r.min)}</td><td>${r.availG?mins(r.avg):'·'}</td>
      <td><div class="pmix">${posMix(r)}</div></td><td class="${r.g?'':'z'}">${r.g||'·'}</td><td class="${r.a?'':'z'}">${r.a||'·'}</td><td class="${posStatTotal(r)?'':'z'}">${posStatTotal(r)||'·'}</td></tr>`;});
  h+=`</tbody></table></div><div class="pmlegend">${['GK','DEF','MID','FWD'].map(k=>`<span><i class="pm-${k}"></i>${GRP_LABEL[k]}</span>`).join('')}</div>`;
  h+=`<div class="gacts"><button class="btn small" data-act="seacsv">Download season (spreadsheet)</button></div>`;
  h+=`<p class="fine">Avg is minutes per tracked game the player was available for, including games where they didn’t play. Tap a name for that player’s card: season totals and positive stats only, ready to share with their family.</p>`;
  return h;
}

function seasonCardHTML(){
  if(!SEA.card||!CFG())return '';
  const sd=seasonData();const r=sd.list.find(x=>x.p.id===SEA.card);if(!r)return '';
  const top=Object.entries(r.pos_stats).sort((a,b)=>b[1]-a[1]).slice(0,6);
  return `<div class="ovbg" data-act="seacardclose"></div><div class="ovp pcardov" role="dialog" aria-label="${esc(r.p.name)}">
    <div class="sh"><div><b>${esc(r.p.name)}</b>${jn(r.p)}<div class="fine">${esc(CFG().name)} · ${SEA.since==='all'?'All games':'This season'}</div></div><button class="btn small" data-act="seacardclose">Close</button></div>
    <div class="tstats"><div><b>${r.gp}</b><span>Games</span></div><div><b>${mins(r.min)}</b><span>Minutes</span></div><div><b>${r.g}</b><span>Goals</span></div><div><b>${r.a}</b><span>Assists</span></div>${r.sv?`<div><b>${r.sv}</b><span>Saves</span></div>`:''}</div>
    ${Object.keys(r.pos).length?`<h4>Where ${esc(r.p.name)} played</h4><div class="pmix big">${posMix(r)}</div><div class="pmlegend">${['GK','DEF','MID','FWD'].filter(k=>r.pos[k]).map(k=>`<span><i class="pm-${k}"></i>${GRP_LABEL[k]} ${mins(r.pos[k])} min</span>`).join('')}</div>`:''}
    ${top.length?`<h4>Great plays</h4><div class="chips">${top.map(([k,n])=>`<span>${esc(STATS[k]||k)} <b>${n}</b></span>`).join('')}</div>`:''}
    ${r.games.length?`<h4>Games</h4><ul class="log">${r.games.slice(-8).reverse().map(x=>`<li><div class="lt">${x.res?`<span class="res r${x.res}">${x.res}</span>`:''}</div><div class="ll"><div>${esc(x.gc.opp||x.gc.title)} <span class="fine">${esc(x.score)}${x.min?' · '+mins(x.min)+' min':''}${x.g?' · '+x.g+' G':''}${x.a?' · '+x.a+' A':''}</span></div></div></li>`).join('')}</ul>`:''}
    <div class="gacts"><button class="btn small primary-s" data-act="seashare">Copy for the family</button><button class="btn small" data-act="seaprint">Print</button></div></div>`;
}
OVERLAYS.push(seasonCardHTML);

function cardText(id){
  const sd=seasonData();const r=sd.list.find(x=>x.p.id===id);if(!r)return '';
  const top=Object.entries(r.pos_stats).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,n])=>`${STATS[k]||k}: ${n}`);
  const pos=['GK','DEF','MID','FWD'].filter(k=>r.pos[k]).map(k=>`${GRP_LABEL[k]} ${mins(r.pos[k])} min`);
  return `${r.p.name}, ${CFG().name}\n${r.gp} games, ${mins(r.min)} minutes, ${r.g} goals, ${r.a} assists${r.sv?', '+r.sv+' saves':''}\n`
    +(pos.length?`Positions: ${pos.join(', ')}\n`:'')+(top.length?`Great plays: ${top.join(', ')}\n`:'');
}
const csvCell=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
function seasonCSV(){
  const sd=seasonData();const keys=POS_STATS.filter(k=>sd.list.some(r=>r.pos_stats[k]));
  const head=['Player','Number','Games','Tracked games available','Availability not recorded','Starts','Minutes','Avg minutes per available game','Keeper min','Defense min','Midfield min','Forward min','Goals','Assists','Saves',...keys.map(k=>STATS[k])];
  const rows=sd.list.map(r=>[r.p.name,r.p.num||'',r.gp,r.availG,r.unknownG,r.starts,mins(r.min),r.availG?mins(r.avg):'',mins(r.pos.GK||0),mins(r.pos.DEF||0),mins(r.pos.MID||0),mins(r.pos.FWD||0),r.g,r.a,r.sv,...keys.map(k=>r.pos_stats[k]||0)]);
  const per=[[],['Minutes by game'],['Player',...sd.games.map(x=>(x.gc.dt||'').slice(0,10)+' '+(x.gc.opp||x.gc.title))]].concat(
    sd.list.map(r=>[r.p.name,...sd.games.map(x=>{const m=r.games.find(y=>y.gc.id===x.gc.id);return m?mins(m.min):'';})]));
  return [head,...rows,...per].map(r=>r.map(csvCell).join(',')).join('\r\n');
}

EXT.seasince=ds=>{SEA.since=ds.v;};
EXT.seacard=ds=>{SEA.card=ds.id;};
EXT.seacardclose=()=>{SEA.card=null;};
EXT.seashare=()=>{const t=cardText(SEA.card);try{navigator.clipboard.writeText(t).then(()=>{say('Copied. Paste it into a text or email.');renderHint();},()=>{say('Couldn’t copy on this device');renderHint();});}catch(e){say('Couldn’t copy on this device');}};
EXT.seaprint=()=>{document.body.classList.add('printcard');setTimeout(()=>{window.print();document.body.classList.remove('printcard');},50);return false;};
EXT.seacsv=()=>{downloadFile(slug(CFG().short||CFG().name)+'-season.csv',seasonCSV(),'text/csv');return false;};
