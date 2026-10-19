# One-time edits that hook the new features into the ported tracker (public/js/app.js).
# Kept in the repo as a record of what changed from cottontown-club; safe to delete later.
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
R = []
def rep(a, b, n=1):
    R.append((a, b, n))

# --- sign-in aware permissions ---
rep("const myCode=()=>S.auth[S.team]||'';\nconst canEdit=()=>!SY.on||!!myCode();",
"""const myCode=()=>S.auth[S.team]||'';
/* Coaches can still use codes. Signing in (js/auth.js) is optional: a signed-in coach edits the teams they have a role on. */
const ME={user:null,favs:[],cfg:null};
const myRole=(team=S.team)=>{const u=ME.user;if(!S.sess||!u)return null;if(u.admin)return 'head';return (u.roles||{})[team]||null;};
const isAdmin=()=>!!(S.master||(S.sess&&ME.user&&ME.user.admin));
const isHead=()=>!!(myCode()||S.master||myRole()==='head');
const creds=()=>{const o={};const c=myCode()||S.master||'';if(c)o.code=c;if(S.sess)o.session=S.sess;return o;};
const authHeaders=()=>{const h={};const c=myCode()||S.master||'';if(c)h['x-code']=c;if(S.sess)h['x-session']=S.sess;return h;};
const canEdit=()=>!SY.on||!!myCode()||!!myRole();
/* A finished game locks on the server 2 hours after it went final. UI.unlock[gid] lets a head coach change it on purpose. */
const gameLocked=(gid=GC()&&GC().id)=>!!(gid&&SY.lock[gid]&&!UI.unlock[gid]);
const EXT={};""")
rep("const SY={on:false,ok:false,first:true,team:null,lastSent:{},rev:{},inflight:{},editT:{},savedAt:0,localAt:0};",
    "const SY={on:false,ok:false,first:true,team:null,lastSent:{},rev:{},inflight:{},editT:{},savedAt:0,localAt:0,lock:{}};")
rep("const UI={sel:null,", "const UI={unlock:{},revert:{},sel:null,")

# --- saving: send sign-in, handle a locked game ---
rep("const body=key==='cfg'?{kind:'config',team,config:obj,code:myCode()}:{kind:'game',team,gid:key,game:obj,code:myCode()};",
    "const body=key==='cfg'?Object.assign({kind:'config',team,config:obj},creds()):Object.assign({kind:'game',team,gid:key,game:obj,unlock:!!UI.unlock[key]},creds());")
rep("""    if(r.status===401){delete S.auth[team];saveLocal();say('Coach code was not accepted. This device is now view only.');rerender=true;}
    else if(r.status===403){SY.lastSent[key]='';say('Creating a team on the live site needs the main coach code.');rerender=true;}""",
"""    if(r.status===401){delete S.auth[team];if(S.sess&&!myRole()){S.sess='';ME.user=null;}saveLocal();say('Your sign-in or coach code wasn’t accepted. This device is now view only.');rerender=true;}
    else if(r.status===403||r.status===409){
      // Not allowed (role) or locked (finished game): put the server's copy back instead of retrying.
      const j=await r.json().catch(()=>({}));SY.rev[key]=0;if(key!=='cfg')UI.revert[key]=true;
      say(r.status===409?'This game is final and locked. Unlock it on the Players tab to change the result.':(j.error||'You can’t change that.'));rerender=true;}""")
rep("""    if(!sg||!sg.game){if(first)SY.lastSent[gc.id]='';return;}
    if(busy(gc.id))return;""",
"""    if(!sg||!sg.game){if(first)SY.lastSent[gc.id]='';return;}
    SY.lock[gc.id]=!!(sg.game.fullDone&&(!sg.doneAt||j.now-sg.doneAt>7200000));
    if(busy(gc.id))return;""")
rep("    const ng=first?JSON.parse(sv):mergeGame(JSON.parse(sv),ts.games[gc.id]);",
    "    const rv=UI.revert[gc.id];if(rv)delete UI.revert[gc.id];\n    const ng=(first||rv)?JSON.parse(sv):mergeGame(JSON.parse(sv),ts.games[gc.id]);")

# --- new-version check reads version.json (the version no longer lives in the page) ---
rep("""  try{const r=await fetch(location.pathname,{method:'HEAD',cache:'no-store'});const t=r.headers.get('etag')||r.headers.get('last-modified');if(!t)return;
    if(VER.tag===null){VER.tag=t;return;}if(t===VER.tag)return;VER.tag=t;
    const html=await fetch(location.pathname+'?v='+Date.now(),{cache:'no-store'}).then(x=>x.text());
    const m=html.match(/const APP_VER='([^']+)'/);if(m&&m[1]!==APP_VER){VER.ready=true;maybeReload();}}catch(e){}""",
"""  try{const j=await fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(x=>x.json());
    if(j&&j.v&&j.v!==APP_VER){VER.ready=true;maybeReload();}}catch(e){}""")

# --- "Load all teams" works for a signed-in admin too, and may change finished games on purpose ---
rep("  if(!code){say('Unlock with the main coach code first');return;}", "  if(!code&&!isAdmin()){say('Sign in as an admin or use the main coach code first');return;}")
rep("body:JSON.stringify(Object.assign({code},b))});\n  let added=0", "body:JSON.stringify(Object.assign({unlock:true},creds(),b))});\n  let added=0")
rep("if(canEdit()&&myCode())body.code=myCode();", "if(canEdit())Object.assign(body,creds());")
rep("JSON.stringify({kind:'setcode',team:S.team,code:myCode(),newCode:nc})", "JSON.stringify(Object.assign({kind:'setcode',team:S.team,newCode:nc},creds()))")

# --- feature files register actions in EXT; result-changing actions wait while a game is locked ---
rep("  switch(a){",
"""  if(EXT[a]){if(EXT[a](ds,g)!==false)renderAll();return;}
  if(g&&LOCK_ACTS.has(a)&&gameLocked()){say('This game is final and locked. Unlock it on the Players tab first.');renderHint();return;}
  switch(a){""")
rep("const VIEW_OK=new Set(", "const LOCK_ACTS=new Set(['goalus','goalthem','goalminus','goaldel','goalby','goalast','save','savedel','reset','reopen','play','adj','adjset','xt','endgame','ot','otcancel','pk','pkus','pkres','pkthem','pkundo','pkquick','apply','applyq','statgoal','undo']);\nconst VIEW_OK=new Set(")
rep("""    case 'reopen':""", """    case 'unlockgame':if(!isHead()){say('Only a head coach can unlock a finished game');break;}UI.unlock[GC().id]=true;say('Unlocked on this device. Changes to the result are saved.');break;
    case 'relock':delete UI.unlock[GC().id];say('Locked again');break;
    case 'reopen':""")
rep("  if(g.fullDone)h+=`<div class=\"ctx\">This game is final.",
    "  if(g.fullDone&&gameLocked())h+=`<div class=\"ctx\">This game is final and locked, so its score and subs can’t change by accident. <button class=\"btn small\" data-act=\"unlockgame\">Unlock to edit</button></div>`;\n  else if(g.fullDone&&UI.unlock[GC().id])h+=`<div class=\"ctx\">Unlocked on this device. <button class=\"btn small\" data-act=\"relock\">Lock again</button> <button class=\"btn small ${armed('reopen')?'danger-s armed':''}\" data-act=\"reopen\">${armed('reopen')?'Tap again to reopen':'Reopen game'}</button></div>`;\n  else if(g.fullDone)h+=`<div class=\"ctx\">This game is final.")

# --- new tabs: Practice and Season (coaches) ---
rep("['minutes','Minutes',''],['setup','Setup','']];", "['minutes','Minutes',''],['season','Season',''],['practice','Practice',''],['setup','Setup','']];")
rep("S.tab==='minutes'?renderMinutes():S.tab==='setup'?renderSetup():renderBench(d);",
    "S.tab==='minutes'?renderMinutes():S.tab==='season'?renderSeason():S.tab==='practice'?renderPractice():S.tab==='setup'?renderSetup():renderBench(d);")
rep("  h+=`<div class=\"card\"><h3>Sharing</h3>", "  h+=authSetupHTML();\n  h+=`<div class=\"card\"><h3>Sharing</h3>")

for a, b, n in R:
    c = s.count(a)
    assert c == n, (c, a[:80])
    s = s.replace(a, b)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('applied', len(R))
