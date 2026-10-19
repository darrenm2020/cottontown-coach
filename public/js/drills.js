"use strict";
/* Drill library: the club's starter drills (data/drills.json) plus drills coaches add (saved on the server).
   Favorites are per coach when signed in, otherwise kept on this device. Admins can mark "club picks". */
const DR={lib:null,custom:[],clubFavs:[],loading:false,q:'',topic:'',fmt:'auto',only:'',open:null,edit:null};
const TOPICS={warmup:'Warm-up',passing:'Passing','first-touch':'First touch',dribbling:'Dribbling','1v1-attack':'1v1 attacking','1v1-defend':'1v1 defending',
  possession:'Possession','build-out':'Building out',finishing:'Finishing',transition:'Transition','defending-team':'Team defending',goalkeeping:'Goalkeeping',
  'small-sided':'Small-sided games','fun-games':'Fun games'};

async function loadDrills(force){
  if(DR.loading||(DR.lib&&!force))return;DR.loading=true;
  try{
    const lib=await fetch('data/drills.json').then(r=>r.json());DR.lib=Array.isArray(lib)?lib:[];
    if(SY.on){const r=await fetch(API+'?drills=1',{cache:'no-store'}).then(x=>x.json()).catch(()=>null);if(r){DR.custom=r.drills||[];DR.clubFavs=r.clubFavs||[];}}
    else DR.custom=(S.myDrills||[]);
  }catch(e){DR.lib=DR.lib||[];}
  DR.loading=false;renderAll();
}
const allDrills=()=>(DR.custom||[]).concat(DR.lib||[]);
const drillById=id=>allDrills().find(d=>d.id===id);
const myFavs=()=>(S.sess&&ME.user)?(ME.favs||[]):(S.favs||[]);
const isFav=id=>myFavs().includes(id);
const teamFmt=()=>CFG()?CFG().format:'';

/* ---------- field diagram ---------- */
function drillSVG(d,cls){
  const dg=d&&d.diagram;if(!dg||!Array.isArray(dg.items))return '';
  const W=+dg.w||40,H=+dg.h||30,u=Math.max(W,H)/50,pad=u*2;
  const col={a:'#c1121f',b:'#1f4e9c',n:'#e9c46a',gk:'#f3d35b'};
  let s='',defs=`<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#fff"/></marker><marker id="ahs" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#ffd166"/></marker></defs>`;
  const num=v=>Number.isFinite(+v)?+v:0;
  const line=(it,dash,color,mk,wd)=>{const[a,b]=it.from||[0,0],[c,e]=it.to||[0,0];return `<line x1="${num(a)}" y1="${num(b)}" x2="${num(c)}" y2="${num(e)}" stroke="${color}" stroke-width="${wd||u*0.35}" ${dash?`stroke-dasharray="${dash}"`:''} marker-end="url(#${mk})"/>`;};
  const order={zone:0,goal:1,minigoal:1,cone:2,pass:3,run:3,dribble:3,shot:3,ball:5,player:6,gk:6};
  const items=dg.items.slice().sort((x,y)=>(order[x.t]??4)-(order[y.t]??4));
  for(const it of items){
    const x=num(it.x),y=num(it.y);
    if(it.t==='zone'){const w=num(it.w),h=num(it.h);
      if(h<=1.5||w<=1.5)s+=`<line x1="${x}" y1="${y+h/2}" x2="${x+w}" y2="${y+h/2}" stroke="#fff" stroke-width="${u*0.3}" stroke-dasharray="${u} ${u*0.6}" opacity=".85"/>`;
      else s+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.7)" stroke-width="${u*0.2}" stroke-dasharray="${u*0.8} ${u*0.5}"/>`;
      if(it.label)s+=`<text x="${x+w/2}" y="${y+(h<=1.5?-u*0.6:u*1.8)}" font-size="${u*1.4}" fill="#fff" text-anchor="middle" opacity=".9">${esc(it.label)}</text>`;}
    else if(it.t==='cone')s+=`<path d="M${x},${y-u*0.9}L${x+u*0.8},${y+u*0.6}L${x-u*0.8},${y+u*0.6}z" fill="#f77f00"/>`;
    else if(it.t==='goal'){const w=num(it.w)||6;s+=`<rect x="${x-w/2}" y="${y<=H/2?y-u*0.4:y-u*0.6}" width="${w}" height="${u}" fill="#fff" stroke="#333" stroke-width="${u*0.1}"/>`;}
    else if(it.t==='minigoal'){const w=num(it.w)||2,side=it.side||'top';const vert=side==='left'||side==='right';
      s+=vert?`<rect x="${x-u*0.4}" y="${y-w/2}" width="${u*0.8}" height="${w}" fill="#fff" stroke="#333" stroke-width="${u*0.1}"/>`:`<rect x="${x-w/2}" y="${y-u*0.4}" width="${w}" height="${u*0.8}" fill="#fff" stroke="#333" stroke-width="${u*0.1}"/>`;}
    else if(it.t==='pass')s+=line(it,'','#fff','ah');
    else if(it.t==='run')s+=line(it,`${u*0.8} ${u*0.5}`,'#fff','ah');
    else if(it.t==='dribble')s+=line(it,`${u*0.2} ${u*0.4}`,'#fff','ah',u*0.5);
    else if(it.t==='shot')s+=line(it,'','#ffd166','ahs',u*0.55);
    else if(it.t==='ball')s+=`<circle cx="${x}" cy="${y}" r="${u*0.55}" fill="#fff" stroke="#111" stroke-width="${u*0.12}"/>`;
    else if(it.t==='player'||it.t==='gk'){
      const team=it.t==='gk'?'gk':(String(it.label||'').toUpperCase()==='N'?'n':(it.team==='b'?'b':it.team==='n'?'n':'a'));
      const lbl=it.t==='gk'&&!it.label?'GK':(it.label||'');
      s+=`<circle cx="${x}" cy="${y}" r="${u*1.25}" fill="${col[team]}" stroke="#fff" stroke-width="${u*0.2}"/>`;
      if(lbl)s+=`<text x="${x}" y="${y+u*0.5}" font-size="${u*(String(lbl).length>2?1.0:1.35)}" font-weight="700" fill="${team==='gk'||team==='n'?'#14181a':'#fff'}" text-anchor="middle">${esc(lbl)}</text>`;
    }
  }
  return `<svg class="${cls||'dsvg'}" viewBox="${-pad} ${-pad} ${W+2*pad} ${H+2*pad}" role="img" aria-label="Diagram: ${esc(d.title)}">${defs}<rect x="${-pad}" y="${-pad}" width="${W+2*pad}" height="${H+2*pad}" fill="#2f7d3b"/><rect x="0" y="0" width="${W}" height="${H}" fill="#38913f" stroke="rgba(255,255,255,.75)" stroke-width="${u*0.25}"/>${s}</svg>`;
}

/* ---------- list ---------- */
function filteredDrills(){
  const f=DR.fmt==='auto'?teamFmt():DR.fmt;const q=DR.q.toLowerCase();
  return allDrills().filter(d=>(!DR.topic||d.topic===DR.topic)&&(!f||!d.ages||!d.ages.length||d.ages.includes(f))
    &&(DR.only!=='fav'||isFav(d.id))&&(DR.only!=='club'||DR.clubFavs.includes(d.id))&&(DR.only!=='mine'||d.custom)
    &&(!q||[d.title,d.summary,d.setup,(d.coaching||[]).join(' '),TOPICS[d.topic]].join(' ').toLowerCase().includes(q)));
}
function drillCard(d,pick){
  return `<button class="dcard" data-act="dropen" data-id="${esc(d.id)}">${drillSVG(d,'dthumb')}<span class="dct"><b>${esc(d.title)}</b>${isFav(d.id)?' <span class="star on" aria-label="Favorite">★</span>':''}${DR.clubFavs.includes(d.id)?' <span class="tag">Club pick</span>':''}${d.custom?' <span class="tag">Coach added</span>':''}
    <small>${esc(TOPICS[d.topic]||d.topic||'')} · ${d.minutes?d.minutes+' min':''}${d.players?' · '+esc(d.players)+' players':''}</small><small>${esc(d.summary||'')}</small></span>${pick?'<span class="addpill">+ Add</span>':''}</button>`;
}
function drillListHTML(pick){
  if(!DR.lib)return '<p class="fine">Loading drills…</p>';
  const list=filteredDrills();
  return list.length?list.map(d=>drillCard(d,pick)).join(''):'<div class="empty">No drills match. Try another topic or clear the search.</div>';
}
function renderDrillLib(pick){
  loadDrills();
  const f=DR.fmt;
  let h=`<div class="drbar"><input id="drq" type="search" placeholder="Search drills" value="${esc(DR.q)}" aria-label="Search drills">
    <select id="drtopic" aria-label="Topic"><option value="">All topics</option>${Object.entries(TOPICS).map(([k,l])=>`<option value="${k}" ${DR.topic===k?'selected':''}>${l}</option>`).join('')}</select>
    <select id="drfmt" aria-label="Format"><option value="auto" ${f==='auto'?'selected':''}>${esc(teamFmt()||'All')} (this team)</option><option value="" ${f===''?'selected':''}>All formats</option>${['7v7','9v9','11v11'].map(x=>`<option ${f===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="seg drseg">${[['','All'],['fav','My favorites'],['club','Club picks'],['mine','Coach added']].map(([v,l])=>`<button data-act="dronly" data-v="${v}" aria-pressed="${DR.only===v}">${l}</button>`).join('')}</div>
    ${pick?`<p class="fine pickhint">Tap a drill to add it to <b>${esc(PR.edit&&PR.edit.title||'the practice')}</b>. <button class="btn small" data-act="prback">Back to the practice</button></p>`:''}
    <div id="drlist" class="dlist">${drillListHTML(pick)}</div>
    ${canEdit()&&SY.on?'<button class="btn small" data-act="drnew">+ Add your own drill</button>':''}`;
  return h;
}

/* ---------- detail and editing (shown in an overlay) ---------- */
function drillSheetHTML(){
  if(DR.edit)return drillFormHTML();
  const d=DR.open&&drillById(DR.open);if(!d)return '';
  const li=a=>(a||[]).map(x=>`<li>${esc(x)}</li>`).join('');
  const mine=d.custom&&(isAdmin()||(ME.user&&d.by===ME.user.name));
  return `<div class="ovbg" data-act="drclose"></div><div class="ovp drill" role="dialog" aria-label="${esc(d.title)}">
    <div class="sh"><div><b>${esc(d.title)}</b><div class="fine">${esc(TOPICS[d.topic]||d.topic||'')} · ${(d.ages||[]).join(', ')}${d.minutes?' · '+d.minutes+' min':''}${d.intensity?' · '+esc(d.intensity)+' intensity':''}</div></div><button class="btn small" data-act="drclose">Close</button></div>
    ${drillSVG(d,'dbig')}
    <div class="dlegend"><span><i style="background:#c1121f"></i>Attack</span><span><i style="background:#1f4e9c"></i>Defend</span><span><i style="background:#f3d35b"></i>Keeper</span><span>── pass</span><span>- - run</span><span>··· dribble</span></div>
    <div class="dacts">${PR.edit?`<button class="btn small primary-s" data-act="dradd" data-id="${esc(d.id)}">+ Add to ${esc(PR.edit.title||'practice')}</button>`:''}
      <button class="btn small" data-act="drfav" data-id="${esc(d.id)}">${isFav(d.id)?'★ Favorite':'☆ Add to favorites'}</button>
      ${isAdmin()&&SY.on?`<button class="btn small" data-act="drclubfav" data-id="${esc(d.id)}">${DR.clubFavs.includes(d.id)?'Remove club pick':'Make a club pick'}</button>`:''}
      ${d.video?`<a class="btn small" href="${esc(d.video)}" target="_blank" rel="noopener">Watch video</a>`:''}
      ${mine?`<button class="btn small" data-act="dredit" data-id="${esc(d.id)}">Edit</button>`:''}</div>
    ${d.summary?`<p>${esc(d.summary)}</p>`:''}
    <div class="dfacts">${d.players?`<span><b>Players</b> ${esc(d.players)}</span>`:''}${d.space?`<span><b>Space</b> ${esc(d.space)}</span>`:''}${(d.equipment||[]).length?`<span><b>Equipment</b> ${esc(d.equipment.join(', '))}</span>`:''}</div>
    ${d.setup?`<h4>Setup</h4><p>${esc(d.setup)}</p>`:''}
    ${(d.how||[]).length?`<h4>How it works</h4><ol>${li(d.how)}</ol>`:''}
    ${(d.coaching||[]).length?`<h4>Coaching points</h4><ul>${li(d.coaching)}</ul>`:''}
    ${d.easier?`<h4>Make it easier</h4><p>${esc(d.easier)}</p>`:''}${d.harder?`<h4>Make it harder</h4><p>${esc(d.harder)}</p>`:''}
    ${d.custom?`<p class="fine">Added by ${esc(d.by||'a coach')}</p>`:''}</div>`;
}
function drillFormHTML(){
  const d=DR.edit;const lines=a=>esc((a||[]).join('\n'));
  return `<div class="ovbg"></div><div class="ovp drill" role="dialog" aria-label="Drill">
    <div class="sh"><div><b>${d.id?'Edit drill':'Add your own drill'}</b><div class="fine">Shared with every coach in the club.</div></div><button class="btn small" data-act="drformclose">Cancel</button></div>
    <label class="fld">Name<input id="df-title" value="${esc(d.title||'')}"></label>
    <div class="grid2"><label class="fld">Topic<select id="df-topic">${Object.entries(TOPICS).map(([k,l])=>`<option value="${k}" ${d.topic===k?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="fld">Minutes<input id="df-min" type="number" inputmode="numeric" min="2" max="60" value="${esc(d.minutes||12)}"></label></div>
    <div class="fld">Formats<div class="chkrow">${['7v7','9v9','11v11'].map(x=>`<label class="chk"><input type="checkbox" data-dfage="${x}" ${(d.ages||[teamFmt()]).includes(x)?'checked':''}> ${x}</label>`).join('')}</div></div>
    <div class="grid2"><label class="fld">Players<input id="df-players" value="${esc(d.players||'')}" placeholder="e.g. 8-14"></label><label class="fld">Space<input id="df-space" value="${esc(d.space||'')}" placeholder="e.g. 30 x 20 yards"></label></div>
    <label class="fld">One-line summary<input id="df-summary" value="${esc(d.summary||'')}"></label>
    <label class="fld">Setup<textarea id="df-setup" rows="2">${esc(d.setup||'')}</textarea></label>
    <label class="fld">How it works (one step per line)<textarea id="df-how" rows="4">${lines(d.how)}</textarea></label>
    <label class="fld">Coaching points (one per line)<textarea id="df-coach" rows="3">${lines(d.coaching)}</textarea></label>
    <div class="grid2"><label class="fld">Make it easier<input id="df-easier" value="${esc(d.easier||'')}"></label><label class="fld">Make it harder<input id="df-harder" value="${esc(d.harder||'')}"></label></div>
    <label class="fld">Video link (YouTube, Instagram…)<input id="df-video" type="url" value="${esc(d.video||'')}" placeholder="https://"></label>
    <div class="gacts"><button class="btn small primary-s" data-act="drsave">Save drill</button>${d.id?`<button class="btn small ${armed('drdel')?'danger-s armed':''}" data-act="drdel">${armed('drdel')?'Tap again to delete':'Delete drill'}</button>`:''}</div></div>`;
}

/* Overlays (practice mode, drill details, player cards) live outside the tab panel, so they're drawn after every render.
   Each feature adds a function to OVERLAYS; the first one with something to show wins. */
const OV={el:null};
const OVERLAYS=[()=>PR.run?practiceRunHTML():'',drillSheetHTML];
function renderOverlays(){
  if(!OV.el){OV.el=document.createElement('div');OV.el.id='overlay';document.body.appendChild(OV.el);}
  const ae=document.activeElement;if(ae&&OV.el.contains(ae)&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))return;
  let h='';for(const f of OVERLAYS){h=f()||'';if(h)break;}
  if(OV.el.innerHTML!==h)OV.el.innerHTML=h;
}
renderAll=(base=>function(){base();renderOverlays();})(renderAll);

/* ---------- actions ---------- */
document.addEventListener('input',e=>{if(e.target&&e.target.id==='drq'){DR.q=e.target.value;const el=$('drlist');if(el)el.innerHTML=drillListHTML(PR.view==='drills'&&!!PR.edit);}});
document.addEventListener('change',e=>{const id=e.target&&e.target.id;if(id==='drtopic'){DR.topic=e.target.value;renderAll();}if(id==='drfmt'){DR.fmt=e.target.value;renderAll();}});
EXT.dronly=ds=>{DR.only=ds.v;};
EXT.dropen=ds=>{if(PR.edit&&PR.view==='drills'){addDrillBlock(ds.id);return;}DR.open=ds.id;};
EXT.drclose=()=>{DR.open=null;};
EXT.drfav=ds=>{
  const id=ds.id,on=!isFav(id);
  if(S.sess&&ME.user){ME.favs=on?ME.favs.concat(id):ME.favs.filter(x=>x!==id);apiPost(Object.assign({kind:'fav',id,on},creds())).then(r=>{if(!r.ok)say(r.j.error||'Couldn’t save the favorite');});}
  else{S.favs=on?(S.favs||[]).concat(id):(S.favs||[]).filter(x=>x!==id);saveLocal();}
  say(on?'Added to your favorites':'Removed from your favorites');
};
EXT.drclubfav=ds=>{
  const on=!DR.clubFavs.includes(ds.id);DR.clubFavs=on?DR.clubFavs.concat(ds.id):DR.clubFavs.filter(x=>x!==ds.id);
  apiPost(Object.assign({kind:'clubfav',id:ds.id,on},creds())).then(r=>{if(!r.ok)say(r.j.error||'Couldn’t save');});
};
EXT.dradd=ds=>{addDrillBlock(ds.id);DR.open=null;};
EXT.drnew=()=>{DR.edit={ages:[teamFmt()],minutes:12,topic:DR.topic||'passing'};DR.open=null;};
EXT.dredit=ds=>{const d=drillById(ds.id);if(d)DR.edit=JSON.parse(JSON.stringify(d));};
EXT.drformclose=()=>{DR.edit=null;};
function readDrillForm(){
  const v=id=>{const el=$(id);return el?el.value.trim():'';};const ls=id=>v(id).split('\n').map(x=>x.trim()).filter(Boolean);
  const d=DR.edit;
  const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'drill';
  return Object.assign({},d,{id:d.id||('c-'+slug(v('df-title'))+'-'+Date.now().toString(36).slice(-4)),title:v('df-title'),topic:v('df-topic'),minutes:+v('df-min')||0,
    ages:[...document.querySelectorAll('[data-dfage]')].filter(x=>x.checked).map(x=>x.dataset.dfage),players:v('df-players'),space:v('df-space'),summary:v('df-summary'),
    setup:v('df-setup'),how:ls('df-how'),coaching:ls('df-coach'),easier:v('df-easier'),harder:v('df-harder'),video:v('df-video')});
}
EXT.drsave=()=>{
  const d=readDrillForm();if(!d.title){say('Give the drill a name');return;}
  if(d.video&&!/^https:\/\//.test(d.video)){say('Video links need to start with https://');return;}
  (async()=>{const r=await apiPost(Object.assign({kind:'drill',drill:d},creds()));
    if(r.ok){DR.edit=null;DR.open=d.id;say('Drill saved for the whole club');await loadDrills(true);}
    else{say(r.j.error||'Couldn’t save the drill');renderAll();}})();
};
EXT.drdel=()=>{
  if(!armed('drdel')){arm('drdel');return;}
  UI.arm=null;const id=DR.edit.id;
  (async()=>{const r=await apiPost(Object.assign({kind:'drill-del',id},creds()));if(r.ok){DR.edit=null;DR.open=null;say('Drill deleted');await loadDrills(true);}else say(r.j.error||'Couldn’t delete');renderAll();})();
};
