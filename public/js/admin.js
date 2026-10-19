"use strict";
/* Club admin page (admins only): every team, every coach account, backups and change history.
   Head coaches manage their own team's coaches from Setup → Coaches instead. */
const ADM={open:false,view:'teams'};

function adminHTML(){
  if(!ADM.open)return '';
  if(!isAdmin())return `<div class="ovbg" data-act="adminclose"></div><div class="ovp adminp" role="dialog" aria-label="Club admin"><div class="sh"><b>Club admin</b><button class="btn small" data-act="adminclose">Close</button></div><p>Sign in as a club admin to see this page.</p></div>`;
  const views=[['teams','Teams'],['users','Coaches'],['backups','Backups'],['audit','Change history']];
  let h=`<div class="ovbg" data-act="adminclose"></div><div class="ovp adminp" role="dialog" aria-label="Club admin">
    <div class="sh"><div><b>Club admin</b><div class="fine">${esc(clubName())}</div></div><button class="btn small" data-act="adminclose">Close</button></div>
    <div class="seg">${views.map(([v,l])=>`<button data-act="adminview" data-v="${v}" aria-pressed="${ADM.view===v}">${l}</button>`).join('')}</div>`;
  if(ADM.view==='teams')h+=adminTeamsHTML();
  if(ADM.view==='users')h+=usersHTML();
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
OVERLAYS.unshift(adminHTML);

VIEW_OK.add('adminclose');
EXT.adminopen=()=>{NAV.open='';ADM.open=true;ADM.view='teams';if(!UI.teamList)loadTeamList().then(()=>renderAll());};
EXT.adminclose=()=>{ADM.open=false;AUTH.view='';};
EXT.adminview=ds=>{ADM.view=ds.v;AUTH.view=ds.v==='teams'?'':ds.v;AUTH.users=null;AUTH.backups=null;AUTH.audit=null;AUTH.editUser=null;if(AUTH.view)loadAuthView();};
EXT.adminteamcreate=()=>{ADM.open=false;createTeam();return false;};
document.addEventListener('change',e=>{
  if(e.target&&e.target.id==='adm-team'&&e.target.value!==S.team){
    const v=ADM.view;switchTeam(e.target.value).then(()=>{AUTH.view=v;AUTH.audit=null;AUTH.backups=null;loadAuthView();});
  }
});
