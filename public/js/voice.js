"use strict";
/* Talk to change a plan: tap the mic (or type), say the change, see what will change, then Apply.
   Works on the Plan tab (game rotation) and the Practice tab (practice plans). Claude does the editing
   on the server (/api/voice); nothing changes until the coach taps Apply, and Undo puts it back. */
const VOX={kind:null,state:'idle',text:'',res:null,undo:null,rec:null};
const SpeechRec=window.SpeechRecognition||window.webkitSpeechRecognition;
// The app holds off redrawing while someone types; let go of the voice box first so the answer shows.
function vRender(){const a=document.activeElement;if(a&&a.id==='vtext')a.blur();renderAll();}

function voiceBar(kind){
  const v=VOX;const mine=v.kind===kind;let h=`<div class="vbar">`;
  if(mine&&v.state==='preview'&&v.res){const r=v.res;
    h+=`<div class="vprev"><div class="vq">“${esc(v.text)}”</div>`;
    if(!r.possible)h+=`<p>${esc(r.message||'I couldn’t make that change.')}</p><div class="gacts"><button class="btn small" data-act="vcancel">OK</button></div>`;
    else{h+=`${r.message?`<p>${esc(r.message)}</p>`:''}${r.changes&&r.changes.length?`<ul class="vchg">${r.changes.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`:''}`;
      if(kind==='game'){const g=G();const diffs=[];r.plan.blocks.forEach((b,i)=>{const lines=describe(PL()[i]||{},b);if(lines.length)diffs.push(`<li><b>${esc(blockRange(g,i))}</b>: ${lines.map(l=>esc((l.p?l.p+' ':'')+l.t)).join('; ')}</li>`);});
        const outNow=PLAYERS.filter(p=>!av(g,p.id)).map(p=>p.id),outNew=r.plan.out;
        const nowOut=outNew.filter(id=>!outNow.includes(id)).map(nm),back=outNow.filter(id=>!outNew.includes(id)).map(nm);
        h+=`${nowOut.length?`<p class="fine">Marked out: ${esc(nowOut.join(', '))}</p>`:''}${back.length?`<p class="fine">Back in: ${esc(back.join(', '))}</p>`:''}
          ${diffs.length?`<details><summary class="fine">Every change, block by block (${diffs.length})</summary><ul class="vdiff">${diffs.join('')}</ul></details>`:'<p class="fine">The plan stays the same.</p>'}`;}
      else{const tot=r.plan.blocks.reduce((t,b)=>t+b.min,0);
        h+=`<ol class="vdiff">${r.plan.blocks.map(b=>`<li>${esc(b.title)} <span class="fine">${b.min} min</span></li>`).join('')}</ol><p class="fine">${tot} minutes total</p>`;}
      if(r.plan.warnings&&r.plan.warnings.length)h+=`<p class="fine warnt">${r.plan.warnings.map(esc).join('<br>')}</p>`;
      h+=`<div class="gacts"><button class="btn primary-s" data-act="vapply">Apply</button><button class="btn" data-act="vcancel">Cancel</button></div>`;}
    h+=`</div>`;}
  else if(mine&&v.state==='thinking')h+=`<div class="vprev"><span class="vdots"><i></i><i></i><i></i></span> Working on “${esc(v.text)}”…</div>`;
  if(mine&&v.undo&&v.state!=='preview')h+=`<div class="vundo"><span class="fine">${kind==='practice'&&PR.edit&&!v.saved?'Changed. Tap Save practice to keep it.':'Plan changed.'}</span><button class="linkb" data-act="vundo">Undo</button></div>`;
  const listening=mine&&v.state==='listening',busy=mine&&v.state==='thinking';
  const ph=kind==='game'?'e.g. “Olivia in goal the whole game”':PR.edit?'e.g. “Swap the passing drill for a 4v4”':'e.g. “Plan a 75-minute passing practice”';
  h+=`<div class="vrow"><button class="vmic ${listening?'on':''}" data-act="vmic" data-k="${kind}" aria-label="${listening?'Stop':'Talk to change the plan'}">${listening?'■':'🎤'}</button>
    <input id="vtext" class="vtext" data-k="${kind}" placeholder="${listening?'Listening…':esc(ph)}" value="${esc(listening?v.text:'')}" ${busy?'disabled':''}>
    <button class="btn small primary-s" data-act="vsend" data-k="${kind}" ${busy?'disabled':''}>Go</button></div></div>`;
  return h;
}
/* iPhone Safari can switch the mic on and then never send words or an end event, so every way out is
   guarded: Stop always works, and if nothing is heard we fall back to typing (the keyboard's own 🎤 works). */
function voiceDone(kind,msg){const v=VOX;clearTimeout(v.tmr);clearTimeout(v.hard);if(v.state!=='listening')return;
  try{v.rec&&v.rec.abort();}catch(e){}v.rec=null;v.state='idle';
  if(v.text.trim())voiceSend(kind,v.text.trim());
  else{if(msg)say(msg);vRender();if(msg)renderHint();}}
const typeHint='Didn’t hear anything. Tap the box and use the 🎤 on your keyboard instead, then tap Go.';
function voiceListen(kind){
  if(!SpeechRec){say('Voice isn’t available here. Tap the box and use the 🎤 on your keyboard, then tap Go.');renderHint();const el=$('vtext');if(el)el.focus();return;}
  if(VOX.state==='listening'){voiceDone(kind,'');return;}
  let rec;try{rec=new SpeechRec();}catch(e){say(typeHint);renderHint();return;}
  VOX.rec=rec;rec.lang='en-US';rec.interimResults=true;rec.continuous=false;
  Object.assign(VOX,{kind,state:'listening',text:''});vRender();
  VOX.tmr=setTimeout(()=>{if(!VOX.text)voiceDone(kind,typeHint);},8000);
  VOX.hard=setTimeout(()=>voiceDone(kind,typeHint),30000);
  rec.onresult=e=>{if(VOX.rec!==rec)return;let t='';for(const r of e.results)t+=r[0].transcript;VOX.text=t;const el=$('vtext');if(el)el.value=t;
    clearTimeout(VOX.tmr);VOX.tmr=setTimeout(()=>voiceDone(kind,''),2500); /* a pause ends it even if Safari never does */};
  rec.onerror=e=>{if(VOX.rec!==rec)return;const er=e.error;
    voiceDone(kind,er==='not-allowed'?'Allow the microphone for this site (Settings › Safari › Microphone), or use the 🎤 on your keyboard.':er==='aborted'?'':typeHint);};
  rec.onend=()=>{if(VOX.rec===rec)voiceDone(kind,VOX.text.trim()?'':typeHint);};
  try{rec.start();}catch(e){voiceDone(kind,typeHint);}
}
function gameCtx(){const g=G(),gc=GC(),cb=g.started?blockAt(g,clock(g)):-1;
  return {team:CFG().name,opp:gc.opp||gc.title,format:String(g.form).split('/')[0],half:g.half,sub:g.sub,started:g.started,
    positions:formOf(g.form).map(p=>({id:p.id,name:p.name})),
    players:PLAYERS.map(p=>({id:p.id,name:p.name,num:p.num||'',role:p.role||'',groups:p.gr||[],guest:!!p.guest,out:!av(g,p.id)})),
    blocks:PL().map((b,i)=>({label:blockRange(g,i),locked:g.started&&i<=cb,lineup:b}))};}
function practiceCtx(){const p=PR.edit||{blocks:[]};const fmt=teamFmt();const att=Object.values(p.attendance||{}).filter(Boolean).length;
  const drills=allDrills().filter(d=>!fmt||!(d.ages||[]).length||(d.ages||[]).includes(fmt)).slice(0,150).map(d=>({id:d.id,title:d.title,topic:d.topic,min:d.minutes||10,players:d.players||'',summary:d.summary||''}));
  return {team:CFG().name,format:fmt,group:CFG().sub||'',title:p.title||'',focus:p.focus||'',date:p.date||'',attending:att,roster:PLAYERS.filter(x=>!x.guest).length,
    blocks:(p.blocks||[]).map(b=>({title:b.title||'',min:+b.min||0,drill:b.drill||'',notes:b.notes||''})),drills};}
async function voiceSend(kind,text){
  text=(text||(($('vtext')||{}).value)||'').trim();if(!text)return;
  if(!SY.on){say('Connect to the live site to change plans by voice.');renderHint();return;}
  if(kind==='game'&&gameLocked()){say('This game is final and locked. Unlock it on the Players tab first.');renderHint();return;}
  if(kind==='practice'){if(typeof syncPracticeForm==='function')syncPracticeForm();if(!DR.lib)await loadDrills();}
  Object.assign(VOX,{kind,state:'thinking',text,res:null});vRender();
  try{const r=await fetch('/api/voice',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},authHeaders()),
      body:JSON.stringify(Object.assign({team:S.team,kind,request:text,ctx:kind==='game'?gameCtx():practiceCtx()},creds()))});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){VOX.state='idle';say(j.error||'Couldn’t change the plan. Try again.');}else{VOX.res=j;VOX.state='preview';}}
  catch(e){VOX.state='idle';say('No connection. Try again in a moment.');}
  vRender();
}
function voiceApply(){const r=VOX.res;if(!r||!r.possible)return;
  if(VOX.kind==='game'){const g=G();
    VOX.undo={kind:'game',plan:JSON.stringify(g.plan),avail:JSON.stringify(g.avail),start:JSON.stringify(g.start)};
    g.plan=r.plan.blocks.map(b=>Object.assign({},b));
    PLAYERS.forEach(p=>{g.avail[p.id]=!r.plan.out.includes(p.id);});
    if(!g.started)g.start=Object.assign({},g.plan[0]);
    save();say('Plan updated');}
  else{if(!PR.edit){PR.edit={id:uid('p'),title:'',date:nextPracticeDate(),focus:'',place:'',blocks:[],attendance:{},notes:''};PR.view='plans';}
    const p=PR.edit;VOX.undo={kind:'practice',id:p.id,prev:JSON.stringify(p)};
    p.blocks=r.plan.blocks.map(b=>({id:uid('b'),drill:b.drill,title:b.title,min:b.min,notes:b.notes}));
    if(r.plan.title&&!p.title)p.title=r.plan.title;if(r.plan.focus&&!p.focus)p.focus=r.plan.focus;
    VOX.saved=false;say('Practice changed. Tap Save practice to keep it.');}
  VOX.state='idle';VOX.res=null;
}
function voiceUndo(){const u=VOX.undo;if(!u)return;
  if(u.kind==='game'){const g=G();g.plan=JSON.parse(u.plan);g.avail=JSON.parse(u.avail);g.start=JSON.parse(u.start);save();}
  else if(PR.edit&&PR.edit.id===u.id)PR.edit=JSON.parse(u.prev);
  VOX.undo=null;say('Change undone');}

EXT.vmic=ds=>{voiceListen(ds.k);return false;};
EXT.vsend=ds=>{voiceSend(ds.k);return false;};
EXT.vapply=()=>{voiceApply();};
EXT.vcancel=()=>{VOX.state='idle';VOX.res=null;};
EXT.vundo=()=>{voiceUndo();};
document.addEventListener('keydown',e=>{if(e.target&&e.target.id==='vtext'&&e.key==='Enter'){e.preventDefault();voiceSend(e.target.dataset.k);}});
