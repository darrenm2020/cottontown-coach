"use strict";
/* Optional coach sign-in, coach accounts (admins), change history and backups.
   Codes keep working: the main code is an admin, a team code is that team's head coach.
   A coach can also sign in with a personal code, or by an emailed link once email is set up on the server. */
const AUTH={view:'',users:null,audit:null,backups:null,coaches:null,editUser:null,tcEdit:null,busy:false};
const ROLE_NAME={head:'Head coach',assistant:'Assistant',stats:'Stats helper'};

async function apiPost(body){
  const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let j={};try{j=await r.json();}catch(e){}
  return {ok:r.ok,status:r.status,j};
}
async function apiGet(qs){
  const r=await fetch(API+'?'+qs,{cache:'no-store',headers:authHeaders()});
  let j={};try{j=await r.json();}catch(e){}
  return {ok:r.ok,status:r.status,j};
}
function downloadFile(name,text,type){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:type||'text/plain'}));a.download=name;
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}
const fmtWhen=ms=>new Date(ms).toLocaleString('en-US',{weekday:'short',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});

async function loadMe(){
  if(!S.sess){ME.user=null;ME.favs=[];return;}
  // Ask with the session only, so a saved code on this device can't stand in for the signed-in coach.
  try{const r=await fetch(API+'?me=1',{cache:'no-store',headers:{'x-session':S.sess}});const j=await r.json();if(r.ok){ME.user=j.user;ME.favs=j.favs||[];if(!ME.user){S.sess='';saveLocal();}}}catch(e){}
}
/* Runs once at startup: finish an emailed sign-in link (?login=...), then load who is signed in. */
async function authStart(){
  const qp=new URLSearchParams(location.search);const t=qp.get('login');
  if(t){
    qp.delete('login');try{history.replaceState(null,'',location.pathname+(qp.toString()?'?'+qp:''));}catch(e){}
    try{const r=await apiPost({kind:'login-link',token:t});
      if(r.ok){S.sess=r.j.session;ME.user=r.j.user;saveLocal();say('Signed in as '+r.j.user.name);}
      else say(r.j.error||'That sign-in link didn’t work');}catch(e){say('Couldn’t reach the server to sign in');}
  }
  try{const c=await apiGet('authcfg=1');if(c.ok)ME.cfg=c.j;}catch(e){}
  await loadMe();
  if(CFG())renderAll();else if(CLUB.on)renderClub();
}

function whoLine(){
  const u=ME.user;if(!u)return '';
  const r=myRole();
  const what=u.admin?'Admin, all teams':r?ROLE_NAME[r]+' for '+esc(CFG()?CFG().name:'this team'):'No role on this team yet';
  return `<b>${esc(u.name)}</b> <span class="fine">(${what})</span>`;
}
function signInForm(idp){
  const email=ME.cfg&&ME.cfg.email;
  return `<div class="codebox"><input id="${idp}code" type="password" autocomplete="off" placeholder="Your coach code" aria-label="Coach code"><button class="btn small" data-act="signin" data-p="${idp}">Sign in</button></div>
    ${email?`<div class="codebox"><input id="${idp}email" type="email" autocomplete="email" placeholder="Or your email for a sign-in link" aria-label="Email"><button class="btn small" data-act="emaillink" data-p="${idp}">Email me a link</button></div>`:''}`;
}
/* Team tab (parents and coaches who aren't signed in see this) */
function authTeamHTML(){
  if(ME.user)return `<p class="fine">Signed in as ${whoLine()}. <button class="btn small" data-act="signout">Sign out</button></p>`;
  return `<details class="signin"><summary>Coaches: sign in with your own code</summary>${signInForm('t')}<p class="fine">Signing in is optional for now. The team code above still works.</p></details>`;
}

/* Setup tab card */
function authSetupHTML(){
  let h=`<div class="card"><h3>Coaches and sign-in</h3>`;
  if(ME.user){
    h+=`<p>Signed in as ${whoLine()}</p><div class="gacts"><button class="btn small" data-act="signout">Sign out</button></div>`;
    if(ME.user.id!=='main')h+=`<p class="fine">Personal code: lets you sign in on another device. At least 6 characters.</p><div class="codebox"><input id="mycode" type="password" autocomplete="new-password" placeholder="New personal code"><button class="btn small" data-act="mycode">Save my code</button></div>`;
  }else{
    h+=`<p class="fine" style="margin-top:-4px">${ME.cfg&&ME.cfg.authRequired?'Sign in to make changes.':'Optional for now: the main code and team codes still work. Signing in puts your name on every change you make.'}</p>${signInForm('s')}`;
  }
  const tabs=[['coaches','Coaches',isHead()&&SY.on],['audit','Change history',canEdit()]].filter(x=>x[2]);
  if(tabs.length)h+=`<div class="seg authseg">${tabs.map(([v,l])=>`<button data-act="authview" data-v="${v}" aria-pressed="${AUTH.view===v}">${l}</button>`).join('')}</div>`;
  if(AUTH.view==='coaches')h+=teamCoachesHTML();
  if(AUTH.view==='audit')h+=auditHTML();
  if(isAdmin())h+=`<div class="gacts"><button class="btn small primary-s" data-act="adminopen">Club admin: teams, all coaches, backups</button></div>`;
  return h+'</div>';
}

/* A team's coaches, managed by its head coach. */
function teamCoachesHTML(){
  if(!AUTH.coaches)return '<p class="fine">Loading…</p>';
  if(AUTH.coaches.error)return `<p class="fine">${esc(AUTH.coaches.error)}</p>`;
  const list=AUTH.coaches.list;
  let h=`<p class="fine">Coaches for ${esc(CFG().name)}. Head coaches can change everything for the team; assistants run games and practices; stats helpers add goals and stats only.</p>`;
  h+=list.map(c=>`<div class="urow"><div><b>${esc(c.name)}</b>${c.admin?' <span class="tag">Club admin</span>':''}<div class="fine">${esc(c.email||'No email')}${c.hasCode?' · has a code':' · no code yet'}</div></div>
    <div class="tcact"><select data-tcrole="${esc(c.id)}" aria-label="Role for ${esc(c.name)}">${Object.entries(ROLE_NAME).map(([k,l])=>`<option value="${k}" ${c.role===k?'selected':''}>${l}</option>`).join('')}</select>
    <button class="btn small" data-act="tcedit" data-id="${esc(c.id)}">${AUTH.tcEdit===c.id?'Close':'More'}</button></div></div>
    ${AUTH.tcEdit===c.id?`<div class="uform"><div class="codebox"><input id="tc-code" type="password" autocomplete="new-password" placeholder="Give ${esc(c.name)} a code (6+ characters)"><button class="btn small" data-act="tccode" data-id="${esc(c.id)}">Set code</button></div>
      <div class="gacts"><button class="btn small ${armed('tcrm'+c.id)?'danger-s armed':''}" data-act="tcremove" data-id="${esc(c.id)}">${armed('tcrm'+c.id)?'Tap again to remove from the team':'Remove from the team'}</button></div></div>`:''}`).join('');
  h+=`<div class="uform"><h4>Add a coach</h4><div class="grid2"><label class="fld">Name<input id="tc-name"></label><label class="fld">Email<input id="tc-email" type="email" placeholder="So they can get sign-in links"></label></div>
    <div class="set"><span>Role</span><select id="tc-role">${Object.entries(ROLE_NAME).map(([k,l])=>`<option value="${k}" ${k==='assistant'?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="gacts"><button class="btn small primary-s" data-act="tcadd">Add coach</button></div></div>`;
  return h;
}

function auditHTML(){
  if(!SY.on)return '<p class="fine">Change history is kept on the live site.</p>';
  if(!AUTH.audit)return '<p class="fine">Loading…</p>';
  if(AUTH.audit.error)return `<p class="fine">${esc(AUTH.audit.error)}</p>`;
  const title=gid=>{const gc=CFG().games.find(x=>x.id===gid);if(!gc)return '';return gc.opp&&gc.opp!==gc.title&&!gc.opp.startsWith(gc.title)?gc.title+' vs '+gc.opp:(gc.opp||gc.title);};
  const list=AUTH.audit.list;
  if(!list.length)return '<p class="fine">No changes recorded yet.</p>';
  return `<ul class="log audit">${list.map(x=>`<li><div class="lt">${esc(fmtWhen(x.at))}</div><div class="ll"><div><b>${esc(x.who)}</b>: ${esc(x.what)}${x.gid?` <span class="fine">(${esc(title(x.gid))})</span>`:''}</div></div></li>`).join('')}</ul>`;
}

function roleSelect(uid,teamId,cur){
  return `<select data-urole="${esc(teamId)}" aria-label="Role"><option value="">None</option>${Object.entries(ROLE_NAME).map(([k,l])=>`<option value="${k}" ${cur===k?'selected':''}>${l}</option>`).join('')}</select>`;
}
function usersHTML(){
  if(!SY.on)return '<p class="fine">Coach accounts are kept on the live site.</p>';
  if(!AUTH.users)return '<p class="fine">Loading…</p>';
  const teams=teamsList();
  const tname=id=>{const t=teams.find(x=>x.id===id);return t?t.name:id;};
  let h='';
  const e=AUTH.editUser;
  if(e){
    h+=`<div class="uform"><h4>${e.id?'Edit coach':'Add a coach'}</h4>
      <div class="grid2"><label class="fld">Name<input id="u-name" value="${esc(e.name||'')}"></label><label class="fld">Email (for sign-in links)<input id="u-email" type="email" value="${esc(e.email||'')}"></label></div>
      <label class="chk"><input type="checkbox" id="u-admin" ${e.admin?'checked':''}> Admin: every team, coach accounts and backups</label>
      <div class="uroles">${teams.map(t=>`<div class="set"><span>${esc(t.name)}</span>${roleSelect(e.id,t.id,(e.roles||{})[t.id])}</div>`).join('')}</div>
      <p class="fine">Head coach: everything for the team. Assistant: runs games and practices, can’t change the roster or schedule. Stats helper: adds goals and stats only.</p>
      ${e.id?`<div class="codebox"><input id="u-code" type="password" autocomplete="new-password" placeholder="Give them a personal code (6+ characters)"><button class="btn small" data-act="usercode">Set code</button></div>`:''}
      <div class="gacts"><button class="btn small primary-s" data-act="usersave">Save</button><button class="btn small" data-act="usercancel">Cancel</button>
      ${e.id?`<button class="btn small ${armed('udel'+e.id)?'danger-s armed':''}" data-act="userdel">${armed('udel'+e.id)?'Tap again to remove':'Remove coach'}</button>`:''}</div></div>`;
  }else h+=`<button class="btn small" data-act="useredit" data-id="">+ Add a coach</button>`;
  if(!AUTH.users.length)h+='<p class="fine">No coach accounts yet.</p>';
  h+=AUTH.users.map(u=>`<div class="urow"><div><b>${esc(u.name)}</b>${u.admin?' <span class="tag">Admin</span>':''}${u.disabled?' <span class="tag">Off</span>':''}<div class="fine">${esc(u.email||'No email')}${u.hasCode?' · has a code':' · no code yet'}</div>
    <div class="fine">${Object.entries(u.roles||{}).map(([t,r])=>esc(tname(t))+': '+ROLE_NAME[r]).join(' · ')||(u.admin?'':'No teams yet')}</div></div>
    <button class="btn small" data-act="useredit" data-id="${esc(u.id)}">Edit</button></div>`).join('');
  return h;
}

function backupsHTML(){
  if(!SY.on)return '<p class="fine">Backups run on the live site.</p>';
  if(!AUTH.backups)return '<p class="fine">Loading…</p>';
  const b=AUTH.backups;
  let h=`<p class="fine">Everything is backed up every night and the last 30 days are kept. Restoring brings back one game from that day without touching anything else.</p>
    <div class="gacts"><button class="btn small" data-act="backupnow" ${AUTH.busy?'disabled':''}>${AUTH.busy?'Backing up…':'Back up now'}</button></div>`;
  if(!b.length)return h+'<p class="fine">No backups yet. The first one runs tonight.</p>';
  const games=CFG().games.filter(gc=>TS().games[gc.id]&&TS().games[gc.id].started);
  h+=`<div class="set"><span>Backup</span><select id="bk-date">${b.map(d=>`<option>${esc(d)}</option>`).join('')}</select></div>
    <div class="gacts"><button class="btn small" data-act="backupdl">Download it</button></div>
    ${games.length?`<div class="set"><span>Restore a ${esc(shortName())} game from it</span><select id="bk-game">${games.map(gc=>`<option value="${esc(gc.id)}">${esc(gc.title+(gc.opp?' vs '+gc.opp:''))}</option>`).join('')}</select></div>
    <div class="gacts"><button class="btn small ${armed('restore')?'danger-s armed':''}" data-act="restoregame">${armed('restore')?'Tap again to replace this game with the backup':'Restore game'}</button></div>`:''}`;
  return h;
}

async function loadAuthView(){
  const v=AUTH.view;
  if(v==='coaches'){const r=await apiGet('coaches='+encodeURIComponent(S.team));AUTH.coaches=r.ok?{list:r.j.coaches}:{error:r.j.error||'Couldn’t load the coaches'};}
  if(v==='audit'){const r=await apiGet('audit='+encodeURIComponent(S.team));AUTH.audit=r.ok?{list:r.j.audit}:{error:r.j.error||'Couldn’t load the history'};}
  if(v==='users'){const r=await apiGet('users=1');AUTH.users=r.ok?r.j.users:[];}
  if(v==='backups'){const r=await apiGet('backups=1');AUTH.backups=r.ok?r.j.backups:[];}
  renderAll();
}
const val=id=>{const el=$(id);return el?el.value.trim():'';};

/* ---------- actions ---------- */
VIEW_OK.add('signin');VIEW_OK.add('emaillink');VIEW_OK.add('signout');
EXT.signin=ds=>{
  const code=val(ds.p+'code');if(!code){say('Enter your coach code');return;}
  (async()=>{const r=await apiPost({kind:'login',code});
    if(r.ok){S.sess=r.j.session;ME.user=r.j.user;if(r.j.user.admin&&r.j.user.id==='main')S.master=code;saveLocal();await loadMe();say('Signed in as '+r.j.user.name);resetSync();try{applyServer(await getState(S.team));}catch(e){}}
    else say(r.j.error||'That code didn’t work');renderAll();})();
};
EXT.emaillink=ds=>{
  const email=val(ds.p+'email');if(!email){say('Enter your email');return;}
  (async()=>{const r=await apiPost({kind:'login-email',email});
    say(r.ok?(r.j.devLink?'Test link: '+r.j.devLink:'If that email belongs to a coach, a sign-in link is on its way.'):(r.j.error||'Couldn’t send the link'));
    if(r.j.devLink)console.log('Sign-in link:',r.j.devLink);renderAll();})();
};
EXT.signout=()=>{
  // Signing out makes this device view-only: the session and any saved codes go.
  const s=S.sess;S.sess='';ME.user=null;ME.favs=[];AUTH.view='';S.auth={};delete S.master;saveLocal();if(s)apiPost({kind:'logout',session:s}).catch(()=>{});say('Signed out');
};
EXT.mycode=()=>{
  const nc=val('mycode');if(nc.length<6){say('Use at least 6 characters');return;}
  (async()=>{const r=await apiPost(Object.assign({kind:'mycode',newCode:nc},creds()));say(r.ok?'Your personal code is saved':(r.j.error||'Couldn’t save it'));renderAll();})();
};
EXT.authview=ds=>{AUTH.view=(AUTH.view===ds.v&&!ds.keep)?'':ds.v;AUTH.audit=null;AUTH.users=null;AUTH.backups=null;AUTH.coaches=null;AUTH.editUser=null;AUTH.tcEdit=null;if(AUTH.view)loadAuthView();};
const teamCall=async(body,msg)=>{const r=await apiPost(Object.assign({team:S.team},body,creds()));say(r.ok?msg:(r.j.error||'Couldn’t save'));if(r.ok)await loadAuthView();else renderAll();return r.ok;};
EXT.tcadd=()=>{const name=val('tc-name'),email=val('tc-email'),role=val('tc-role');if(!name&&!email){say('Enter a name or email');return;}
  teamCall({kind:'team-coach',name,email,role},(name||email)+' added. Give them a code, or they can sign in with an email link.');};
EXT.tcedit=ds=>{AUTH.tcEdit=AUTH.tcEdit===ds.id?null:ds.id;};
EXT.tccode=ds=>{const nc=val('tc-code');if(nc.length<6){say('Use at least 6 characters');return;}teamCall({kind:'team-coach-code',id:ds.id,newCode:nc},'Code set. Share it with the coach privately.');};
EXT.tcremove=ds=>{if(!armed('tcrm'+ds.id)){arm('tcrm'+ds.id);return;}UI.arm=null;AUTH.tcEdit=null;teamCall({kind:'team-coach-remove',id:ds.id},'Removed from the team');};
document.addEventListener('change',e=>{const id=e.target&&e.target.dataset&&e.target.dataset.tcrole;if(id)teamCall({kind:'team-coach',id,role:e.target.value},'Role updated');});
EXT.useredit=ds=>{AUTH.editUser=ds.id?JSON.parse(JSON.stringify(AUTH.users.find(u=>u.id===ds.id)||{})):{name:'',email:'',roles:{[S.team]:'head'}};};
EXT.usercancel=()=>{AUTH.editUser=null;};
function readUserForm(){
  const e=AUTH.editUser;const roles={};
  document.querySelectorAll('[data-urole]').forEach(el=>{if(el.value)roles[el.dataset.urole]=el.value;});
  return {id:e.id||'',name:val('u-name'),email:val('u-email'),admin:!!($('u-admin')&&$('u-admin').checked),roles};
}
EXT.usersave=()=>{
  const u=readUserForm();if(!u.name){say('Give the coach a name');return;}
  (async()=>{const r=await apiPost(Object.assign({kind:'user-save',user:u},creds()));
    if(r.ok){AUTH.editUser=null;say(u.name+' saved'+(u.id?'':'. Now give them a code or email.'));await loadAuthView();if(!u.id){AUTH.editUser=r.j.user;}}
    else say(r.j.error||'Couldn’t save');renderAll();})();
};
EXT.usercode=()=>{
  const nc=val('u-code');if(nc.length<6){say('Use at least 6 characters');return;}
  (async()=>{const r=await apiPost(Object.assign({kind:'user-code',id:AUTH.editUser.id,newCode:nc},creds()));say(r.ok?'Code set. Share it with the coach privately.':(r.j.error||'Couldn’t set the code'));await loadAuthView();})();
};
EXT.userdel=()=>{
  const id=AUTH.editUser&&AUTH.editUser.id;if(!id)return;
  if(!armed('udel'+id)){arm('udel'+id);return;}
  UI.arm=null;(async()=>{const r=await apiPost(Object.assign({kind:'user-del',id},creds()));AUTH.editUser=null;say(r.ok?'Coach removed':'Couldn’t remove');await loadAuthView();})();
};
EXT.backupnow=()=>{
  AUTH.busy=true;(async()=>{const r=await apiPost(Object.assign({kind:'backup-now'},creds()));AUTH.busy=false;say(r.ok?'Backed up':'Backup didn’t finish');await loadAuthView();})();
};
EXT.backupdl=()=>{
  const d=val('bk-date');(async()=>{const r=await apiGet('backup='+encodeURIComponent(d));
    if(r.ok)downloadFile('cottontown-backup-'+d+'.json',JSON.stringify(r.j,null,1),'application/json');else say('Couldn’t download that backup');})();
  return false;
};
EXT.restoregame=()=>{
  if(!armed('restore')){arm('restore');return;}
  UI.arm=null;const date=val('bk-date'),gid=val('bk-game');
  (async()=>{const r=await apiPost(Object.assign({kind:'restore-game',team:S.team,gid,date},creds()));
    say(r.ok?'Game restored from '+date:(r.j.error||'Couldn’t restore'));if(r.ok){SY.rev[gid]=0;UI.revert[gid]=true;try{applyServer(await getState(S.team));}catch(e){}}renderAll();})();
};

/* Switching teams: data loaded for the old team (coach list, history, backups, player card) must not show
   under the new one, where changing a role would apply it to the wrong team. */
switchTeam=(base=>async function(id){
  const v=AUTH.view;AUTH.coaches=null;AUTH.audit=null;AUTH.backups=null;AUTH.tcEdit=null;AUTH.editUser=null;
  if(typeof SEA!=='undefined')SEA.card=null;
  await base(id);
  if(v){AUTH.view=v;loadAuthView();}
})(switchTeam);
