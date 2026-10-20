"use strict";
/* Club admin page (admins only): every team, every coach account, backups and change history.
   Head coaches manage their own team's coaches from Setup → Coaches instead. */
const ADM={open:false,view:'teams'};

function adminHTML(){
  if(!ADM.open)return '';
  if(!isAdmin())return `<div class="ovbg" data-act="adminclose"></div><div class="ovp adminp" role="dialog" aria-label="Club admin"><div class="sh"><b>Club admin</b><button class="btn small" data-act="adminclose">Close</button></div><p>Sign in as a club admin to see this page.</p></div>`;
  const views=[['teams','Teams'],['users','Coaches'],['feedback','Feedback'+(ADM.fbNew?` (${ADM.fbNew})`:'')],['backups','Backups'],['audit','Change history']];
  let h=`<div class="ovbg" data-act="adminclose"></div><div class="ovp adminp" role="dialog" aria-label="Club admin">
    <div class="sh"><div><b>Club admin</b><div class="fine">${esc(clubName())}</div></div><button class="btn small" data-act="adminclose">Close</button></div>
    <div class="seg">${views.map(([v,l])=>`<button data-act="adminview" data-v="${v}" aria-pressed="${ADM.view===v}">${l}</button>`).join('')}</div>`;
  if(ADM.view==='teams')h+=adminTeamsHTML();
  if(ADM.view==='users')h+=usersHTML();
  if(ADM.view==='feedback')h+=feedbackInboxHTML();
  if(ADM.view==='backups'||ADM.view==='audit'){
    const teams=teamsList();
    h+=`<div class="set"><span>Team</span><select id="adm-team" aria-label="Team">${teams.map(t=>`<option value="${esc(t.id)}" ${t.id===S.team?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div>`;
    h+=ADM.view==='backups'?backupsHTML():auditHTML();
  }
  return h+'</div>';
}
function adminTeamsHTML(){
  const teams=teamsList();
  let h=`<p class="fine">Every team in the club. Head coaches manage their own team’s roster, schedule and coaches; you can open any team.</p>`;
  h+=teams.map(t=>`<div class="urow"><div><b>${esc(t.name)}</b><div class="fine">${t.id===S.team?'Open now':''}</div></div><button class="btn small" data-act="navteam" data-id="${esc(t.id)}">Open</button></div>`).join('');
  h+=`<div class="uform"><h4>New team</h4><label class="fld">Team name<input id="nt-name" placeholder="e.g. Cottontown United 2016 Boys" value="${esc(UI.ntName||'')}"></label>
    <div class="seg">${FORMATS.map(f=>`<button data-act="ntfmt" data-f="${f}" aria-pressed="${UI.ntFmt===f}">${f}</button>`).join('')}</div>
    <div class="gacts"><button class="btn small primary-s" data-act="adminteamcreate">Create team</button></div>
    <p class="fine">After creating it, add the roster and games on that team’s Setup tab, then add its coaches.</p></div>`;
  if(SY.on)h+=`<div class="gacts"><button class="btn small" data-act="puball" ${UI.pubBusy?'disabled':''}>${UI.pubBusy?'Working…':'Bring every team up to date on the live site'}</button></div>`;
  return h;
}
/* Feedback inbox: newest first; mark notes done or delete them. */
function feedbackInboxHTML(){
  const L=ADM.fb;if(!L)return '<p class="fine">Loading feedback…</p>';
  const open=L.filter(x=>!x.done),done=L.filter(x=>x.done);
  const when=t=>new Date(t).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const item=x=>`<div class="fbki ${x.done?'done':''}"><div class="fbkm"><b>${esc(when(x.at))}</b>${x.type?`<span class="tag">${esc(x.type)}</span>`:''}${x.role?`<span class="fine">${esc(x.role)}</span>`:''}</div>
    <p class="fbkt2">${esc(x.text)}</p>
    <div class="fine">${[x.name&&'From '+x.name,x.contact&&'Contact: '+x.contact].filter(Boolean).map(esc).join(' · ')}${x.page?` · <a href="${esc(x.page)}">Page they were on</a>`:''}${x.tab?' · '+esc(x.tab)+' tab':''}</div>
    <div class="gacts"><button class="btn small" data-act="fbkdone" data-id="${esc(x.id)}" data-done="${x.done?'':'1'}">${x.done?'Mark not done':'Mark done'}</button><button class="btn small danger-s ${armed('fbkdel'+x.id)?'armed':''}" data-act="fbkdel" data-id="${esc(x.id)}">${armed('fbkdel'+x.id)?'Tap again to delete':'Delete'}</button></div></div>`;
  return (open.length?open.map(item).join(''):'<p class="muted">No new feedback.</p>')+(done.length?`<details class="guests"><summary><b>Done (${done.length})</b></summary>${done.map(item).join('')}</details>`:'')
    +'<p class="fine">Anyone can send feedback from the Feedback button on the club page or Send feedback in a team’s ⋯ menu. Only admins see it here.</p>';
}
async function loadFeedback(){const r=await apiGet('feedback=1');ADM.fb=r.ok?r.j.feedback:[];ADM.fbNew=ADM.fb.filter(x=>!x.done).length;renderAll();}
async function fbkAdmin(kind,id,done){
  try{const r=await fetch(API,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},authHeaders()),body:JSON.stringify(Object.assign({kind,id,done,team:S.team},creds()))});
    const j=await r.json().catch(()=>({}));if(r.ok){ADM.fb=j.feedback;ADM.fbNew=ADM.fb.filter(x=>!x.done).length;say(kind==='feedback-del'?'Deleted':done?'Marked done':'Moved back to new');}else say(j.error||'Couldn’t update it');}
  catch(e){say('Couldn’t reach the server. Try again.');}
  renderAll();}
EXT.fbkdone=ds=>{fbkAdmin('feedback-done',ds.id,!!ds.done);return false;};
EXT.fbkdel=ds=>{if(!armed('fbkdel'+ds.id)){arm('fbkdel'+ds.id);return;}UI.arm=null;fbkAdmin('feedback-del',ds.id);return false;};
OVERLAYS.unshift(adminHTML);

VIEW_OK.add('adminclose');
EXT.adminopen=()=>{NAV.open='';ADM.open=true;ADM.view='teams';if(SY.on)apiGet('feedback=1').then(r=>{if(r.ok){ADM.fb=r.j.feedback;ADM.fbNew=ADM.fb.filter(x=>!x.done).length;renderAll();}});if(!UI.teamList)loadTeamList().then(()=>renderAll());};
EXT.adminclose=()=>{ADM.open=false;AUTH.view='';};
EXT.adminview=ds=>{ADM.view=ds.v;if(ds.v==='feedback'){ADM.fb=null;loadFeedback();}AUTH.view=ds.v==='teams'?'':ds.v;AUTH.users=null;AUTH.backups=null;AUTH.audit=null;AUTH.editUser=null;if(AUTH.view)loadAuthView();};
EXT.adminteamcreate=()=>{ADM.open=false;createTeam();return false;};
document.addEventListener('change',e=>{
  if(e.target&&e.target.id==='adm-team'&&e.target.value!==S.team){
    const v=ADM.view;switchTeam(e.target.value).then(()=>{AUTH.view=v;AUTH.audit=null;AUTH.backups=null;loadAuthView();});
  }
});
