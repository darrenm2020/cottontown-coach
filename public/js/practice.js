"use strict";
/* Practice plans: build a session from drill-library blocks, take attendance, then run it with a block timer.
   Saved on the server for the team's coaches (or on this device when the app runs without the server). */
const PR={team:null,list:null,err:'',view:'plans',edit:null,run:null,tick:null};

async function loadPractices(){
  const team=S.team;PR.team=team;PR.list=null;PR.err='';
  if(!SY.on){PR.list=((S.prac||{})[team]||[]).slice();renderAll();return;}
  try{const r=await apiGet('practices='+encodeURIComponent(team));if(PR.team!==team)return;
    PR.list=r.ok?(r.j.practices||[]):[];PR.err=r.ok?'':(r.j.error||'Couldn’t load practices');}
  catch(e){PR.list=[];PR.err='Couldn’t reach the server';}
  renderAll();
}
const pTotal=p=>(p.blocks||[]).reduce((n,b)=>n+(+b.min||0),0);
const pWhen=p=>{const d=new Date(p.date);return isNaN(d)?'No date yet':d.toLocaleString('en-US',{weekday:'short',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});};
const hereCount=p=>Object.values(p.attendance||{}).filter(Boolean).length;
function nextPracticeDate(){const d=new Date();d.setDate(d.getDate()+1);d.setHours(17,30,0,0);const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T17:30`;}

function renderPractice(){
  if(PR.team!==S.team){PR.edit=null;PR.view='plans';loadPractices();}
  let h=`<div class="seg prseg"><button data-act="prview" data-v="plans" aria-pressed="${PR.view==='plans'}">${PR.edit?'This practice':'Practice plans'}</button><button data-act="prview" data-v="drills" aria-pressed="${PR.view==='drills'}">Drill library</button></div>`;
  if(PR.view==='drills')return h+renderDrillLib(!!PR.edit);
  if(PR.edit)return h+practiceEditHTML();
  if(PR.err)h+=`<div class="notice">${esc(PR.err)}</div>`;
  h+=`<button class="btn small primary-s" data-act="prnew">+ New practice</button>`;
  if(!PR.list)return h+'<p class="fine">Loading practices…</p>';
  const now=Date.now(),ts=p=>{const v=new Date(p.date).getTime();return isNaN(v)?Infinity:v;};
  const up=PR.list.filter(p=>ts(p)>=now-6*3600000).sort((a,b)=>ts(a)-ts(b)),past=PR.list.filter(p=>ts(p)<now-6*3600000).sort((a,b)=>ts(b)-ts(a));
  const card=p=>`<div class="pcard"><div><b>${esc(p.title||'Practice')}</b><div class="fine">${esc(pWhen(p))}${p.place?', '+esc(p.place):''}</div>
      <div class="fine">${(p.blocks||[]).length} block${(p.blocks||[]).length===1?'':'s'}, ${pTotal(p)} min${p.focus?' · Focus: '+esc(p.focus):''}${hereCount(p)?' · '+hereCount(p)+' here':''}</div></div>
    <div class="gacts"><button class="btn small" data-act="propen" data-id="${esc(p.id)}">Open</button><button class="btn small" data-act="prrun" data-id="${esc(p.id)}" ${(p.blocks||[]).length?'':'disabled'}>Run it</button><button class="btn small" data-act="prcopy" data-id="${esc(p.id)}">Copy</button></div></div>`;
  h+=`<h3>Coming up</h3>`+(up.length?up.map(card).join(''):'<p class="fine">No practices planned. Tap New practice to build one from the drill library.</p>');
  if(past.length)h+=`<details class="past"><summary>Past practices (${past.length})</summary>${past.map(card).join('')}</details>`;
  if(typeof voiceBar==='function')h+=voiceBar('practice');
  return h;
}

function practiceEditHTML(){
  const p=PR.edit;const b=p.blocks||[];
  let h=`<div class="gacts"><button class="btn small" data-act="prcancel">‹ All practices</button></div><div class="card"><div class="grid2"><label class="fld">Title<input id="pe-title" value="${esc(p.title||'')}" placeholder="e.g. Building out of the back"></label>
      <label class="fld">Date and time<input id="pe-date" type="datetime-local" value="${esc(p.date||'')}"></label></div>
    <div class="grid2"><label class="fld">Focus<input id="pe-focus" value="${esc(p.focus||'')}" placeholder="What we're working on"></label><label class="fld">Where<input id="pe-place" value="${esc(p.place||'')}"></label></div></div>`;
  h+=`<h3>Plan <span class="fine">${pTotal(p)} min total</span></h3>`;
  if(!b.length)h+='<p class="fine">Add blocks from the drill library, or a blank block for anything else (water break, scrimmage).</p>';
  h+=b.map((x,i)=>{const d=x.drill&&drillById(x.drill);return `<div class="pblock">
    <div class="pbh"><span class="pbn">${i+1}</span><input data-pb="title" data-i="${i}" value="${esc(x.title||'')}" aria-label="Block name">
      <input class="pbmin" data-pb="min" data-i="${i}" type="number" inputmode="numeric" min="0" max="120" value="${esc(x.min||0)}" aria-label="Minutes"><span class="fine">min</span></div>
    ${d?`<div class="pbd">${drillSVG(d,'dthumb')}<div><span class="fine">${esc(d.summary||'')}</span> <button class="btn small" data-act="dropenx" data-id="${esc(d.id)}">View drill</button></div></div>`:''}
    <textarea data-pb="notes" data-i="${i}" rows="1" placeholder="Notes (groups, coaching focus)">${esc(x.notes||'')}</textarea>
    <div class="gacts"><button class="btn small" data-act="pbmove" data-i="${i}" data-d="-1" ${i?'':'disabled'} aria-label="Move up">↑</button><button class="btn small" data-act="pbmove" data-i="${i}" data-d="1" ${i<b.length-1?'':'disabled'} aria-label="Move down">↓</button><button class="btn small" data-act="pbdel" data-i="${i}">Remove</button></div></div>`;}).join('');
  h+=`<div class="gacts"><button class="btn small primary-s" data-act="prpick">+ From the drill library</button><button class="btn small" data-act="pbblank">+ Blank block</button></div>`;
  h+=`<h3>Who's here</h3><p class="fine" style="margin-top:-4px">Tap players who came. Season reports count attendance.</p><div class="attgrid">${PLAYERS.map(pl=>{const on=!!(p.attendance||{})[pl.id];return `<button class="${on?'on':''}" data-act="patt" data-id="${pl.id}" aria-pressed="${on}">${esc(pl.name)}</button>`;}).join('')}</div>`;
  h+=`<label class="fld">Notes after practice<textarea id="pe-notes" rows="3">${esc(p.notes||'')}</textarea></label>`;
  if(typeof voiceBar==='function')h+=voiceBar('practice');
  h+=`<div class="gacts stick"><button class="btn primary-s" data-act="prsave">Save practice</button><button class="btn" data-act="prrunedit" ${b.length?'':'disabled'}>Run it</button><button class="btn" data-act="prcancel">Close</button>
    ${p.saved?`<button class="btn ${armed('prdel')?'danger-s armed':''}" data-act="prdel">${armed('prdel')?'Tap again to delete':'Delete'}</button>`:''}</div>`;
  return h;
}
/* Keep what's been typed before any re-render. */
function syncPracticeForm(){
  const p=PR.edit;if(!p||PR.view!=='plans')return;
  const v=id=>{const el=$(id);return el?el.value:null;};
  [['title','pe-title'],['date','pe-date'],['focus','pe-focus'],['place','pe-place'],['notes','pe-notes']].forEach(([k,id])=>{const x=v(id);if(x!==null)p[k]=x.trim();});
  document.querySelectorAll('[data-pb]').forEach(el=>{const b=p.blocks[+el.dataset.i];if(!b)return;const f=el.dataset.pb;b[f]=f==='min'?Math.max(0,Math.min(120,parseInt(el.value,10)||0)):el.value;});
}
function addDrillBlock(id){
  const d=drillById(id);if(!d||!PR.edit)return;
  PR.edit.blocks=PR.edit.blocks||[];PR.edit.blocks.push({id:uid('b'),drill:d.id,title:d.title,min:d.minutes||10,notes:''});
  PR.view='plans';DR.open=null;say(d.title+' added');
}
async function savePractice(p){
  p.saved=true;p.updatedAt=Date.now();
  if(!SY.on){S.prac=S.prac||{};const L=(S.prac[S.team]=S.prac[S.team]||[]);const i=L.findIndex(x=>x.id===p.id);if(i>=0)L[i]=p;else L.push(p);saveLocal();PR.list=L.slice();return true;}
  const r=await apiPost(Object.assign({kind:'practice',team:S.team,practice:p},creds()));
  if(!r.ok){say(r.j.error||'Couldn’t save the practice');return false;}
  const L=PR.list||[];const i=L.findIndex(x=>x.id===p.id);const copy=JSON.parse(JSON.stringify(p));if(i>=0)L[i]=copy;else L.push(copy);PR.list=L;return true;
}

/* ---------- practice mode ---------- */
function runState(){const r=PR.run;if(!r)return null;const p=r.p;const b=p.blocks[r.i];const el=r.elapsed+(r.paused?0:Date.now()-r.t0);return {p,b,el,left:(+b.min||0)*60000-el};}
function practiceRunHTML(){
  const s=runState();if(!s)return '';const {p,b,left}=s;const d=b.drill&&drillById(b.drill);const nx=p.blocks[PR.run.i+1];
  const li=a=>(a||[]).slice(0,5).map(x=>`<li>${esc(x)}</li>`).join('');
  return `<div class="ovbg dark"></div><div class="ovp run" role="dialog" aria-label="Practice">
    <div class="sh"><div><span class="fine">${esc(p.title||'Practice')} · Block ${PR.run.i+1} of ${p.blocks.length}</span><b>${esc(b.title||'Block')}</b></div><button class="btn small" data-act="prstop">End practice</button></div>
    <div class="runclock ${left<0?'over':''}" id="runclock">${left<0?'+':''}${fmt(Math.abs(left))}</div>
    <div class="gacts runbtns"><button class="btn" data-act="prprev" ${PR.run.i?'':'disabled'}>‹ Back</button><button class="btn primary" data-act="prpause">${PR.run.paused?'Resume':'Pause'}</button><button class="btn" data-act="prnext">${nx?'Next ›':'Finish'}</button></div>
    ${nx?`<p class="fine">Up next: <b>${esc(nx.title)}</b> (${nx.min} min)</p>`:'<p class="fine">Last block.</p>'}
    ${b.notes?`<p class="runnote">${esc(b.notes)}</p>`:''}
    ${d?drillSVG(d,'dbig')+(d.coaching&&d.coaching.length?`<h4>Coaching points</h4><ul>${li(d.coaching)}</ul>`:'')+(d.how&&d.how.length?`<h4>How it works</h4><ol>${li(d.how)}</ol>`:''):''}</div>`;
}
function runTick(){
  const s=runState();if(!s){clearInterval(PR.tick);PR.tick=null;return;}
  const el=$('runclock');if(el){el.textContent=(s.left<0?'+':'')+fmt(Math.abs(s.left));el.classList.toggle('over',s.left<0);}
  if(s.left<=0&&!PR.run.alerted){PR.run.alerted=true;try{unlockAudio();const was=S.beep;S.beep=true;lastAlarm=0;alarm();S.beep=was;}catch(e){}}
}
function startRun(p){
  if(!p||!(p.blocks||[]).length)return;
  PR.run={p:JSON.parse(JSON.stringify(p)),i:0,t0:Date.now(),elapsed:0,paused:false,alerted:false};
  clearInterval(PR.tick);PR.tick=setInterval(runTick,250);wake();
}
function runGo(i){const r=PR.run;r.i=Math.max(0,Math.min(r.p.blocks.length-1,i));r.elapsed=0;r.t0=Date.now();r.alerted=false;}

/* ---------- actions ---------- */
// Typing goes straight into the plan, so a background sync redrawing the screen never loses it.
document.addEventListener('input',e=>{const t=e.target;if(t&&(t.dataset&&t.dataset.pb||/^pe-/.test(t.id||'')))syncPracticeForm();});
EXT.prview=ds=>{syncPracticeForm();PR.view=ds.v;};
EXT.prnew=()=>{PR.edit={id:uid('p'),title:'',date:nextPracticeDate(),focus:'',place:'',blocks:[],attendance:{},notes:''};PR.view='plans';};
EXT.propen=ds=>{const p=(PR.list||[]).find(x=>x.id===ds.id);if(p){PR.edit=JSON.parse(JSON.stringify(p));PR.edit.saved=true;PR.view='plans';}};
EXT.prcopy=ds=>{const p=(PR.list||[]).find(x=>x.id===ds.id);if(!p)return;PR.edit=Object.assign(JSON.parse(JSON.stringify(p)),{id:uid('p'),date:nextPracticeDate(),attendance:{},notes:'',saved:false});PR.edit.blocks.forEach(b=>b.id=uid('b'));PR.view='plans';say('Copied. Change the date and save.');};
EXT.prcancel=()=>{PR.edit=null;};
EXT.prpick=()=>{syncPracticeForm();PR.view='drills';};
EXT.prback=()=>{PR.view='plans';};
EXT.pbblank=()=>{syncPracticeForm();PR.edit.blocks.push({id:uid('b'),drill:'',title:'',min:10,notes:''});};
EXT.pbdel=ds=>{syncPracticeForm();PR.edit.blocks.splice(+ds.i,1);};
EXT.pbmove=ds=>{syncPracticeForm();const B=PR.edit.blocks,i=+ds.i,j=i+(+ds.d);if(j<0||j>=B.length)return;[B[i],B[j]]=[B[j],B[i]];};
EXT.patt=ds=>{syncPracticeForm();const a=PR.edit.attendance=PR.edit.attendance||{};a[ds.id]=!a[ds.id];};
EXT.dropenx=ds=>{syncPracticeForm();DR.open=ds.id;};
EXT.prsave=()=>{syncPracticeForm();const p=PR.edit;(async()=>{if(await savePractice(p)){p.saved=true;if(typeof VOX!=='undefined')VOX.saved=true;say('Practice saved');}renderAll();})();};
EXT.prdel=()=>{
  if(!armed('prdel')){arm('prdel');return;}
  UI.arm=null;const id=PR.edit.id;
  (async()=>{let ok=true;if(SY.on){const r=await apiPost(Object.assign({kind:'practice-del',team:S.team,id},creds()));ok=r.ok;}
    else{S.prac[S.team]=(S.prac[S.team]||[]).filter(x=>x.id!==id);saveLocal();}
    if(ok){PR.list=(PR.list||[]).filter(x=>x.id!==id);PR.edit=null;say('Practice deleted');}else say('Couldn’t delete');renderAll();})();
};
EXT.prrun=ds=>{startRun((PR.list||[]).find(x=>x.id===ds.id));};
EXT.prrunedit=()=>{syncPracticeForm();startRun(PR.edit);};
EXT.prpause=()=>{const r=PR.run;if(!r)return;if(r.paused){r.t0=Date.now();r.paused=false;}else{r.elapsed+=Date.now()-r.t0;r.paused=true;}};
EXT.prnext=()=>{const r=PR.run;if(!r)return;if(r.i>=r.p.blocks.length-1){PR.run=null;say('Practice done');return;}runGo(r.i+1);};
EXT.prprev=()=>{if(PR.run)runGo(PR.run.i-1);};
EXT.prstop=()=>{PR.run=null;clearInterval(PR.tick);PR.tick=null;};
