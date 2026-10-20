"use strict";
/* Team formations: besides the built-in shapes, a head coach can save the team's own formations, each with its own
   position names, and switch between them. Drag a position on the field to move it; tap it to rename it or change
   its line (defense, midfield, forward). The keeper spot is always "GK" (saves and keeper stats depend on it).
   A game set up with a custom formation keeps its own copy of the positions, so later edits never change it. */
const FB={draft:null,sel:'',drag:null};
const LINE_NAME={DEF:'Defense',MID:'Midfield',FWD:'Forward'};

function formationsCardHTML(c){
  const own=(c.forms||[]).filter(f=>f.format===c.format);
  const btn=(id,label)=>`<button data-act="formation" data-n="${esc(id)}" aria-pressed="${c.formation===id}">${esc(label)}</button>`;
  const cur=(c.forms||[]).find(f=>f.id===c.formation);
  return `<div class="card"><h3>Format and formation</h3>
    <div class="seg">${FORMATS.map(f=>`<button data-act="fmt" data-f="${f}" aria-pressed="${c.format===f}">${f}</button>`).join('')}</div>
    <h4 class="formh">Formations</h4>
    <div class="seg formseg">${Object.keys(FORMS[c.format]).map(n=>btn(n,n)).join('')}${own.map(f=>btn(f.id,f.name)).join('')}</div>
    <div class="gacts">${cur?`<button class="btn small" data-act="fbedit" data-id="${esc(cur.id)}">Edit ${esc(cur.name)}</button>`:''}
      <button class="btn small" data-act="fbnew">${cur?'+ New formation':'+ New formation from '+esc(c.formation)}</button></div>
    <p class="fine">Save your own formations with your own position names. Changing formation rebuilds the rotation for games that haven’t started; games already underway keep their lineup.</p></div>`;
}

/* ---------- editor ---------- */
const fbClone=pos=>pos.map(p=>({id:p.id,name:p.name,g:p.g,x:Math.round(p.x),y:Math.round(p.y)}));
EXT.fbnew=()=>{const c=CFG();const base=formOf(teamKey(c));
  FB.draft={id:'',name:'',format:c.format,pos:fbClone(base)};FB.sel='';};
EXT.fbedit=ds=>{const f=(CFG().forms||[]).find(x=>x.id===ds.id);if(!f)return false;FB.draft={id:f.id,name:f.name,format:f.format,pos:fbClone(f.pos)};FB.sel='';};
EXT.fbclose=()=>{FB.draft=null;FB.sel='';};
EXT.fbsel=ds=>{FB.sel=FB.sel===ds.id?'':ds.id;};
EXT.fbline=ds=>{const p=FB.draft&&FB.draft.pos.find(x=>x.id===FB.sel);if(p&&p.g!=='GK'&&LINE_NAME[ds.g])p.g=ds.g;};

/* Checks a draft; returns a problem to show, or ''. */
function fbProblem(d,c){
  if(!d.name.trim())return 'Give the formation a name.';
  if(d.name.trim().length>24)return 'Keep the name to 24 characters or fewer.';
  if(Object.keys(FORMS[d.format]||{}).some(n=>n.toLowerCase()===d.name.trim().toLowerCase())||(c.forms||[]).some(f=>f.id!==d.id&&f.format===d.format&&f.name.toLowerCase()===d.name.trim().toLowerCase()))return 'There’s already a formation with that name.';
  if(d.pos.length!==FORMAT_N[d.format])return `A ${d.format} formation needs ${FORMAT_N[d.format]} positions.`;
  const ids=d.pos.map(p=>p.id);
  if(ids.some(id=>!/^[A-Z0-9]{1,4}$/.test(id)))return 'Short names are 1–4 letters or numbers, like LB or CDM.';
  if(new Set(ids).size!==ids.length)return 'Each position needs a different short name.';
  if(d.pos.filter(p=>p.g==='GK').length!==1||!ids.includes('GK'))return 'The formation needs one keeper (GK).';
  return '';
}
EXT.fbsave=()=>{
  const c=CFG(),d=FB.draft;if(!d)return false;if(!isHead()&&SY.on){say('Only a head coach can change formations');return;}
  const prob=fbProblem(d,c);if(prob){FB.err=prob;return;}
  FB.err='';const f={id:d.id||'c-'+uid('').slice(-8),name:d.name.trim(),format:d.format,pos:fbClone(d.pos)};
  c.forms=(c.forms||[]).filter(x=>x.id!==f.id).concat(f);
  const using=c.formation===f.id;
  // A new formation is put to use right away; editing the one in use rebuilds games that haven't started.
  c.format=f.format;c.formation=f.id;
  FB.draft=null;FB.sel='';
  if(typeof applyForm==='function')applyForm();say(`${using?'Updated':'Saved'} ${f.name}`);save();
};
EXT.fbdel=()=>{
  const c=CFG(),d=FB.draft;if(!d||!d.id)return false;
  if(!armed('fbdel')){arm('fbdel');say('Tap Delete again to remove this formation');return;}
  UI.arm=null;c.forms=(c.forms||[]).filter(x=>x.id!==d.id);
  if(c.formation===d.id){c.formation=Object.keys(FORMS[c.format])[0];applyForm();}
  say(`Removed ${d.name}. Games already set up with it keep their positions.`);FB.draft=null;save();
};

function formationEditorHTML(){
  const d=FB.draft;if(!d||!CFG())return '';
  const sel=d.pos.find(p=>p.id===FB.sel);
  const chips=d.pos.map(p=>`<button class="fbchip g-${p.g.toLowerCase()} ${p.id===FB.sel?'sel':''}" data-act="fbsel" data-id="${esc(p.id)}" data-fbpos="${esc(p.id)}" style="left:${p.x}%;top:${p.y}%" aria-label="${esc(p.name)} (${esc(p.id)}). Drag to move, or use the arrow keys once selected." aria-pressed="${p.id===FB.sel}">${esc(p.id)}</button>`).join('');
  return `<div class="ovbg" data-act="fbclose"></div><div class="ovp navp fbp" role="dialog" aria-label="${d.id?'Edit formation':'New formation'}">
    <div class="sh"><div><b>${d.id?'Edit formation':'New formation'}</b><div class="fine">${esc(d.format)} · ${d.pos.length} positions</div></div><button class="btn small" data-act="fbclose">Close</button></div>
    <label class="fld">Formation name<input data-fb="name" value="${esc(d.name)}" placeholder="e.g. Diamond, 3-1-3-1, Saturday press" maxlength="24" autocomplete="off"></label>
    <p class="fine">Drag a position to move it. Tap one to rename it or change its line.</p>
    <div class="fbpitch" id="fbpitch"><div class="mlines">${typeof LINES==='string'?LINES:''}</div>${chips}</div>
    ${sel?`<div class="fbedit card"><div class="grid2"><label class="fld">Short name${sel.g==='GK'?' (keeper stays GK)':''}<input data-fbp="id" value="${esc(sel.id)}" maxlength="4" ${sel.g==='GK'?'disabled':''} autocomplete="off" style="text-transform:uppercase"></label>
        <label class="fld">Full name<input data-fbp="name" value="${esc(sel.name)}" maxlength="24" autocomplete="off"></label></div>
        ${sel.g==='GK'?'':`<div class="seg">${Object.entries(LINE_NAME).map(([g,l])=>`<button data-act="fbline" data-g="${g}" aria-pressed="${sel.g===g}">${l}</button>`).join('')}</div>`}</div>`:''}
    ${FB.err?`<p class="formmsg" role="alert">${esc(FB.err)}</p>`:''}
    <div class="gacts"><button class="btn primary-s" data-act="fbsave">Save formation</button><button class="btn small" data-act="fbclose">Cancel</button>
      ${d.id?`<span class="fbspacer"></span><button class="btn small danger-s ${armed('fbdel')?'armed':''}" data-act="fbdel">${armed('fbdel')?'Tap again to delete':'Delete'}</button>`:''}</div></div>`;
}
OVERLAYS.unshift(formationEditorHTML);

/* Typing a name or a position's names updates the draft without redrawing (keeps the cursor where it is). */
document.addEventListener('input',e=>{const el=e.target;if(!el||!el.dataset||!FB.draft)return;
  if(el.dataset.fb==='name')FB.draft.name=el.value;
  else if(el.dataset.fbp){const p=FB.draft.pos.find(x=>x.id===FB.sel);if(!p)return;
    if(el.dataset.fbp==='name')p.name=el.value.slice(0,24);
    else{const v=el.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);el.value=v;
      if(v&&!FB.draft.pos.some(x=>x!==p&&x.id===v)){p.id=v;FB.sel=v;const chip=document.querySelector(`[data-fbpos].sel`);if(chip){chip.textContent=v;chip.dataset.id=v;chip.dataset.fbpos=v;}}}}});
document.addEventListener('change',e=>{if(e.target&&e.target.dataset&&(e.target.dataset.fbp||e.target.dataset.fb)&&FB.draft){FB.err='';e.target.blur();renderAll();}},true);

/* Drag positions on the editor's field (mouse, touch or pen). */
document.addEventListener('pointerdown',e=>{const chip=e.target.closest&&e.target.closest('[data-fbpos]');if(!chip||!FB.draft)return;
  const box=$('fbpitch');if(!box)return;FB.drag={id:chip.dataset.fbpos,chip,box:box.getBoundingClientRect(),moved:false,x0:e.clientX,y0:e.clientY};
  try{chip.setPointerCapture(e.pointerId);}catch(err){}});
document.addEventListener('pointermove',e=>{const d=FB.drag;if(!d)return;
  if(!d.moved&&Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<6)return;d.moved=true;e.preventDefault();
  const x=Math.max(5,Math.min(95,Math.round((e.clientX-d.box.left)/d.box.width*100))),y=Math.max(5,Math.min(95,Math.round((e.clientY-d.box.top)/d.box.height*100)));
  d.chip.style.left=x+'%';d.chip.style.top=y+'%';d.x=x;d.y=y;},{passive:false});
document.addEventListener('pointerup',e=>{const d=FB.drag;if(!d)return;FB.drag=null;
  if(d.moved){const p=FB.draft&&FB.draft.pos.find(x=>x.id===d.id);if(p){p.x=d.x;p.y=d.y;}FB.sel=d.id;FB.justDragged=Date.now();renderAll();}});
// A drag ends in a click; don't let that click toggle the selection off again.
document.addEventListener('click',e=>{if(FB.justDragged&&Date.now()-FB.justDragged<300&&e.target.closest&&e.target.closest('[data-fbpos]')){e.stopPropagation();e.preventDefault();}},true);
/* Arrow keys move the selected position (2% a step) for keyboard users. */
document.addEventListener('keydown',e=>{if(!FB.draft||!FB.sel||!e.target.closest||!e.target.closest('[data-fbpos]'))return;
  const dx={ArrowLeft:-2,ArrowRight:2}[e.key]||0,dy={ArrowUp:-2,ArrowDown:2}[e.key]||0;if(!dx&&!dy)return;e.preventDefault();
  const p=FB.draft.pos.find(x=>x.id===FB.sel);if(!p)return;p.x=Math.max(5,Math.min(95,p.x+dx));p.y=Math.max(5,Math.min(95,p.y+dy));
  e.target.style.left=p.x+'%';e.target.style.top=p.y+'%';});
