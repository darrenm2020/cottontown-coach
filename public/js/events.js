"use strict";
/* Tournaments: shared event records (name, dates, venue, official schedule link) that games point to with `tid`.
   Teams can attend different events through the season; league games and friendlies simply have no tournament.
   In Team › Schedule a head coach picks or adds a tournament and assigns several games at once. Games inside a
   tournament's dates are only suggested: nothing is assigned until the coach confirms. */
const TOURS={list:null,sel:'',form:null,checked:null,busy:false};
const tourList=()=>(typeof CLUB!=='undefined'&&CLUB.data&&Array.isArray(CLUB.data.tournaments)?CLUB.data.tournaments:TOURS.list)||[];
function tourOf(g){const id=g&&g.tid;return id?tourList().find(t=>t.id===id)||null:null;}
function tourDates(t){
  if(!t||!t.start)return '';
  const a=new Date(t.start+'T12:00'),b=new Date((t.end||t.start)+'T12:00');
  const m=d=>d.toLocaleDateString('en-US',{month:'short'});
  if(t.end&&t.end!==t.start)return m(a)===m(b)?`${m(a)} ${a.getDate()}–${b.getDate()}`:`${m(a)} ${a.getDate()}–${m(b)} ${b.getDate()}`;
  return `${m(a)} ${a.getDate()}`;
}
function tourHeadHTML(t){
  const bits=[tourDates(t),t.venue].filter(Boolean).map(esc).join(' · ');
  return `<div class="evhead"><span class="evname"><span aria-hidden="true">🏆</span> ${esc(t.name)}</span>${bits||t.link?`<span class="fine">${bits}${t.link?`${bits?' · ':''}<a href="${esc(t.link)}" target="_blank" rel="noopener">Official schedule</a>`:''}</span>`:''}</div>`;
}
/* Tournaments a team has signed up for whose games aren't posted yet (still upcoming). */
function pendingEntries(team,now){
  const today=new Date(now);const ymd=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  return (team&&team.entries||[]).map(e=>({e,t:tourList().find(x=>x.id===e.tid)})).filter(({e,t})=>t&&(t.end||t.start||'9999')>=ymd&&!(team.games||[]).some(g=>g.tid===e.tid))
    .sort((a,b)=>String(a.t.start).localeCompare(String(b.t.start)));
}
const entryStatus=e=>e.status==='applied'?'Applied, waiting for acceptance':'Signed up';
function entryHTML({e,t}){return tourHeadHTML(t)+`<p class="fine evnote">${esc(entryStatus(e))} · schedule not posted yet</p>`;}
/* A game falls within a tournament's dates (used for suggestions only). */
function inTourDates(gc,t){if(!t||!t.start)return false;const k=kickoffMs(gc);if(!Number.isFinite(k))return false;
  const from=new Date(t.start+'T00:00').getTime(),to=new Date((t.end||t.start)+'T23:59').getTime();return k>=from&&k<=to;}

/* Per game in Team › Schedule: its tournament and whether it's postponed. */
function gameExtrasHTML(gc){
  const list=tourList(),known=!gc.tid||list.some(t=>t.id===gc.tid);
  return `<div class="grid2"><label class="fld">Tournament<select data-cfg="gm" data-f="tid" data-gid="${gc.id}"><option value="">None (league or friendly)</option>${list.map(t=>`<option value="${esc(t.id)}" ${gc.tid===t.id?'selected':''}>${esc(t.name)}${t.start?' · '+tourDates(t):''}</option>`).join('')}${known?'':`<option value="${esc(gc.tid)}" selected>Removed tournament</option>`}</select></label>
    <div class="fld">Status<button class="tog ${gc.status==='postponed'?'on':''}" data-act="gmpost" data-gid="${gc.id}" aria-pressed="${gc.status==='postponed'}">${gc.status==='postponed'?'Postponed':'Scheduled'}</button></div></div>`;
}
EXT.gmpost=ds=>{const gc=CFG().games.find(x=>x.id===ds.gid);if(!gc)return false;if(gc.status==='postponed')delete gc.status;else gc.status='postponed';say(gc.status?'Marked postponed':'Back on the schedule');save();};

/* Team › Schedule: pick or add a tournament, then tick the games that belong to it. */
function tournamentsCardHTML(){
  const list=tourList(),c=CFG(),t=list.find(x=>x.id===TOURS.sel)||null;
  let h=`<div class="card"><h3>Tournaments</h3>`;
  h+=`<label class="fld">Tournament<select id="tour-sel"><option value="">Choose a tournament…</option>${list.map(x=>`<option value="${esc(x.id)}" ${x.id===TOURS.sel?'selected':''}>${esc(x.name)}${x.start?' · '+tourDates(x):''}</option>`).join('')}<option value="+new" ${TOURS.sel==='+new'?'selected':''}>+ Add a new tournament</option></select></label>`;
  if(TOURS.sel==='+new'){
    const f=TOURS.form||(TOURS.form={name:(c.placing&&c.placing.event)||'',start:'',end:'',venue:'',link:''});
    h+=`<div class="tourform"><label class="fld">Name<input data-tf="name" value="${esc(f.name)}" placeholder="e.g. KICKS Invitational" autocomplete="off"></label>
      <div class="grid2"><label class="fld">Starts<input type="date" data-tf="start" value="${esc(f.start)}"></label><label class="fld">Ends<input type="date" data-tf="end" value="${esc(f.end)}"></label></div>
      <label class="fld">Venue<input data-tf="venue" value="${esc(f.venue)}" placeholder="e.g. John Hunt Park, Huntsville"></label>
      <label class="fld">Official schedule link (optional)<input type="url" data-tf="link" value="${esc(f.link)}" placeholder="https://"></label>
      <div class="gacts"><button class="btn primary-s" data-act="toursave" ${TOURS.busy?'disabled':''}>${TOURS.busy?'Saving…':'Save tournament'}</button><button class="btn small" data-act="tourcancel">Cancel</button></div>
      <p class="fine">If this tournament is already listed (even spelled a little differently), it’s reused rather than added twice.</p></div>`;
  }else if(t){
    const all=c.games.slice().sort((a,b)=>(kickoffMs(a)||0)-(kickoffMs(b)||0));
    if(!TOURS.checked)TOURS.checked=new Set(all.filter(g=>g.tid===t.id).map(g=>g.id));
    // Games near the tournament (two weeks either side) and any already ticked; the rest behind "Show all games".
    const near=g=>{if(!t.start)return true;const k=kickoffMs(g);if(!Number.isFinite(k))return false;
      return k>=new Date(t.start+'T00:00').getTime()-14*864e5&&k<=new Date((t.end||t.start)+'T23:59').getTime()+14*864e5;};
    const games=TOURS.all?all:all.filter(g=>near(g)||TOURS.checked.has(g.id));
    const games2=games;
    const sugg=all.filter(g=>!g.tid&&inTourDates(g,t)&&!TOURS.checked.has(g.id));
    h+=tourHeadHTML(t);
    const en=(c.entries||[]).find(x=>x.tid===t.id);
    h+=`<div class="set"><span>Signed up for this tournament<small class="fine" style="display:block">Shows on the team card and schedule before games are posted.</small></span><select data-entry="${esc(t.id)}" aria-label="Signed up for ${esc(t.name)}"><option value="" ${en?'':'selected'}>No</option><option value="applied" ${en&&en.status==='applied'?'selected':''}>Applied</option><option value="entered" ${en&&en.status!=='applied'?'selected':''}>Accepted / entered</option></select></div>`;
    h+=`<p class="fine">Tick the games played at this tournament.${sugg.length?` ${sugg.length} game${sugg.length===1?' falls':'s fall'} within its dates.`:''}</p>`;
    if(sugg.length)h+=`<button class="btn small" data-act="tourmatch">Select the ${sugg.length} game${sugg.length===1?'':'s'} in these dates</button>`;
    h+='<div class="tourgames">'+games.map(g=>{const other=g.tid&&g.tid!==t.id?tourList().find(x=>x.id===g.tid):null;
      return `<label class="tgrow"><input type="checkbox" data-tchk="${g.id}" ${TOURS.checked.has(g.id)?'checked':''}><span><b>${esc(g.opp||g.title||'Game')}</b><span class="fine">${esc(whenText(g))}${other?' · now in '+esc(other.name):''}${!g.tid&&inTourDates(g,t)?' · <i>in these dates</i>':''}</span></span></label>`;}).join('')+(games2.length?'':'<p class="fine">No games near these dates.</p>')+'</div>'
      +(all.length>games.length?`<button class="btn small" data-act="tourall">Show all ${all.length} games</button>`:'');
    h+=`<div class="gacts"><button class="btn primary-s" data-act="tourassign">Save games for this tournament</button></div>`;
  }else h+=`<p class="fine">Group games by tournament so parents see which event each game belongs to. League games and friendlies don’t need one.</p>`;
  return h+'</div>';
}
document.addEventListener('change',e=>{const el=e.target;if(!el)return;
  if(el.id==='tour-sel'){TOURS.sel=el.value;TOURS.checked=null;TOURS.all=false;if(el.value!=='+new')TOURS.form=null;renderAll();}
  else if(el.dataset&&el.dataset.tchk){if(!TOURS.checked)TOURS.checked=new Set();if(el.checked)TOURS.checked.add(el.dataset.tchk);else TOURS.checked.delete(el.dataset.tchk);}});
document.addEventListener('change',e=>{const id=e.target&&e.target.dataset&&e.target.dataset.entry;if(!id||!CFG()||!canEdit())return;
  const c=CFG();c.entries=(c.entries||[]).filter(x=>x.tid!==id);if(e.target.value)c.entries.push({tid:id,status:e.target.value});
  say(e.target.value?'Saved: signed up':'Removed from this tournament');save();renderAll();});
document.addEventListener('input',e=>{const k=e.target&&e.target.dataset&&e.target.dataset.tf;if(!k)return;TOURS.form=TOURS.form||{};TOURS.form[k]=e.target.value;});
EXT.tourcancel=()=>{TOURS.sel='';TOURS.form=null;};
EXT.tourall=()=>{TOURS.all=true;};
EXT.tourmatch=()=>{const t=tourList().find(x=>x.id===TOURS.sel);if(!t)return false;TOURS.checked=TOURS.checked||new Set();CFG().games.forEach(g=>{if(!g.tid&&inTourDates(g,t))TOURS.checked.add(g.id);});};
EXT.tourassign=()=>{
  const t=tourList().find(x=>x.id===TOURS.sel);if(!t||!TOURS.checked)return false;let n=0;
  CFG().games.forEach(g=>{const want=TOURS.checked.has(g.id);if(want&&g.tid!==t.id){g.tid=t.id;n++;}else if(!want&&g.tid===t.id){delete g.tid;n++;}});
  say(n?`Saved: ${TOURS.checked.size} game${TOURS.checked.size===1?'':'s'} at ${t.name}`:'No changes');if(n)save();
};
EXT.toursave=()=>{
  const f=TOURS.form||{};if(!String(f.name||'').trim()){say('Give the tournament a name');return;}
  if(!SY.on){say('Tournaments are shared, so they need the live site');return;}
  TOURS.busy=true;
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({kind:'tournament',team:S.team,tournament:{name:f.name,start:f.start,end:f.end,venue:f.venue,link:f.link}},creds()))})
    .then(r=>r.json().then(j=>({r,j}))).then(({r,j})=>{TOURS.busy=false;
      if(!r.ok){say(j.error||'Couldn’t save the tournament. Try again.');renderAll();return;}
      TOURS.list=j.tournaments||TOURS.list;TOURS.sel=j.id;TOURS.form=null;TOURS.checked=null;
      say(j.existing?'That tournament is already listed, so it’s been selected':'Tournament saved. Now tick its games.');renderAll();})
    .catch(()=>{TOURS.busy=false;say('Couldn’t reach the server. Your entries are kept; try again.');renderAll();});
};
