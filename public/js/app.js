"use strict";
/* Core game tracker, ported from cottontown-club. Feature files load after this one; js/main.js starts the app. */
const LOGO='assets/logo.jpg';
const GOAL_SONG='assets/goal-song.mp3';
const API='/api/state';
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- Formations ---------- */
const GK_=['GK','Keeper','GK',50,90];
const FORMS={
  '7v7':{
    '2-3-1':[GK_,['LB','Left back','DEF',30,70],['RB','Right back','DEF',70,70],['LM','Left mid','MID',17,46],['CM','Center mid','MID',50,49],['RM','Right mid','MID',83,46],['ST','Striker','FWD',50,21]],
    '3-2-1':[GK_,['LB','Left back','DEF',19,70],['CB','Center back','DEF',50,73],['RB','Right back','DEF',81,70],['LCM','Left center mid','MID',32,47],['RCM','Right center mid','MID',68,47],['ST','Striker','FWD',50,21]]
  },
  '9v9':{
    '3-3-2':[GK_,['LB','Left back','DEF',19,71],['CB','Center back','DEF',50,74],['RB','Right back','DEF',81,71],['LM','Left mid','MID',19,47],['CM','Center mid','MID',50,50],['RM','Right mid','MID',81,47],['LS','Left striker','FWD',32,22],['RS','Right striker','FWD',68,22]],
    '3-2-3':[GK_,['LB','Left back','DEF',19,71],['CB','Center back','DEF',50,74],['RB','Right back','DEF',81,71],['LCM','Left center mid','MID',33,50],['RCM','Right center mid','MID',67,50],['LW','Left wing','FWD',17,24],['ST','Striker','FWD',50,19],['RW','Right wing','FWD',83,24]]
  },
  '11v11':{
    '4-4-2':[['GK','Keeper','GK',50,91],['LB','Left back','DEF',13,71],['LCB','Left center back','DEF',37,75],['RCB','Right center back','DEF',63,75],['RB','Right back','DEF',87,71],['LM','Left mid','MID',13,46],['LCM','Left center mid','MID',37,50],['RCM','Right center mid','MID',63,50],['RM','Right mid','MID',87,46],['LS','Left striker','FWD',35,21],['RS','Right striker','FWD',65,21]],
    '4-3-3':[['GK','Keeper','GK',50,91],['LB','Left back','DEF',13,71],['LCB','Left center back','DEF',37,75],['RCB','Right center back','DEF',63,75],['RB','Right back','DEF',87,71],['LCM','Left center mid','MID',27,49],['CM','Center mid','MID',50,53],['RCM','Right center mid','MID',73,49],['LW','Left wing','FWD',15,23],['ST','Striker','FWD',50,19],['RW','Right wing','FWD',85,23]]
  }
};
const FORMATS=Object.keys(FORMS);
/* A formation's positions [{id,name,g,x,y}]. Pass a game to use the copy of the positions saved with it (so editing
   or deleting a team's own formation never changes a game already set up), or a key: '9v9/3-3-2' (built in) or
   '9v9/c-…' (one of this team's own formations, kept in its settings as `forms`). */
const FORMAT_N={'7v7':7,'9v9':9,'11v11':11};
const validFormDef=d=>Array.isArray(d)&&d.length>=4&&d.length<=11&&d.filter(p=>p&&p.g==='GK').length===1&&d.some(p=>p&&p.id==='GK')&&new Set(d.map(p=>p&&p.id)).size===d.length;
const customForm=id=>{const c=S&&S.T&&S.T[S.team]&&S.T[S.team].cfg;return c&&Array.isArray(c.forms)?c.forms.find(x=>x&&x.id===id)||null:null;};
function formOf(x){
  if(x&&typeof x==='object'){if(validFormDef(x.formDef))return x.formDef.map(p=>Object.assign({},p));x=x.form;}
  const [f,n]=String(x||'').split('/');
  if(FORMS[f]&&FORMS[f][n])return FORMS[f][n].map(a=>({id:a[0],name:a[1],g:a[2],x:a[3],y:a[4]}));
  const cf=customForm(n);if(cf&&validFormDef(cf.pos))return cf.pos.map(p=>Object.assign({},p));
  return FORMS['9v9']['3-3-2'].map(a=>({id:a[0],name:a[1],g:a[2],x:a[3],y:a[4]}));
}
/* Display name for a team's current formation. */
const formName=c=>{const cf=(c.forms||[]).find(x=>x.id===c.formation);return cf?cf.name:c.formation;};
const GROUPS=[['GK','GK'],['DEF','D'],['MID','M'],['FWD','F']];
const GNAME={GK:'Keeper',DEF:'Defense',MID:'Midfield',FWD:'Forward'};

/* ---------- Cottontown defaults ---------- */
const P9=['GK','LB','CB','RB','LM','CM','RM','LS','RS'];
const mk=rows=>rows.map(r=>{const a=r.trim().split(/\s+/);const o={};P9.forEach((p,i)=>o[p]=a[i]);return o;});
const G3PLAN=['sarah ainsley alexa spencer kadence vivi emmie df dm','sarah kennedy olivia emily hollis vivi emmie june dm','sarah ainsley olivia spencer kadence alexa emmie june df','dolly kennedy olivia emily kadence vivi hollis dm df','dolly ainsley alexa spencer emmie vivi hollis dm june','dolly kennedy alexa emily kadence olivia hollis df june'];
/* Game 3 rotation from the coach (Sun 10/18): Sarah 1st half, Dolly 2nd; every field player 40 min, one break per half,
   never two in a row; subs go straight into the spot of the player coming off, so nobody moves mid-game. */
const G3ROT=['sarah ainsley alexa spencer emmie vivi hollis df june', 'sarah emily olivia spencer kennedy vivi hollis dm june', 'sarah emily olivia ainsley kennedy alexa emmie dm df', 'dolly emily olivia spencer kennedy vivi hollis dm june', 'dolly ainsley alexa spencer emmie vivi hollis df june', 'dolly ainsley alexa emily emmie olivia kennedy df dm'];
const G3NOKAD=['sarah ainsley alexa spencer kennedy vivi emmie df dm','sarah kennedy olivia emily hollis vivi emmie june dm','sarah ainsley emily spencer olivia alexa emmie june df','dolly ainsley olivia emily kennedy vivi hollis dm df','dolly ainsley alexa spencer emmie vivi hollis dm june','dolly spencer alexa emily kennedy olivia hollis df june'];
/* Venue: Merrimack Soccer Complex. Map links go to the lot for each field number. */
/* City of Huntsville: fields 1-10 (grass) are on Triana Blvd, fields 11-18 (turf) are on Ivy Ave. */
const ADDR={a:'3501 Triana Blvd SW, Huntsville, AL 35805',b:'3217 Ivy Ave SW, Huntsville, AL 35805'};
const BAD_ADDR=['3251 Ivy Ave SW, Huntsville, AL 35805','2800 Drake Ave SW, Huntsville, AL 35805'];
function fieldAddr(f){const n=parseInt((String(f||'').match(/\d+/)||[''])[0],10);return !n?'':n<=10?ADDR.a:n<=18?ADDR.b:'';}
function addGame(c,gc){if(c.games.some(x=>x.id===gc.id))return;const i=c.games.findIndex(x=>!x.imported&&x.dt&&x.dt>gc.dt);if(i<0)c.games.push(gc);else c.games.splice(i,0,gc);}
function setResult(ts,gid,form,half,us,them){const st=ts.games[gid];if(st&&hasData(st))return false;ts.games[gid]=importedResult(form,half,us,them);ts.games[gid].goals.forEach((x,i)=>x.u='o'+gid+i);return true;}
const todayPlaces=c=>c.games.forEach(gc=>{if(gc.field&&!gc.place&&String(gc.dt).startsWith('2026-10-18'))gc.place=fieldAddr(gc.field);});
/* Game 1 vs Cullman as saved Sat 10/17 3:18 PM (it was reset by mistake at 12:09 AM Sun). */
const G1_BACKUP={"form":"9v9/3-3-2","avail":{"dm":true,"vivi":true,"june":true,"olivia":true,"spencer":true,"emmie":true,"hollis":true,"kennedy":true,"emily":true,"ainsley":true,"dolly":false,"kadence":false,"sarah":true,"alexa":true,"df":true},"half":30,"sub":10,"otLen":5,"otN":2,"events":[{"b":1,"t":511855,"pos":"LB","from":"ainsley","to":"spencer"},{"b":2,"t":525541,"pos":"LB","from":"spencer","to":"ainsley"},{"b":3,"t":587587,"pos":"LB","from":"ainsley","to":"spencer"},{"b":3,"t":587587,"pos":"CB","from":"alexa","to":"olivia"},{"b":3,"t":587587,"pos":"RB","from":"emily","to":"kennedy"},{"b":3,"t":587587,"pos":"LM","from":"hollis","to":"dm"},{"b":4,"t":743980,"pos":"CB","from":"olivia","to":"spencer"},{"b":4,"t":743980,"pos":"LB","from":"spencer","to":"olivia"},{"b":5,"t":1260604,"pos":"LB","from":"olivia","to":"spencer"},{"b":5,"t":1260604,"pos":"CB","from":"spencer","to":"ainsley"},{"b":5,"t":1260604,"pos":"RB","from":"kennedy","to":"emily"},{"b":5,"t":1260604,"pos":"CM","from":"vivi","to":"alexa"},{"b":5,"t":1260604,"pos":"RM","from":"emmie","to":"hollis"},{"b":6,"t":1280437,"pos":"CB","from":"ainsley","to":"spencer"},{"b":6,"t":1280437,"pos":"LB","from":"spencer","to":"ainsley"},{"b":7,"t":1800000,"pos":"LB","from":"ainsley","to":"kennedy"},{"b":7,"t":1800000,"pos":"CB","from":"spencer","to":"olivia"},{"b":7,"t":1800000,"pos":"RB","from":"emily","to":"ainsley"},{"b":7,"t":1800000,"pos":"CM","from":"alexa","to":"vivi"},{"b":7,"t":1800000,"pos":"RM","from":"hollis","to":"emmie"},{"b":7,"t":1800000,"pos":"LS","from":"df","to":"spencer"},{"b":8,"t":2475730,"pos":"LB","from":"kennedy","to":"emily"},{"b":8,"t":2475730,"pos":"CB","from":"olivia","to":"alexa"},{"b":8,"t":2475730,"pos":"LM","from":"dm","to":"hollis"},{"b":8,"t":2475730,"pos":"RM","from":"emmie","to":"kennedy"},{"b":8,"t":2475730,"pos":"LS","from":"spencer","to":"emmie"},{"b":8,"t":2475730,"pos":"RS","from":"june","to":"df"},{"b":9,"t":2506845,"pos":"LS","from":"emmie","to":"kennedy"},{"b":9,"t":2506845,"pos":"RM","from":"kennedy","to":"emmie"},{"b":10,"t":2525749,"pos":"LS","from":"kennedy","to":"june"},{"b":11,"t":2585761,"pos":"RS","from":"df","to":"dm"},{"b":12,"t":3051951,"pos":"RB","from":"ainsley","to":"spencer"},{"b":12,"t":3051951,"pos":"CM","from":"vivi","to":"olivia"},{"b":12,"t":3051951,"pos":"RM","from":"emmie","to":"kennedy"},{"b":13,"t":3063972,"pos":"LM","from":"hollis","to":"df"},{"b":14,"t":3112804,"pos":"RB","from":"spencer","to":"june"},{"b":14,"t":3112804,"pos":"LS","from":"june","to":"spencer"},{"b":15,"t":3125713,"pos":"RB","from":"june","to":"vivi"},{"b":16,"t":3155483,"pos":"CM","from":"olivia","to":"vivi"},{"b":16,"t":3155483,"pos":"RB","from":"vivi","to":"olivia"},{"b":17,"t":3175576,"pos":"LB","from":"emily","to":"ainsley"}],"goals":[{"side":"us","t":590787,"by":"june","ast":"dm"},{"side":"them","t":1285807,"gk":"sarah"},{"side":"us","t":1800000,"by":"june","ast":"dm"},{"side":"us","t":3133618,"by":"alexa","ast":null},{"side":"them","t":3447083,"gk":"sarah"}],"saves":[{"t":2280888,"gk":"sarah"},{"t":2284009,"gk":"sarah"}],"acc":3525134,"running":false,"runStart":1792257817865,"started":true,"halfDone":true,"fullDone":true,"stops":[1800000,3600000],"alerted":[1,2,3,4,5],"pending":null,"batch":17,"ot":null,"pk":null,"start":{"GK":"sarah","LB":"ainsley","CB":"alexa","RB":"emily","LM":"hollis","CM":"vivi","RM":"emmie","LS":"df","RS":"june"},"plan":[{"GK":"sarah","LB":"ainsley","CB":"alexa","RB":"emily","LM":"hollis","CM":"vivi","RM":"emmie","LS":"df","RS":"june"},{"GK":"sarah","LB":"spencer","CB":"olivia","RB":"kennedy","LM":"dm","CM":"vivi","RM":"emmie","LS":"df","RS":"june"},{"GK":"sarah","LB":"spencer","CB":"ainsley","RB":"emily","LM":"dm","CM":"alexa","RM":"hollis","LS":"df","RS":"june"},{"GK":"sarah","LB":"kennedy","CB":"olivia","RB":"ainsley","LM":"dm","CM":"vivi","RM":"emmie","LS":"spencer","RS":"june"},{"GK":"sarah","LB":"emily","CB":"alexa","RB":"ainsley","LM":"hollis","CM":"vivi","RM":"kennedy","LS":"emmie","RS":"df"},{"GK":"sarah","LB":"emily","CB":"alexa","RB":"spencer","LM":"hollis","CM":"olivia","RM":"kennedy","LS":"june","RS":"dm"}],"stats":[]};
function newTeam(id,name,short,sub,format,formation,half,roster,games,results){
  const ids={};const players=roster.map(([num,nm2,grp])=>{let pid=nm2.toLowerCase().replace(/[^a-z]/g,'');while(ids[pid])pid+='2';ids[pid]=1;return {id:pid,name:nm2,num,gr:grp?[grp]:[]};});
  const form=format+'/'+formation;const st={};
  const gs=games.map(([gid,title,opp,dt,field,res])=>{if(res)st[gid]=importedResult(form,half,res[0],res[1]);return {id:gid,title,opp,dt,field,place:dt.startsWith('2026-10-18')?fieldAddr(field):'',half,sub:10,out:[],imported:!!res};});
  Object.values(st).forEach((g,i)=>g.goals.forEach((x,j)=>x.u='n'+id.length+i+'_'+j));
  return {cfg:fixCfg({id,name,short,sub,logo:LOGO,song:true,format,formation,players,games:gs}),games:st};
}
const NEW_TEAMS={
  'cottontown-2015':()=>newTeam('cottontown-2015','Cottontown United 2015','Cottontown 2015','U12 Boys','9v9','3-3-2',30,
    [['4','Brooks'],['24','Cohen'],['1','Caleb'],['6','Hudson'],['2','Julian'],['5','Austin'],['18','Thomas'],['11','Brandon'],['15','Jacob'],['10','Noah'],['29','Henry'],['8','Foster'],['3','Jett'],['19','Hugo'],['7','Elijah']],
    [['s1','CSA U12','CSA U12','2026-10-17T09:45','Field 9',[4,0]],['s2','Vero Premier','Vero FC Athletic SC AL 2014/15B Premier','2026-10-17T14:45','Field 13B',[3,5]],
     ['s3','Semi-final','FC National U12 Boys','2026-10-18T09:45','Field 13A']]),
  'cottontown-boys-white':()=>newTeam('cottontown-boys-white','Cottontown United Boys - White','Cottontown White','U16 Boys','11v11','4-4-2',40,
    [['9','Landon','MID'],['38','Mateo'],['12','Anthony'],['16','Axel'],['11','Alex'],['6','Tony'],['22','Richarma'],['37','Rodrigo'],['7','Brandon','DEF'],['5','Eliseo'],['17','Jose'],['2','Cade'],['16','Walker'],['4','Jaxon','DEF'],['3','Kaden','DEF'],['10','Victor']],
    [['s1','FC National','FC National 2011B','2026-10-17T08:00','Field 17',[6,0]],['s2','Vero Premier','Vero FC Athletic SC AL 10/11B Premier','2026-10-17T11:15','Field 7',[8,1]],
     ['s3','Semi-final','Vero FC Athletic SC AL 10/11B Premier','2026-10-18T08:00','Field 18']]),
  'cottontown-boys-red':()=>newTeam('cottontown-boys-red','CottonTown United Boys Red','Cottontown Red','U18 Boys','11v11','4-4-2',45,
    [['26','Rylan'],['19','Hector'],['27','Jenelson'],['31','Luis'],['13','Kevin'],['88','Cayden'],['1','Jacob'],['14','Daniel'],['30','Gabriel'],['21','William'],['8','Bryan'],['66','Owen'],['20','Cruz'],['18','Henry'],['2','David'],['33','Maiky'],['77','Kolbi']],
    [['s1','Columbus United','Columbus United 2009/10 Boys','2026-10-17T11:15','Field 15',[0,6]],['s2','STUN SC','U18 (08-10) Boys STUN SC','2026-10-17T14:45','Field 6',[2,3]],
     ['s3','Consolation','Vero FC NASC 09/10B Elite','2026-10-18T11:15','Field 15']])
};
function cottonDefault(){return {id:'cottontown',name:'Cottontown United',short:'Cottontown',sub:'Girls 2014/15',logo:LOGO,song:true,format:'9v9',formation:'3-3-2',
  players:[
    {id:'dm',name:'Daleyza M',role:'Striker, outside mid',gr:['FWD','MID']},
    {id:'vivi',name:'Vivi',role:'CM, CB',gr:['MID','DEF']},
    {id:'june',name:'June',role:'Striker',gr:['FWD']},
    {id:'olivia',name:'Olivia',role:'CB, CM',gr:['DEF','MID']},
    {id:'spencer',name:'Spencer',role:'Outside back, CB',gr:['DEF']},
    {id:'emmie',name:'Emmie',role:'Outside mid, striker',gr:['MID','FWD']},
    {id:'hollis',name:'Hollis',role:'Outside mid',gr:['MID']},
    {id:'kennedy',name:'Kennedy',role:'Outside back, outside mid',gr:['DEF','MID']},
    {id:'emily',name:'Emily',role:'Outside back',gr:['DEF']},
    {id:'ainsley',name:'Ainsley',role:'Outside back',gr:['DEF']},
    {id:'dolly',name:'Dolly',role:'Keeper',gr:['GK']},
    {id:'kadence',name:'Kadence',role:'Outside mid, CM',gr:['MID']},
    {id:'sarah',name:'Sarah',role:'Keeper',gr:['GK'],guest:true},
    {id:'alexa',name:'Alexa',role:'CM, CB',gr:['MID','DEF'],guest:true},
    {id:'df',name:'Daleyza F',role:'Striker, outside mid',gr:['FWD','MID'],guest:true}],
  games:[
    {id:'g1',title:'Game 1',opp:'Cullman United 14/16 Girls',dt:'2026-10-17T11:15',field:'Field 12A',place:'',half:30,sub:10,out:['kadence','dolly'],plan:mk([
      'sarah ainsley alexa emily hollis vivi emmie df spencer','sarah ainsley olivia kennedy dm vivi emmie df june','sarah spencer olivia emily dm alexa hollis df june',
      'sarah kennedy olivia ainsley dm vivi emmie spencer june','sarah emily alexa ainsley hollis vivi kennedy emmie df','sarah emily alexa spencer hollis olivia kennedy june dm'])},
    {id:'g2',title:'Game 2',opp:'Vero FC Athletic SC AL 2014/15G Elite',dt:'2026-10-17T18:00',field:'Field 13A',place:'',half:30,sub:10,out:['vivi','kadence','kennedy'],plan:mk([
      'dolly ainsley spencer emily emmie alexa df june dm','dolly ainsley spencer emily hollis olivia df june dm','dolly ainsley spencer emily hollis alexa emmie june dm',
      'sarah ainsley olivia emily hollis alexa emmie df dm','sarah ainsley olivia spencer hollis alexa emmie df june','sarah emily olivia spencer hollis alexa emmie dm june'])},
    {id:'g3',title:'Game 3',opp:'Vero FC NASC U12G Select',dt:'2026-10-18T09:45',field:'Field 12B',place:'',half:30,sub:10,out:[],plan:mk(G3PLAN)},
    {id:'g4',title:'Final',opp:'',dt:'',when:'Sun',field:'',place:'',half:30,sub:10,out:[],note:'Opponent and field to be set',plan:mk(G3PLAN)}
  ]};}

/* ---------- Storage ---------- */
const KEY='subtracker-v2',OLDKEY='cottontown-subtracker-v1';
const UI={unlock:{},revert:{},sel:null,msg:'',msgT:0,adj:false,pick:null,win:undefined,goal:null,pk:null,arm:null,teamList:null,newTeam:false,ntFmt:'9v9',lastUs:undefined,lastKey:''};
let S=null;
function fixCfg(c){
  c.players=Array.isArray(c.players)?c.players:[];c.games=Array.isArray(c.games)?c.games:[];
  c.players.forEach(p=>{if(!Array.isArray(p.gr))p.gr=[];});
  if(!FORMS[c.format])c.format='9v9';
  c.forms=Array.isArray(c.forms)?c.forms.filter(f=>f&&typeof f.id==='string'&&FORMS[f.format]&&validFormDef(f.pos)):[];
  if(!FORMS[c.format][c.formation]&&!c.forms.some(f=>f.id===c.formation&&f.format===c.format))c.formation=Object.keys(FORMS[c.format])[0];
  if(!c.games.length)c.games.push({id:'g1',title:'Game 1',opp:'',dt:'',field:'',place:'',half:30,sub:10,out:[]});
  return c;
}
function fixGame(g){
  if(!g.form)g.form='9v9/3-3-2';
  ['events','goals','saves','alerted','stats'].forEach(k=>{if(!Array.isArray(g[k]))g[k]=[];});
  if(!g.avail)g.avail={};if(!g.half)g.half=30;if(!g.sub)g.sub=10;if(!g.start)g.start={};if(!g.batch)g.batch=0;
  if(!Array.isArray(g.plan))g.plan=[];
  if(!Array.isArray(g.stops)){g.stops=[];const H=g.half*60000;if(g.halfDone)g.stops.push(H);if(g.fullDone)g.stops.push(2*H);}
  if(!g.otLen)g.otLen=5;if(!g.otN)g.otN=2;if(g.ot===undefined)g.ot=null;if(g.pk===undefined)g.pk=null;
  if(g.pending===undefined)g.pending=null;
  if(!Array.isArray(g.xt))g.xt=[];if(!Array.isArray(g.queue))g.queue=[];if(!Array.isArray(g.pkOrder))g.pkOrder=[];if(!Array.isArray(g.del))g.del=[];
  ['goals','stats','saves'].forEach(k=>{const seen={};g[k].forEach(x=>{if(x&&!x.u){const b=k[0]+hashStr(JSON.stringify(x));seen[b]=(seen[b]||0)+1;x.u=b+'.'+seen[b];}});});
  return g;
}
function hashStr(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36);}
/* Game data (goals, stats, saves, subs, clock) is the coaches' record.
   App updates and migrations must never replace or clear a game that has data.
   Use hasData() before touching a game, and once() so a fix runs a single time. */
const hasData=g=>!!g&&(g.started||g.goals.length||g.stats.length||g.saves.length||g.events.length);
/* Rotation plan is a team setting, off unless a coach turns it on in Setup. Off works like the per-game
   "plan off": sub alerts still sound and the coach lines up who goes in. */
const usePlan=()=>!!(CFG()&&CFG().usePlan);
const pOff=g=>!!g.planOff||!usePlan();
const POSOF=(b,id)=>Object.keys(b).find(k=>b[k]===id);
function once(c,id,fn){c.fixes=Array.isArray(c.fixes)?c.fixes:[];if(c.fixes.includes(id))return false;fn();c.fixes.push(id);return true;}
/* Each goal, stat and save has an id (u) and removals are remembered in del,
   so two devices saving the same game merge instead of overwriting each other. */
const itemKey=x=>JSON.stringify(Object.keys(x).filter(a=>a!=='u').sort().map(a=>[a,x[a]]));
function mergeGame(srv,loc){
  if(!loc||!srv)return srv;
  const del=new Set([...(srv.del||[]),...(loc.del||[])]);
  // A local item missing from the server but identical to one already there is a stale copy
  // (e.g. from before a restore), so it isn't added twice. Real repeats on the server are kept.
  ['goals','stats','saves'].forEach(k=>{const have=new Set(srv[k].map(x=>x.u));const cnt={};
    srv[k].forEach(x=>{const q=itemKey(x);cnt[q]=(cnt[q]||0)+1;});
    const extra=loc[k].filter(x=>{if(have.has(x.u)||del.has(x.u))return false;const q=itemKey(x);if(cnt[q]>0){cnt[q]--;return false;}return true;});
    srv[k]=srv[k].concat(extra).filter(x=>!del.has(x.u)).sort((a,b)=>a.t-b.t);});
  srv.del=[...del];return srv;
}
function dropItem(g,k,i){const x=g[k].splice(i,1)[0];if(x&&x.u&&!g.del.includes(x.u))g.del.push(x.u);return x;}

/* ---------- Built-in club teams ---------- */
function team1314(){
  const P=[['baylor','Baylor','21'],['julianna','Julianna','13'],['whitlee','Whitlee','17'],['kennedy','Kennedy','18'],['reid','Reid','6'],['molly','Molly','88'],
    ['evangeline','Evangeline','20'],['madison','Madison','10'],['lilian','Lilian','7'],['mya','Mya','67'],['anna','Anna','11'],['layla','Layla','2'],
    ['mayme','Mayme','19'],['emma','Emma','76'],['jacqueline','Jacqueline','12'],['ellysen','Ellysen','27'],['mackenzie','Mackenzie','22'],['nora','Nora','99']];
  const gm=(id,title,opp,dt,field)=>({id,title,opp,dt,field,place:'',half:35,sub:10,out:[]});
  return {id:'cottontown-1314-girls',name:'Cottontown United 13/14 Girls',short:'Cottontown 13/14',sub:'U14 Girls, Green #21 (AL)',logo:LOGO,song:true,format:'11v11',formation:'4-4-2',
    players:P.map(([id,name,num])=>({id,name,num,gr:[]})),
    games:[gm('g1','Vero FC','Vero FC U13G DPL','2026-10-17T08:00','Field 6'),
      gm('g2','NASC','NASC 2012/2013 Girls Elite','2026-10-17T11:15','Field 4'),
      gm('g3','CRWA Red','CRWA Red G2012/13','2026-10-24T08:00','RSSC 09'),
      gm('g4','NUSA Gold','NUSA G12/13 U14 Gold','2026-10-24T14:00','Bethesda #1'),
      gm('g5','TSC Williamson','TSC U14 (2012/2013) Williamson Girls Select','2026-10-25T09:00','')]};
}
function team1617(){
  const P=[['paisley','Paisley','21'],['daisy','Daisy','6'],['stella','Stella','7'],['marlee','Marlee','16'],['andie','Andie','5'],['lexie','Lexie','19'],
    ['madeleine','Madeleine','2'],['penelope','Penelope','10'],['lacey','Lacey','14'],['annabelle','Annabelle','8'],['aubrey','Aubrey','15']];
  const gm=(id,title,opp,dt,field,imp)=>({id,title,opp,dt,field,place:'',half:25,sub:10,out:[],imported:!!imp});
  return {id:'cottontown-1617-girls',name:'Cottontown United 16/17 Girls',short:'Cottontown 16/17',sub:'U10 Girls',logo:LOGO,song:true,format:'7v7',formation:'2-3-1',
    players:P.map(([id,name,num])=>({id,name,num,gr:[]})),
    games:[gm('r1','Bah Blau','Bah U10g Blau','2026-08-29T09:15','SHAC',1),
      gm('r2','SYSA Storm','SYSA Storm U10 Girls Purple','2026-08-29T13:15','SHAC #4D',1),
      gm('r3','VHSC Attack','VHSC U10 Attack Copa','2026-08-30T08:00','SHAC #4B',1),
      gm('g1','FC United','FC United','2026-10-17T08:00','Field 11C'),
      gm('g2','Alabaster Navy','Afc U10g Alabaster Academy Navy','2026-10-17T10:45','Field 11C')]};
}
function team1718(){
  const P=[['kinsley','Kinsley','22'],['amelia','Amelia','13'],['sloane','Sloane','7'],['kylie','Kylie','16'],['coralee','Coralee','11'],
    ['chesney','Chesney','12'],['hensley','Hensley','5'],['liliana','Liliana','10'],['violet','Violet',''],['lucy','Lucy','6']];
  const gm=(id,title,opp,dt,field,imp)=>({id,title,opp,dt,field,place:'',half:25,sub:10,out:[],imported:!!imp});
  return {id:'cottontown-1718-girls',name:'Cottontown United 17/18 Girls',short:'Cottontown 17/18',sub:'U9 Girls',logo:LOGO,song:true,format:'7v7',formation:'2-3-1',
    players:P.map(([id,name,num])=>({id,name,num,gr:[]})),
    games:[gm('r1','AYSO United','AYSO United 17G -Spring 25\u2019','2026-05-16T09:30','Field 8A 7v7',1),
      gm('r2','Columbia FC','Columbia FC 2017G','2026-05-16T14:00','Field 11D 7v7',1),
      gm('r3','Rampage','Rampage 2017G','2026-05-17T11:00','Field 11D 7v7',1),
      gm('r4','Bah Blau','Bah U9g Blau','2026-08-29T12:00','SHAC #4A',1),
      gm('r5','VHSC Attack','VHSC U9 Attack Copa','2026-08-29T17:15','SHAC #4C',1),
      gm('r6','SYSA Storm','SYSA Storm U9G Purple','2026-08-30T10:30','SHAC #4B',1),
      gm('r7','OMSC Mambas','OMSC Mambas U9/U8G','2026-09-26T08:40','3 Acre Field #6',1),
      gm('r8','AL Rush','AL Rush RBC Academy Girls 17-18','2026-09-26T12:10','MBHS 7v7 B',1),
      gm('r9','AL Rush','AL Rush RBC Academy Girls 17-18','2026-09-27T13:20','Brock A',1),
      gm('g1','Vero Academy','Vero FC Athletic SC AL 2017/18G Academy','2026-10-17T12:00','Field 11B'),
      gm('g2','Vero Courage','Vero FC NASC U9G Courage','2026-10-17T16:15','Field 11C')]};
}
const OPP_LOGOS={"cullman": "assets/opp/cullman.jpg", "vero": "assets/opp/vero.jpg", "alfc": "assets/opp/alfc.jpg", "nasc": "assets/opp/nasc.jpg"};
function libLogo(name){const n=String(name||'');if(/cullman/i.test(n))return OPP_LOGOS.cullman;if(/nasc|north alabama/i.test(n))return OPP_LOGOS.nasc;
  if(/vero/i.test(n))return OPP_LOGOS.vero;if(/alabaster|alabama fc south/i.test(n)||(/\bafc\b/i.test(n)&&!/huntsville|hsv/i.test(n)))return OPP_LOGOS.alfc;return '';}
const oppLogoOf=gc=>(gc&&(gc.oppLogo||libLogo(gc.opp)))||'';
const logoImg=(src,cls)=>src?`<img class="${cls}" src="${esc(src)}" alt="">`:'';
const CU_HISTORY=[
 ['h01','2025-03-22T09:30','NUSA Spring Hill 14G','Merrimack 12N',2,3],['h02','2025-03-22T14:15','AYSO United G2014 Premier','Merrimack 13N',0,8],
 ['h03','2025-03-23T11:00','NUSA Spring Hill 14G','Merrimack 13N',1,8],['h04','2025-04-12T09:00','Fredericksburg FC Ffc 01 Red','Jack Allen (11v11)',0,9],
 ['h05','2025-04-12T16:00','Madison Blaze 2014G Inferno','Jack Allen (11v11)',0,11],['h06','2025-04-13T08:00','Purple Rain 2014b Purple','Jack Allen (9v9)',0,9],
 ['h07','2025-04-13T14:00','Midsouth Bartlett 2014b','Jack Allen Field #6',0,11],['h08','2025-04-26T12:15','North Alabama SC NASC Gravity 15G','Merrimack rimac14 SW',0,5],
 ['h09','2025-04-26T15:15','Kha1 Murfreesboro G2015','Merrimack rimac14 NW',0,8],['h10','2025-04-27T09:00','AYSO United G2015 Navy','Merrimack rimac14 SW',0,0],
 ['h11','2026-02-22T00:00','AYSO United G2015 Premier','',0,3],['h12','2026-03-14T10:40','AFC 2014 Select 2','Hoover Met Turf 03A',1,1],
 ['h13','2026-03-14T14:40','AL Lady Rush RBC 14 Black','Grass 9v9 A',0,4],['h14','2026-03-15T08:00','GSA South 14G Red','Grass 9v9 B',0,5],
 ['h15','2026-04-18T12:30','Briarwood Gold 15','SHAC #3A',2,3],['h16','2026-04-18T17:00','VHSC Attack 16 Surf CEN','SHAC #3B',0,4],
 ['h17','2026-04-19T09:30','Auburn Soccer Club 2016G Blue','SHAC #3A',0,2],['h18','2026-09-12T10:40','TSC 14/15 Williamson Select','Bethesda #3',3,2],
 ['h19','2026-09-12T17:20','TSC Nashville 2014/15 Girls','WCSC Downs West #23B',0,1],['h20','2026-09-13T11:40','U11/12 TSC Murfreesboro Elite','Crockett Park #9B',5,0],
 ['h21','2026-09-13T15:30','TSC 14/15 Williamson Select','Crockett Park #4A',5,3],['h22','2026-09-26T11:30','2015 Lady Lobos Rush Red','Hoover Met Turf 02B',1,8],
 ['h23','2026-09-26T15:30','AFC Alabaster U12G Premier','Hoover Met Turf 03A',1,5],['h24','2026-09-27T08:50','Homewood Red 2014-2015 Girls','Hoover Met Turf 03B',1,3]];
function migrateTeam(id,ts){
  if(!ts||!ts.cfg)return false;let ch=false;const c=ts.cfg;
  if(once(c,'place-fix-2026-10-18',()=>c.games.forEach(gc=>{if(BAD_ADDR.includes(gc.place))gc.place=fieldAddr(gc.field);})))ch=true;
  if(id==='cottontown'){
    if(c.name==='Cottontown United'){c.name='Cottontown United Girls Development';ch=true;}
    const NUMS={sarah:'2',kennedy:'31',alexa:'89',kadence:'11',spencer:'30',ainsley:'12',hollis:'99',vivi:'4',june:'44',olivia:'22',dolly:'15',emmie:'13',emily:'6',dm:'26',df:'18'};
    if(c.numsVer!==2){c.players.forEach(p=>{if(NUMS[p.id])p.num=NUMS[p.id];});c.numsVer=2;ch=true;}
    // Kadence out Sun 10/18: Game 3 and the Final. Her LM spots go to the players who had 3 blocks, so every field player has 4.
    if(once(c,'kadence-out-2026-10-18',()=>{const was=JSON.stringify(mk(G3PLAN)),np=mk(G3NOKAD);
      ['g3','g4'].forEach(gid=>{const gc=c.games.find(x=>x.id===gid);if(!gc)return;
        gc.out=Array.isArray(gc.out)?gc.out:[];if(!gc.out.includes('kadence'))gc.out.push('kadence');
        if(JSON.stringify(gc.plan)===was)gc.plan=mk(G3NOKAD);
        const st=ts.games[gid];if(!st||hasData(st))return;
        st.avail.kadence=false;if(JSON.stringify(st.plan)===was){st.plan=np.map(b=>Object.assign({},b));st.start=Object.assign({},st.plan[0]);}});}))ch=true;
    // Hollis starts over Emmie in Game 2 (Sat 10/17). Swap their 0-10 and 10-20 spots so both keep the same minutes.
    if(once(c,'hollis-starts-g2-2026-10-17',()=>{const st=ts.games.g2;if(!st||hasData(st)||st.plan.length<2)return;const b0=st.plan[0],b1=st.plan[1];
      const p0=POSOF(b0,'emmie'),p1=POSOF(b1,'hollis');if(!p0||POSOF(b0,'hollis'))return;
      const was=JSON.stringify(st.start)===JSON.stringify(b0);b0[p0]='hollis';
      if(p1&&!POSOF(b1,'emmie'))b1[p1]='emmie';
      st.avail.hollis=true;if(was)st.start=Object.assign({},b0);}))ch=true;
    // Sun 10/18: restore Game 1 (reset by mistake), put Game 3's clock back (started by mistake Sat night), add map links.
    if(once(c,'restore-g1-2026-10-18',()=>{const st=ts.games.g1;if(st&&(st.started||st.goals.length||st.events.length||st.saves.length))return;
      const r=fixGame(JSON.parse(JSON.stringify(G1_BACKUP)));r.goals.forEach((x,i)=>x.u='rg'+i);r.saves.forEach((x,i)=>x.u='rv'+i);r.del=[];ts.games.g1=r;}))ch=true;
    if(once(c,'g3-clock-reset-2026-10-18',()=>{const st=ts.games.g3;if(!st||!st.started||st.events.length||st.goals.length||st.stats.length||st.saves.length||st.acc>5*60000)return;
      if(!st.runStart||st.runStart>Date.parse('2026-10-18T05:00:00Z'))return; // only the accidental start Saturday night
      Object.assign(st,{started:false,running:false,acc:0,runStart:0,stops:[],alerted:[],halfDone:false,fullDone:false,pending:null,xt:[]});}))ch=true;
    if(once(c,'places-2026-10-18',()=>todayPlaces(c)))ch=true;
    // Game 1 picked up a second copy of every goal and save from a device holding the pre-reset game (12:46 AM).
    if(once(c,'g1-dedupe-2026-10-18',()=>{const st=ts.games.g1;if(!st)return;
      [['goals','rg'],['saves','rv']].forEach(([k,pre])=>{const keys=new Set(st[k].filter(x=>String(x.u).startsWith(pre)).map(itemKey));
        st[k]=st[k].filter(x=>{if(String(x.u).startsWith(pre)||!keys.has(itemKey(x)))return true;if(x.u&&!st.del.includes(x.u))st.del.push(x.u);return false;});});}))ch=true;
    if(once(c,'g3-rotation-2026-10-18',()=>{const st=ts.games.g3;const gc=c.games.find(x=>x.id==='g3');const np=mk(G3ROT);
      if(gc)gc.plan=mk(G3ROT);if(!st||hasData(st))return;st.plan=np.map(b=>Object.assign({},b));st.start=Object.assign({},st.plan[0]);
      Object.keys(st.avail).forEach(k=>{if(k!=='kadence'&&np.some(b=>Object.values(b).includes(k)))st.avail[k]=true;});}))ch=true;
    if(once(c,'useplan-dev-2026-10-18',()=>{if(c.usePlan===undefined)c.usePlan=true;}))ch=true;
    if(once(c,'final-text-2026-10-18',()=>{const gc=c.games.find(x=>x.id==='g4');if(gc&&/if we advance/i.test(gc.when||''))gc.when='Sun';}))ch=true;
    CU_HISTORY.forEach(([gid,dt,opp,field,us,them])=>{
      if(!c.games.some(x=>x.id===gid)){c.games.push({id:gid,title:opp.split(' ').slice(0,2).join(' '),opp,dt,field,place:'',half:30,sub:10,out:[],imported:true});ch=true;}
      if(!ts.games[gid]){ts.games[gid]=importedResult('9v9/3-3-2',30,us,them);ch=true;}});
  }
  if(id==='cottontown-1314-girls'&&once(c,'official-2026-10-18',()=>{
      // Official result vs Vero: Cottontown 2, Vero 3 (tracker had 3-1 typed in by hand).
      const st=ts.games.g1;if(st){const gl=st.goals,us=gl.filter(x=>x.side==='us').length,th=gl.filter(x=>x.side==='them').length;
        if(us===3&&th===1&&gl.every(x=>!x.by)){gl.forEach(x=>{if(x.u&&!st.del.includes(x.u))st.del.push(x.u);});const t=gl[0]?gl[0].t:0;
          st.goals=[0,1].map(i=>({side:'us',t,u:'og1u'+i})).concat([0,1,2].map(i=>({side:'them',t,u:'og1t'+i})));}}
      addGame(c,{id:'s1',title:'FC Montgomery',opp:'FC Montgomery N1 Girls 2013-2014 AL',dt:'2026-10-18T11:15',field:'Field 4',place:'',half:35,sub:10,out:[]});
      todayPlaces(c);}))ch=true;
  if(id==='cottontown-1617-girls'&&once(c,'official-2026-10-18',()=>{
      addGame(c,{id:'s1',title:'Final',opp:'Vero FC Athletic SC AL 2016/17G Academy Elite',dt:'2026-10-18T12:00',field:'Field 11A',place:'',half:25,sub:10,out:[]});todayPlaces(c);}))ch=true;
  if(id==='cottontown-1718-girls'&&once(c,'official-2026-10-18',()=>{
      [['g1',0,1],['g2',1,2]].forEach(([gid,a,b])=>{const gc=c.games.find(x=>x.id===gid);if(gc&&setResult(ts,gid,'7v7/2-3-1',gc.half||25,a,b))gc.imported=true;});
      addGame(c,{id:'s1',title:'Consolation',opp:'Camp Forest Chaos',dt:'2026-10-18T09:15',field:'Field 11B',place:'',half:25,sub:10,out:[]});todayPlaces(c);}))ch=true;
  if(id==='cottontown-1314-girls'){const fc=c.games.find(x=>x.id==='g1');const st=ts.games.g1;
    if(fc&&!fc.resultSet&&(!st||!st.started)){ts.games.g1=importedResult('11v11/4-4-2',35,2,3);fc.imported=true;fc.resultSet=true;ch=true;}}
  if(id==='cottontown-1617-girls'){const r=c.games.find(x=>x.id==='r1');if(r&&r.opp==='BAU U10G Blau'){r.opp='Bah U10g Blau';r.title='Bah Blau';ch=true;}
    const fc=c.games.find(x=>x.id==='g1');const st=ts.games.g1;
    if(fc&&!fc.resultSet&&(!st||!st.started)){ts.games.g1=importedResult('7v7/2-3-1',25,10,0);fc.imported=true;fc.resultSet=true;ch=true;}}
  /* KICKS Invitational, Sun 10/18: official results from SincSports and how each team placed. */
  const KICKS='KICKS Invitational';
  const place=label=>{if(!c.placing||c.placing.event!==KICKS)c.placing={event:KICKS,label};};
  const reset=(st,goals)=>{['goals','saves','stats'].forEach(k=>{});st.goals.forEach(x=>{if(x.u&&!st.del.includes(x.u))st.del.push(x.u);});st.goals=goals;};
  if(id==='cottontown'&&once(c,'kicks-final-2026-10-18',()=>{
      const gc=c.games.find(x=>x.id==='g4');
      if(gc)Object.assign(gc,{title:'Final',opp:'Vero FC NASC U12G Select',dt:'2026-10-18T13:00',field:'Field 13B',place:fieldAddr('Field 13B'),when:'',note:''});
      // Final was 0-0 and lost 2-3 on penalty kicks; the kicks had been typed in as goals at 60:00.
      const st=ts.games.g4;
      if(st&&!st.pk&&st.goals.length===5&&st.goals.every(x=>x.t>=st.acc-1000)&&st.goals.filter(x=>x.side==='us').map(x=>x.by).sort().join()==='alexa,dm'){
        reset(st,[]);st.pk={us:[{id:'dm',made:true},{id:'alexa',made:true}],them:[true,true,true],order:['us','them','us','them','them'],first:'us'};st.fullDone=true;}
      place('Finalist');}))ch=true;
  if(id==='cottontown-1314-girls'&&once(c,'kicks-final-2026-10-18',()=>{
      const gc=c.games.find(x=>x.id==='s1');if(gc&&setResult(ts,'s1',teamKey(c),gc.half||35,2,1))gc.imported=true;place('3rd place');}))ch=true;
  if(id==='cottontown-1617-girls'&&once(c,'kicks-final-2026-10-18',()=>{
      const gc=c.games.find(x=>x.id==='s1');if(gc&&setResult(ts,'s1',teamKey(c),gc.half||25,3,2))gc.imported=true;place('Champion');}))ch=true;
  if(id==='cottontown-1718-girls'&&once(c,'kicks-final-2026-10-18',()=>{place('4th place (consolation winner)');}))ch=true;
  if(id==='cottontown-2015'&&once(c,'kicks-final-2026-10-18',()=>{
      const gc=c.games.find(x=>x.id==='s3');if(gc&&setResult(ts,'s3',teamKey(c),gc.half||30,3,0))gc.imported=true;
      addGame(c,{id:'s4',title:'Final',opp:'Vero FC Athletic SC AL 2014/15B Premier',dt:'2026-10-18T13:00',field:'Field 12B',place:fieldAddr('Field 12B'),half:30,sub:10,out:[],note:'Final'});
      const g4=c.games.find(x=>x.id==='s4');if(g4&&setResult(ts,'s4',teamKey(c),30,0,4))g4.imported=true;place('Finalist');}))ch=true;
  if(id==='cottontown-boys-white'&&once(c,'kicks-final-2026-10-18',()=>{
      // Semi-final was 9-0; scorers unknown, so no goal is credited to anyone.
      const st=ts.games.s3;const gc=c.games.find(x=>x.id==='s3');
      if(st&&st.goals.length===3&&st.goals.every(x=>x.side==='us'&&x.t===0)){const t=st.goals[0].t;reset(st,Array.from({length:9},(_,i)=>({side:'us',t,u:'kw'+i})));st.started=true;st.fullDone=true;}
      else if(gc&&setResult(ts,'s3',teamKey(c),gc.half||40,9,0))gc.imported=true;
      addGame(c,{id:'s4',title:'Final',opp:'CSA U16 Boys',dt:'2026-10-18T11:15',field:'Field 3',place:fieldAddr('Field 3'),half:40,sub:10,out:[],note:'Final'});
      const g4=c.games.find(x=>x.id==='s4');if(g4&&setResult(ts,'s4',teamKey(c),40,5,3))g4.imported=true;place('Champion');}))ch=true;
  // Sat 10/24: the Development team's KICKS games were never ended on this site, so they said "Awaiting final score".
  // Finish them with the score that was tracked. Thu 10/22 vs AFC Huntsville: lost 2-3 (confirmed by the coach).
  if(id==='cottontown'&&once(c,'dev-finals-2026-10-24',()=>{
      ['g1','g2','g3','g4'].forEach(gid=>{const st=ts.games[gid];if(st&&st.started&&!st.fullDone)Object.assign(st,{running:false,fullDone:true,halfDone:true,pending:null});});
      let gc=c.games.find(x=>/^2026-10-22/.test(x.dt||'')&&/huntsville/i.test((x.opp||'')+' '+(x.title||'')));
      if(!gc){gc={id:'tr1022',title:'AFC Huntsville',opp:'AFC Huntsville (United) WU12G',dt:'2026-10-22T19:00',field:'Merrimack Turf 13S',place:'3770 Ivy Ave SW, Huntsville, AL 35805',half:30,sub:10,out:['spencer','dolly','sarah']};addGame(c,gc);}
      const st=ts.games[gc.id];
      if(!st||!hasData(st)){if(setResult(ts,gc.id,teamKey(c),gc.half||30,2,3))gc.imported=true;}
      else if(st.started&&!st.fullDone)Object.assign(st,{running:false,fullDone:true,halfDone:true,pending:null});}))ch=true;
  return ch;
}
function importedResult(form,half,us,them){
  const H=half*60000;const goals=[];for(let i=0;i<us;i++)goals.push({side:'us',t:0});for(let i=0;i<them;i++)goals.push({side:'them',t:0});
  return fixGame({form,avail:{},half,sub:10,plan:[],start:{},events:[],goals,saves:[],acc:2*H,running:false,runStart:0,started:true,halfDone:true,fullDone:true,stops:[H,2*H],alerted:[],pending:null,batch:0,ot:null,pk:null,imported:true});
}
function seedTeams(s){
  if(!s.T['cottontown-1314-girls'])s.T['cottontown-1314-girls']={cfg:fixCfg(team1314()),games:{}};
  if(!s.T['cottontown-1617-girls'])s.T['cottontown-1617-girls']={cfg:fixCfg(team1617()),games:{
    r1:importedResult('7v7/2-3-1',25,2,5),r2:importedResult('7v7/2-3-1',25,3,4),r3:importedResult('7v7/2-3-1',25,4,1)}};
  if(!s.T['cottontown-1718-girls']){const f='7v7/2-3-1',R=(a,b)=>importedResult(f,25,a,b);
    s.T['cottontown-1718-girls']={cfg:fixCfg(team1718()),games:{r1:R(0,2),r2:R(7,1),r3:R(0,1),r4:R(0,6),r5:R(0,6),r6:R(0,3),r7:R(2,1),r8:R(3,2),r9:R(0,1)}};}
  Object.keys(NEW_TEAMS).forEach(id=>{if(!s.T[id])s.T[id]=NEW_TEAMS[id]();});
  Object.keys(s.T).forEach(k=>migrateTeam(k,s.T[k]));
  return s;
}
function load(){
  try{const raw=localStorage.getItem(KEY);
    if(raw){const s=JSON.parse(raw);
      if(s&&s.v===2&&s.T){
        if(!s.T.cottontown)s.T.cottontown={cfg:cottonDefault(),games:{}};
        Object.keys(s.T).forEach(k=>{const t=s.T[k];if(t.cfg)fixCfg(t.cfg);t.games=t.games||{};Object.values(t.games).forEach(fixGame);});
        s.cur=s.cur||{};s.auth=s.auth||{};return seedTeams(s);}}
  }catch(e){}
  const s={v:2,team:'cottontown',cur:{},tab:'bench',beep:true,auth:{},T:{cottontown:{cfg:cottonDefault(),games:{}}}};
  try{const raw=localStorage.getItem(OLDKEY);
    if(raw){const o=JSON.parse(raw);
      if(o&&Array.isArray(o.games)){const cfg=s.T.cottontown.cfg;
        o.games.forEach((g,i)=>{const gc=cfg.games[i];if(gc&&g)s.T.cottontown.games[gc.id]=fixGame(g);});
        s.cur.cottontown=o.cur||0;s.tab=o.tab||'bench';s.beep=o.beep!==false;if(o.song!==undefined)s.song=o.song;
        if(o.editor&&o.code){s.auth.cottontown=o.code;s.master=o.code;}}}
  }catch(e){}
  return seedTeams(s);
}
function saveLocal(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}

/* ---------- Accessors ---------- */
const TS=()=>S.T[S.team];
const CFG=()=>TS()&&TS().cfg;
/* A game's status on this page (Live, Halftime, Final, Postponed, Awaiting result, Today, Scheduled).
   gameAt is the last time the server saved that game, which tells a quiet, forgotten game from a live one. */
const gameAt=gid=>(UI.gameAt&&UI.gameAt[S.team+'/'+gid])||0;
const gStatus=gc=>gameStatus(gc,TS().games[gc.id],T(),gameAt(gc.id));
const gBucket=gc=>gameBucket(gc,TS().games[gc.id],T(),gameAt(gc.id));
/* The game to open first: the active one, else the next one, else the latest result. */
function defaultGameIdx(){const L=CFG().games.map((gc,i)=>({i,st:gStatus(gc),t:kickoffMs(gc)}));const t0=x=>Number.isFinite(x.t)?x.t:0;
  const first=sts=>L.filter(x=>sts.includes(x.st)).sort((a,b)=>t0(a)-t0(b))[0],last=sts=>L.filter(x=>sts.includes(x.st)).sort((a,b)=>t0(b)-t0(a))[0];
  const x=first(['live','halftime'])||first(['today','upcoming'])||last(['final','awaiting'])||first(['undated','postponed']);return x?x.i:0;}
/* Opening a team picks the default game, unless a game link asked for one or the coach/parent picked one recently. */
function curIdx(){const gs=CFG().games,n=gs.length;UI.curSet=UI.curSet||{};
  if(!UI.curSet[S.team]){UI.curSet[S.team]=true;const p=S.pick&&S.pick[S.team];
    const pi=p&&Date.now()-p.at<6*3600000?gs.findIndex(x=>x.id===p.id):-1;S.cur[S.team]=pi>=0?pi:defaultGameIdx();}
  let i=S.cur[S.team]||0;if(i>=n)i=n-1;if(i<0)i=0;return i;}
const GC=()=>CFG().games[curIdx()];
function stateOf(gc){const ts=TS();if(!ts.games[gc.id])ts.games[gc.id]=freshGame(gc);return ts.games[gc.id];}
const G=()=>stateOf(GC());
const PL=()=>G().plan;
let POS=[],PI={},PLAYERS=[],P={};
function useForm(x){const f=formOf(x);POS=f.map(p=>p.id);PI=Object.fromEntries(f.map(p=>[p.id,p]));}
function useTeam(){const c=CFG();PLAYERS=c?c.players:[];P=Object.fromEntries(PLAYERS.map(p=>[p.id,p]));if(c)useForm(G());}
const posIds=g=>formOf(g).map(p=>p.id);
const nm=id=>id?(P[id]?P[id].name:'Removed player'):'Empty';
const av=(g,id)=>g.avail[id]!==false;
const teamKey=c=>c.format+'/'+c.formation;
const gr=p=>(p&&p.gr&&p.gr.length)?p.gr:['DEF','MID','FWD'];
const pureGK=p=>p&&p.gr&&p.gr.length===1&&p.gr[0]==='GK';
const jn=p=>p&&p.num?`<span class="jn">#${esc(p.num)}</span>`:'';
const roleText=p=>p.role||(p.gr&&p.gr.length?p.gr.map(g=>GNAME[g]).join(', '):'Any position');
const shortName=()=>CFG().short||CFG().name;
const oppName=gc=>(gc||GC()).opp||'Opponent';
function armed(k){return UI.arm&&UI.arm.k===k&&Date.now()-UI.arm.t<4000;}
function arm(k){UI.arm={k,t:Date.now()};setTimeout(()=>{if(UI.arm&&UI.arm.k===k&&Date.now()-UI.arm.t>=4000){UI.arm=null;renderAll();}},4100);}

function validPlan(plan,form){const ids=formOf(form).map(p=>p.id);return Array.isArray(plan)&&plan.length>0&&plan.every(b=>b&&ids.every(p=>p in b));}
function freshGame(gc,keep){
  const c=CFG();const form=teamKey(c);const avail={};const cf=customForm(c.formation);
  c.players.forEach(p=>avail[p.id]=!(gc.out||[]).includes(p.id));
  const g=fixGame({form,...(cf?{formDef:cf.pos.map(p=>Object.assign({},p))}:{}),avail:keep?keep.avail:avail,half:keep?keep.half:(gc.half||30),sub:keep?keep.sub:(gc.sub||10),
    otLen:keep?keep.otLen:5,otN:keep?keep.otN:2,events:[],goals:[],saves:[],acc:0,running:false,runStart:0,started:false,
    halfDone:false,fullDone:false,stops:[],alerted:[],pending:null,batch:0,ot:null,pk:null});
  g.plan=validPlan(gc.plan,g)?gc.plan.map(b=>Object.assign({},b)):autoPlan(g);
  g.start=Object.assign({},g.plan[0]||{});
  return g;
}

/* ---------- Automatic rotation ---------- */
function autoPlan(g){
  const F=formOf(g);const n=Math.max(1,Math.min(12,Math.ceil(2*g.half/g.sub)));
  const avail=PLAYERS.filter(p=>av(g,p.id));
  const gkPos=F.find(p=>p.g==='GK');const field=F.filter(p=>p.g!=='GK');
  let keepers=avail.filter(pureGK);if(!keepers.length)keepers=avail.filter(p=>gr(p).includes('GK'));
  const half=Math.ceil(n/2);
  const cnt={},sat={};avail.forEach(p=>{cnt[p.id]=0;sat[p.id]=false;});
  const plan=[];let prev=null;let fieldGK=null;
  for(let i=0;i<n;i++){
    const b={};
    let gkId=keepers.length?keepers[(keepers.length>=2&&i>=half)?1:0].id:null;
    if(!gkId){if(i===0||i===half||!fieldGK||!avail.some(p=>p.id===fieldGK)){const c=avail.filter(p=>!pureGK(p)).sort((a,c)=>(cnt[a.id]-cnt[c.id])||(avail.indexOf(a)-avail.indexOf(c)))[0];fieldGK=c?c.id:null;}gkId=fieldGK;}
    const pool=avail.filter(p=>p.id!==gkId&&!pureGK(p));
    b[gkPos.id]=gkId;
    const pool2=pool.filter(p=>p.id!==gkId);
    const order=pool2.slice().sort((a,c)=>(cnt[a.id]-cnt[c.id])||((sat[c.id]?1:0)-(sat[a.id]?1:0))||(avail.indexOf(a)-avail.indexOf(c)));
    const chosen=order.slice(0,field.length);
    const open=new Set(field.map(f=>f.id));const placed=new Set();
    if(prev)chosen.forEach(p=>{const q=field.find(f=>prev[f.id]===p.id);if(q&&open.has(q.id)){b[q.id]=p.id;open.delete(q.id);placed.add(p.id);}});
    let rest=chosen.filter(p=>!placed.has(p.id));
    const openArr=field.filter(f=>open.has(f.id));
    openArr.sort((x,y)=>rest.filter(p=>gr(p).includes(x.g)).length-rest.filter(p=>gr(p).includes(y.g)).length);
    openArr.forEach(f=>{let c=rest.filter(p=>gr(p).includes(f.g));if(!c.length)c=rest.slice();c.sort((a,d)=>gr(a).length-gr(d).length);const pick=c[0];
      if(pick){b[f.id]=pick.id;rest=rest.filter(p=>p!==pick);}else b[f.id]=null;});
    pool2.forEach(p=>{const on=Object.values(b).includes(p.id);sat[p.id]=!on;if(on)cnt[p.id]++;});
    if(gkId&&cnt[gkId]!==undefined&&!keepers.some(k=>k.id===gkId)){cnt[gkId]++;sat[gkId]=false;}
    plan.push(b);prev=b;
  }
  return plan;
}

/* ---------- Clock ---------- */
let OFF=0;const T=()=>Date.now()+OFF;
const clock=g=>g.acc+(g.running?T()-g.runStart:0);
const HMS=g=>g.half*60000,SMS=g=>g.sub*60000;
const XT=(g,i)=>(g.xt&&g.xt[i])||0;
const perLen=(g,i)=>i<2?HMS(g):g.ot.len*60000;
function ends(g){const H=HMS(g);const e=[H+XT(g,0),2*H+XT(g,0)+XT(g,1)];if(g.ot){let t=e[1];for(let k=1;k<=g.ot.n;k++){t+=g.ot.len*60000+XT(g,k+1);e.push(t);}}return e;}
function periodOf(g,c){const E=ends(g);const i=E.findIndex(e=>c<e);return i<0?E.length-1:i;}
/* Regulation time: the game clock minus stoppage time. Sub timing and the big clock use it. */
function regOf(g,c){const E=ends(g);let base=0,start=0;for(let i=0;i<E.length;i++){const len=perLen(g,i);if(c<E[i]||i===E.length-1)return base+Math.max(0,Math.min(c-start,len));base+=len;start=E[i];}return base;}
function fromReg(g,r){const E=ends(g);let base=0,start=0;for(let i=0;i<E.length;i++){const len=perLen(g,i);if(r<base+len||i===E.length-1)return start+Math.max(0,Math.min(r-base,len));base+=len;start=E[i];}return start;}
function stopIn(g,c){const i=periodOf(g,c);const E=ends(g);return Math.max(0,Math.min(c,E[i])-(i?E[i-1]:0)-perLen(g,i));}
function tfmt(g,t){const st=stopIn(g,t);return fmt(regOf(g,t))+(st>0?' +'+fmt(st):'');}
function tmin(g,t){const st=stopIn(g,t);const r=regOf(g,t);return st>0?Math.round(r/60000)+'+'+(Math.floor(st/60000)+1)+'′':gmin(r);}
const totalMs=g=>{const e=ends(g);return e[e.length-1];};
function pausedAt(g){if(g.running)return null;const c=clock(g);const e=ends(g).find(x=>x===c&&g.stops.includes(x));return e===undefined?null:e;}
function otIndex(g,e){return ends(g).indexOf(e)-1;}
function endLabel(g,e){const E=ends(g);if(e===E[0])return 'Halftime';if(e===E[1])return g.ot?'End of regulation':'Full time';const k=otIndex(g,e);return k>=g.ot.n?'Full time':'End of OT '+k;}
function periodName(g,c){const i=periodOf(g,c);const n=i===0?'1st half':(i===1||!g.ot)?'2nd half':'OT '+(i-1);return n+(stopIn(g,c)>0?', added time':'');}
const PNAME=(g,i)=>i===0?'1st half':i===1?'2nd half':'OT '+(i-1);
function fmt(ms){ms=Math.max(0,ms);const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
function fmtClock(ms){ms=Math.max(0,ms);const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
const mins=ms=>String(Math.round(ms/60000));
const gmin=t=>Math.floor(Math.max(0,t)/60000)+1+'′';

/* ---------- Replay ---------- */
function replay(g){
  const PS=posIds(g);const now=clock(g);const L=Object.assign({},g.start);const st={};
  const ids=new Set(PLAYERS.map(p=>p.id));PS.forEach(p=>{if(L[p])ids.add(L[p]);});g.events.forEach(e=>{if(e.to)ids.add(e.to);if(e.from)ids.add(e.from);});
  ids.forEach(id=>st[id]={played:0,onAt:null,offAt:0,gk:0});
  const onOf=()=>new Set(PS.map(p=>L[p]).filter(Boolean));
  let on=onOf();on.forEach(id=>{st[id].onAt=0;});
  let gkId=L.GK||null,gkSince=0;
  const batches=[];let cur=null;
  const close=()=>{if(cur){cur.after=Object.assign({},L);cur.lines=describe(cur.before,cur.after,PS);}};
  for(const e of g.events){
    if(!cur||cur.b!==e.b){close();cur={b:e.b,t:e.t,before:Object.assign({},L)};batches.push(cur);}
    L[e.pos]=e.to;
    if(e.pos==='GK'&&L.GK!==gkId){if(gkId&&st[gkId])st[gkId].gk+=Math.max(0,e.t-gkSince);gkId=L.GK||null;gkSince=e.t;}
    const nw=onOf();
    on.forEach(id=>{if(!nw.has(id)&&st[id]){st[id].played+=Math.max(0,e.t-st[id].onAt);st[id].onAt=null;st[id].offAt=e.t;}});
    nw.forEach(id=>{if(!on.has(id)&&st[id])st[id].onAt=e.t;});
    on=nw;
  }
  close();
  on.forEach(id=>{if(st[id])st[id].played+=Math.max(0,now-st[id].onAt);});
  if(gkId&&st[gkId]&&g.started)st[gkId].gk+=Math.max(0,now-gkSince);
  return {L,st,batches,on,now,PS};
}
function describe(b,a,PS){
  PS=PS||POS;
  const posOf=(L,id)=>PS.find(p=>L[p]===id);
  const bs=new Set(PS.map(p=>b[p]).filter(Boolean)),as=new Set(PS.map(p=>a[p]).filter(Boolean));
  const ins=[...as].filter(x=>!bs.has(x)),outs=[...bs].filter(x=>!as.has(x));
  const used=new Set();const lines=[];
  ins.forEach(id=>{const p=posOf(a,id);const o=b[p];
    if(o&&outs.includes(o)&&!used.has(o)){used.add(o);lines.push({k:'sub',p,id,o,t:nm(id)+' in for '+nm(o)});}
    else lines.push({k:'in',p,id,t:nm(id)+' in'});});
  outs.filter(o=>!used.has(o)).forEach(o=>lines.push({k:'out',p:posOf(b,o),id:o,t:nm(o)+' off'}));
  [...as].filter(x=>bs.has(x)&&posOf(a,x)!==posOf(b,x)).forEach(id=>lines.push({k:'move',p:posOf(a,id),id,t:nm(id)+' moves '+posOf(b,id)+' to '+posOf(a,id)}));
  return lines;
}
function winK(g,c){
  if(!g.started||g.fullDone)return null;
  if(g.pending!=null)return g.pending;
  const SUB=SMS(g),H=HMS(g);const r=regOf(g,c);if(stopIn(g,c)>0)return null;const nb=Math.floor(r/SUB)+1;
  if(nb*SUB<2*H&&(pOff(g)||nb<PL().length)&&nb*SUB-r<=60000)return nb;
  return null;
}
/* Plan off: subs you've lined up (bench player -> position) wait here until you make them. */
function liveQueue(g,d){return (g.queue||[]).filter(q=>P[q.id]&&av(g,q.id)&&!d.on.has(q.id)&&POS.includes(q.pos));}
function queueTarget(g,d){const t=Object.assign({},d.L);liveQueue(g,d).forEach(q=>t[q.pos]=q.id);return t;}
function queueSet(id,pos){const g=G();const d=replay(g);g.queue=(g.queue||[]).filter(q=>q.id!==id&&q.pos!==pos);g.queue.push({id,pos});
  say(nm(id)+' goes in at '+pos+(d.L[pos]?' for '+nm(d.L[pos]):'')+' at the next sub');save();}
function upcoming(g,d){
  if(pOff(g)){const q=liveQueue(g,d);if(!q.length)return null;const target=queueTarget(g,d);return {k:'q',target,lines:describe(d.L,target)};}
  const k=winK(g,d.now);if(k==null||!PL()[k])return null;return {k,target:PL()[k],lines:describe(d.L,PL()[k])};}
function blockAt(g,c){return Math.min(PL().length-1,Math.floor(regOf(g,c)/SMS(g)));}
function blockRange(g,i){return i*g.sub+'–'+(i+1)*g.sub+' min';}
const plannedFor=(g,id)=>g.plan.filter(b=>Object.values(b).includes(id)).length*g.sub;
function scoreOf(g){const gl=g.goals||[];return {us:gl.filter(x=>x.side==='us').length,them:gl.filter(x=>x.side==='them').length};}
/* Shootout: best of 5, ends early once one side can't catch up, then sudden death. */
function pkState(g){const u=g.pk.us.filter(k=>k.made).length,ua=g.pk.us.length,t=g.pk.them.filter(Boolean).length,ta=g.pk.them.length;let win=null;
  if(ua<=5&&ta<=5){if(u+(5-ua)<t)win='them';else if(t+(5-ta)<u)win='us';}
  if(!win&&ua===ta&&ua>=5&&u!==t)win=u>t?'us':'them';
  const first=g.pk.first||'us';const turn=first==='us'?(ua<=ta?'us':'them'):(ta<=ua?'them':'us');
  return {u,ua,t,ta,win,turn,round:Math.min(ua,ta)+1,sd:Math.min(ua,ta)>=5};}
/* Next kicker: the planned order first, then everyone else here; nobody kicks again until all have. */
function nextKicker(g){const order=(g.pkOrder||[]).filter(id=>P[id]&&av(g,id));
  const seq=order.concat(PLAYERS.filter(p=>av(g,p.id)&&!order.includes(p.id)).map(p=>p.id));if(!seq.length)return null;
  const n={};g.pk.us.forEach(k=>n[k.id]=(n[k.id]||0)+1);const min=Math.min(...seq.map(id=>n[id]||0));
  return seq.find(id=>(n[id]||0)===min);}
function pkOrderHTML(g){const order=g.pkOrder||[];
  let h=`<div class="card pkcard"><h3>Penalty kick order (if tied)</h3><p class="fine" style="margin-top:-4px">Optional. In a shootout the app calls these kickers in order. Anyone not listed follows, and nobody kicks twice until everyone has.</p>`;
  if(order.length)h+='<ol class="pko">'+order.map((id,i)=>`<li class="${av(g,id)?'':'warn'}"><span><b>${i+1}</b> ${esc(nm(id))}${av(g,id)?'':' (out, skipped)'}</span><span class="pkob"><button data-act="pkmv" data-i="${i}" data-d="-1" ${i?'':'disabled'} aria-label="Move up">↑</button><button data-act="pkmv" data-i="${i}" data-d="1" ${i<order.length-1?'':'disabled'} aria-label="Move down">↓</button><button data-act="pkrm" data-i="${i}" aria-label="Remove">✕</button></span></li>`).join('')+'</ol>';
  const rest=PLAYERS.filter(p=>av(g,p.id)&&!order.includes(p.id));
  if(rest.length)h+=`<div class="fine">Tap to add ${order.length?'as kicker '+(order.length+1):'your first kicker'}:</div><div class="pkadd">${rest.map(p=>`<button data-act="pkadd" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>`;
  if(order.length)h+=`<button class="btn small ${armed('pkclear')?'danger-s armed':''}" data-act="pkclear" style="margin-top:8px">${armed('pkclear')?'Tap again to clear':'Clear order'}</button>`;
  return h+'</div>';}
function pkScore(g){return g.pk?{us:g.pk.us.filter(k=>k.made).length,them:g.pk.them.filter(Boolean).length}:{us:0,them:0};}

/* ---------- Game-day info ---------- */
function whenText(gc){if(timeTBD(gc)){const d=new Date(kickoffMs(gc));return d.toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'})+', time TBD';}
  if(gc.dt){const d=new Date(gc.dt);if(!isNaN(d)){const days=(d-Date.now())/864e5;const o=days>-1&&days<6?{weekday:'short',hour:'numeric',minute:'2-digit'}:{weekday:'short',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'};return d.toLocaleString('en-US',o);}}return gc.when||'Time to be set';}
function countdown(gc){if(!gc.dt||timeTBD(gc))return '';const d=new Date(gc.dt);if(isNaN(d))return '';const ms=d-Date.now();if(ms<=0)return 'Kickoff soon';
  const m=Math.floor(ms/60000),dd=Math.floor(m/1440),hh=Math.floor(m%1440/60),mm=m%60;return 'Kickoff in '+(dd?dd+'d '+hh+'h':hh?hh+'h '+mm+'m':mm+'m');}
const mapUrl=q=>'https://maps.apple.com/?q='+encodeURIComponent(q);

/* ---------- Sync ---------- */
const SY={on:false,ok:false,first:true,team:null,sid:0,lastSent:{},rev:{},inflight:{},editT:{},savedAt:0,localAt:0,lock:{}};
/* Each team switch (or sign-in) starts a new sync session with its own records. A save that finishes after
   the switch only updates the session that sent it, never the new team's. */
function resetSync(){SY.sid++;SY.first=true;SY.team=S.team;SY.lastSent={};SY.rev={};SY.inflight={};SY.editT={};SY.cfgDenied=undefined;
  // Lock state is per team (game ids like g1 repeat across teams), so it starts over with each team.
  SY.lock={};UI.unlock={};UI.revert={};}
const myCode=()=>S.auth[S.team]||'';
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
const EXT={};
const isParent=()=>!canEdit();
function save(){
  saveLocal();SY.localAt=Date.now();if(!SY.on)renderSync();
  if(!SY.on||!canEdit()||SY.team!==S.team||SY.first)return;
  const c=CFG();if(!c)return;
  // A settings change this device isn't allowed to make (e.g. an assistant's) isn't retried until the team changes on the server.
  const cj=JSON.stringify(c);if(cj!==SY.lastSent.cfg&&cj!==SY.cfgDenied){SY.editT.cfg=Date.now();push('cfg');}
  c.games.forEach(gc=>{const st=TS().games[gc.id];if(!st)return;if(JSON.stringify(st)!==SY.lastSent[gc.id]){SY.editT[gc.id]=Date.now();push(gc.id);}});
}
async function push(key){
  const team=S.team;const ts=TS();const obj=key==='cfg'?ts.cfg:ts.games[key];if(!obj)return;
  const body=key==='cfg'?Object.assign({kind:'config',team,config:obj},creds()):Object.assign({kind:'game',team,gid:key,game:obj,unlock:!!UI.unlock[key]},creds());
  // This save's own session: its records stay with it even if the coach switches teams before it finishes.
  const ses={sid:SY.sid,lastSent:SY.lastSent,rev:SY.rev,inflight:SY.inflight,editT:SY.editT};
  const current=()=>ses.sid===SY.sid&&SY.team===team&&S.team===team;
  const sent=JSON.stringify(obj);
  ses.lastSent[key]=sent;ses.inflight[key]=(ses.inflight[key]||0)+1;let rerender=false;
  try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.status===401){delete S.auth[team];if(current()){if(S.sess&&!myRole()){S.sess='';ME.user=null;}say('Your sign-in or coach code wasn’t accepted. This device is now view only.');rerender=true;}saveLocal();}
    else if(r.status===403||r.status===409){
      // Not allowed (role) or locked (finished game): put the server's copy back instead of retrying.
      const j=await r.json().catch(()=>({}));ses.rev[key]=0;
      if(current()){
        if(key!=='cfg')UI.revert[key]=true;
        if(key==='cfg'){const again=SY.cfgDenied===sent;SY.cfgDenied=sent;if(again){ses.inflight[key]--;return;}}
        say(r.status===409?'This game is final and locked. Unlock it on the Players tab to change the result.':(j.error||'You can’t change that.'));rerender=true;}}
    else if(r.ok){const j=await r.json();if(j.rev>(ses.rev[key]||0))ses.rev[key]=j.rev;if(current()){SY.ok=true;SY.savedAt=Date.now();setTimeout(renderSync,3100);}}
    else{ses.lastSent[key]='';if(current())SY.ok=false;}
  }catch(e){ses.lastSent[key]='';if(current())SY.ok=false;}
  ses.inflight[key]--;ses.editT[key]=Date.now();
  if(!current())return;
  if(rerender)renderAll();else renderSync();
}
/* ?game=ID from the club page opens that game once the team has loaded. */
function openWanted(){if(!UI.wantGame||!CFG())return;const i=CFG().games.findIndex(x=>x.id===UI.wantGame);if(i>=0){S.cur[S.team]=i;UI.curSet=UI.curSet||{};UI.curSet[S.team]=true;UI.linked=true;UI.win=undefined;}UI.wantGame=null;}
function applyServer(j){
  if(!j||j.team!==S.team||SY.team!==S.team)return;
  PST.srv[S.team]=j.pstats||{};
  if(Array.isArray(j.tournaments)&&typeof TOURS!=='undefined')TOURS.list=j.tournaments;
  const ts=TS();let changed=false;const first=SY.first;
  const busy=k=>SY.inflight[k]||Date.now()-(SY.editT[k]||0)<1500;
  if(j.config&&j.config.team){
    if(!busy('cfg')&&(first||(SY.rev.cfg||0)<j.config.rev)){
      SY.rev.cfg=j.config.rev;const nc=fixCfg(j.config.team);
      if(JSON.stringify(nc)!==JSON.stringify(ts.cfg)){ts.cfg=nc;changed=true;}
      SY.lastSent.cfg=JSON.stringify(ts.cfg);
    }
  }else if(first)SY.lastSent.cfg='';
  if(!ts.cfg){SY.first=false;renderAll();return;}
  useTeam();
  const games=j.games||{};
  ts.cfg.games.forEach((gc,i)=>{
    const sg=games[gc.id];
    if(!sg&&first&&Array.isArray(j.legacy)&&j.legacy[i]){const lg=fixGame(j.legacy[i]);
      if(JSON.stringify(lg)!==JSON.stringify(ts.games[gc.id])){ts.games[gc.id]=lg;changed=true;}SY.lastSent[gc.id]='';return;}
    if(!sg||!sg.game){if(first)SY.lastSent[gc.id]='';return;}
    SY.lock[gc.id]=!!(sg.game.fullDone&&(!sg.doneAt||j.now-sg.doneAt>7200000));
    if(sg.at){UI.gameAt=UI.gameAt||{};UI.gameAt[S.team+'/'+gc.id]=sg.at;}
    if(busy(gc.id))return;
    if(!first&&(SY.rev[gc.id]||0)>=sg.rev)return;
    SY.rev[gc.id]=sg.rev;const sv=JSON.stringify(fixGame(sg.game));
    const rv=UI.revert[gc.id];if(rv)delete UI.revert[gc.id];
    const ng=(first||rv)?JSON.parse(sv):mergeGame(JSON.parse(sv),ts.games[gc.id]);
    if(JSON.stringify(ng)!==JSON.stringify(ts.games[gc.id])){ts.games[gc.id]=ng;changed=true;}
    SY.lastSent[gc.id]=sv;
  });
  if(migrateTeam(S.team,ts))changed=true;
  // The first time this team's games arrive, choose the opening game from real game states (not a stale saved choice).
  UI.loaded=UI.loaded||{};
  if(first&&!UI.loaded[S.team]){UI.loaded[S.team]=true;if(!UI.linked&&UI.curSet)UI.curSet[S.team]=false;changed=true;}
  SY.first=false;
  if(UI.wantGame){openWanted();changed=true;}
  if(changed||first){useTeam();saveLocal();UI.win=undefined;renderAll();}
  if(canEdit())save();
}
async function getState(team){
  const t0=Date.now();const r=await fetch(API+'?team='+encodeURIComponent(team),{cache:'no-store'});if(!r.ok)throw new Error('bad');
  const j=await r.json();if(!j||typeof j.now!=='number')throw new Error('bad');
  const off=j.now-Math.round((t0+Date.now())/2);OFF=SY.on?Math.round(OFF*0.8+off*0.2):off;return j;
}
async function syncInit(){
  try{resetSync();const j=await getState(S.team);SY.on=true;SY.ok=true;applyServer(j);setInterval(poll,2000);setInterval(checkVersion,60000);setInterval(maybeReload,15000);if(S.master&&S.pubVer!==PUB_VER)setTimeout(publishAll,1500);}
  catch(e){SY.on=false;}
  if(!CFG()){S.team='cottontown';useTeam();}
  renderAll();
}
async function poll(){
  if(document.visibilityState!=='visible')return;const team=S.team;
  try{const j=await getState(team);SY.ok=true;if(team===S.team)applyServer(j);}catch(e){SY.ok=false;}
  renderSync();
}
async function loadTeamList(){
  if(!SY.on)return;try{const r=await fetch(API+'?list=1',{cache:'no-store'});if(r.ok){const j=await r.json();UI.teamList=j.teams||[];renderPanel();}}catch(e){}
}
function teamsList(){
  const m=new Map();(UI.teamList||[]).forEach(t=>m.set(t.id,t.name));
  Object.keys(S.T).forEach(id=>{const c=S.T[id].cfg;if(c)m.set(id,c.name);});
  return [...m].map(([id,name])=>({id,name}));
}
async function unlock(){
  const el=$('code');const code=el?el.value.trim():'';
  // Messages also appear beside the code box, which may be in the ⋯ menu above the page's message line.
  const tell=m=>{say(m);document.querySelectorAll('[data-unlockmsg]').forEach(x=>{x.textContent=m;});};
  if(!code){tell('Enter the coach code first');renderHint();return;}
  try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'verify',team:S.team,code})});
    if(r.ok){const j=await r.json();S.auth[S.team]=code;if(j.master)S.master=code;if(typeof NAV!=='undefined')NAV.open='';S.mode='game';S.tab='bench';saveLocal();say('Unlocked. This device can run '+CFG().name+' games.');
      resetSync();try{const s=await getState(S.team);applyServer(s);}catch(e){SY.first=false;}}
    else if(r.status===401){tell('That code didn’t work. Check it and try again.');if(el)el.select();return;}else{tell('Couldn’t check the code. Try again.');return;}
  }catch(e){tell('Couldn’t reach the server. Check your connection and try again.');return;}
  renderAll();
}
async function switchTeam(id){
  if(!id||id===S.team)return;
  if(!S.T[id])S.T[id]={cfg:null,games:{}};
  S.team=id;UI.linked=false;UI.sel=null;UI.pick=null;UI.goal=null;UI.pk=null;UI.win=undefined;UI.lastUs=undefined;
  if(!S.auth[id]&&S.master)S.auth[id]=S.master;
  try{history.replaceState(null,'',location.pathname+'?team='+encodeURIComponent(id));}catch(e){}
  resetSync();
  if(SY.on){try{const j=await getState(id);applyServer(j);}catch(e){SY.first=false;}}
  else SY.first=false;
  if(!CFG()){say('That team wasn’t found');S.team='cottontown';resetSync();SY.first=false;}
  useTeam();saveLocal();renderAll();if(canEdit())save();
}
function slug(s){return (s||'team').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,30)||'team';}
const PUB_VER='2026-10-18e';
/* APP_VER changes with every deploy that coach devices should pick up. When the published page's APP_VER
   differs from the running one, a coach device reloads itself if no clock is running, or shows a Refresh button. */
const APP_VER='2026-10-24d';
const VER={tag:null,ready:false};
async function checkVersion(){
  if(!SY.on||!canEdit()||document.visibilityState!=='visible')return;
  try{const j=await fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(x=>x.json());
    if(j&&j.v&&j.v!==APP_VER){VER.ready=true;maybeReload();}}catch(e){}
}
function maybeReload(){
  if(!VER.ready)return;const ts=TS();
  const busy=(ts&&Object.values(ts.games||{}).some(g=>g&&g.running))||UI.sheet||UI.sel||UI.goal||UI.pk||UI.pick||Object.values(SY.inflight).some(n=>n>0)
    ||(document.activeElement&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
  if(!busy){location.reload();return;}renderHint();
}
async function publishAll(){
  const code=S.master||myCode();
  if(!SY.on&&!CLUB.on){say('This only works on the live site');renderHint&&renderHint();return;}
  if(!code&&!isAdmin()){say('Sign in as an admin or use the main coach code first');return;}
  UI.pubBusy=true;try{renderAll();}catch(e){}if(CLUB.on)renderClub();
  const post=b=>fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({unlock:true},creds(),b))});
  let added=0,games=0,failed=0;
  let fixed=0;
  for(const id of Object.keys(S.T)){
    if(id===S.team&&SY.on&&!CLUB.on)continue; // the open team syncs on its own
    if(S.T[id].cfg&&S.T[id].cfg.test)continue; // test teams are made from Setup, never published
    const ts=S.T[id];if(!ts.cfg)continue;
    let srv=null;try{const r=await fetch(API+'?team='+encodeURIComponent(id),{cache:'no-store'});if(r.ok)srv=await r.json();}catch(e){}
    if(!srv){failed++;continue;}
    if(!(srv.config&&srv.config.team)){migrateTeam(id,ts);const r=await post({kind:'config',team:id,config:ts.cfg});if(r.ok)added++;else{failed++;continue;}
      for(const gc of ts.cfg.games){const st=ts.games[gc.id];if(st){const r=await post({kind:'game',team:id,gid:gc.id,game:st});if(r.ok)games++;else failed++;}}
      continue;}
    // Already live: run this version's one-time fixes on the live copy and save only what they changed.
    const live={cfg:fixCfg(JSON.parse(JSON.stringify(srv.config.team))),games:{}};
    Object.entries(srv.games||{}).forEach(([gid,v])=>{if(v&&v.game)live.games[gid]=fixGame(JSON.parse(JSON.stringify(v.game)));});
    const before={cfg:JSON.stringify(live.cfg)};Object.keys(live.games).forEach(gid=>before[gid]=JSON.stringify(live.games[gid]));
    migrateTeam(id,live);let any=false;
    if(JSON.stringify(live.cfg)!==before.cfg){const r=await post({kind:'config',team:id,config:live.cfg});if(r.ok)any=true;else failed++;}
    for(const gid of Object.keys(live.games)){if(JSON.stringify(live.games[gid])!==before[gid]){const r=await post({kind:'game',team:id,gid,game:live.games[gid]});if(r.ok){any=true;games++;}else failed++;}}
    if(any)fixed++;S.T[id]=live;
  }
  UI.pubBusy=false;if(!failed){S.pubVer=PUB_VER;saveLocal();}
  say(failed?`Loaded ${added} team${added===1?'':'s'}; ${failed} didn’t load. Check the code and try again.`:(added||fixed)?`Live site updated: ${added} new team${added===1?'':'s'}, ${fixed} updated`:'All teams were already up to date on the live site');
  if(CLUB.on){CLUB.msg=UI.msg;clubFetch();}else{loadTeamList();renderAll();}
}
async function createTeam(){
  const el=$('nt-name');const name=((el&&el.value)||UI.ntName||'').trim();
  if(!name){say('Give the new team a name');renderHint();return;}
  const fmtKey=UI.ntFmt||'9v9';
  const taken=new Set(teamsList().map(t=>t.id));let id=slug(name),k=2;while(taken.has(id))id=slug(name)+'-'+(k++);
  const cfg=fixCfg({id,name,short:name,sub:'',logo:null,song:false,format:fmtKey,formation:Object.keys(FORMS[fmtKey])[0],players:[],
    games:[{id:'g1',title:'Game 1',opp:'',dt:'',field:'',place:'',half:fmtKey==='7v7'?25:fmtKey==='9v9'?30:35,sub:10,out:[]}]});
  const code=myCode()||S.master||'';
  S.T[id]={cfg,games:{}};if(code)S.auth[id]=code;UI.newTeam=false;UI.ntName='';
  await switchTeam(id);S.mode='team';S.tab='roster';say('Team created. Add players, then games on the Schedule tab.');saveLocal();renderAll();
}

/* ---------- Audio ---------- */
let ac=null,lastAlarm=0,wl=null,songEl=null,lastSong=0;
function unlockAudio(){try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume();}catch(e){}}
function alarm(){
  if(isParent()||!S.beep||Date.now()-lastAlarm<1500)return;lastAlarm=Date.now();
  try{unlockAudio();const t0=ac.currentTime;
    [0,0.25,0.5].forEach(d=>{const o=ac.createOscillator(),gn=ac.createGain();o.type='square';o.frequency.value=988;
      gn.gain.setValueAtTime(0.0001,t0+d);gn.gain.exponentialRampToValueAtTime(0.25,t0+d+0.02);gn.gain.exponentialRampToValueAtTime(0.0001,t0+d+0.18);
      o.connect(gn);gn.connect(ac.destination);o.start(t0+d);o.stop(t0+d+0.2);});
  }catch(e){}
  try{if(navigator.vibrate)navigator.vibrate([200,100,200]);}catch(e){}
}
const hasSong=()=>!!(CFG()&&CFG().song);
function songOn(){return hasSong()&&(S.song!==undefined?!!S.song:canEdit());}
function songAudio(){if(!songEl){songEl=new Audio(GOAL_SONG);songEl.preload='auto';}return songEl;}
function playSong(){if(!songOn()||Date.now()-lastSong<2500)return;lastSong=Date.now();try{const a=songAudio();a.pause();a.currentTime=0;a.muted=false;const pr=a.play();if(pr&&pr.catch)pr.catch(()=>{});}catch(e){}}
function primeSong(){try{const a=songAudio();a.muted=true;const pr=a.play();if(pr&&pr.then)pr.then(()=>{a.pause();a.currentTime=0;a.muted=false;}).catch(()=>{a.muted=false;});}catch(e){}}
async function wake(){try{if('wakeLock' in navigator&&!wl){wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>{wl=null;});}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&CFG()){if(G().running)wake();renderAll();}});

/* ---------- Game actions ---------- */
function say(m){UI.msg=m;UI.msgT=Date.now()+2800;}
function change(pairs,label){
  const g=G();if(!pairs.length)return;const d=replay(g);
  if(!g.started){pairs.forEach(x=>{g.start[x.pos]=x.to;});say(label||'Starting lineup updated');}
  else{const b=++g.batch;const t=Math.round(clock(g));
    pairs.forEach(x=>g.events.push({b,t,pos:x.pos,from:d.L[x.pos]||null,to:x.to||null}));
    say((label||'Change made')+' at '+fmt(t));}
  save();
}
const STATS={sot:'Shot on target',soff:'Shot off target',kp:'Key pass',pass:'Good pass',bpass:'Bad pass',tackle:'Won the ball',slide:'Slide tackle won',int:'Interception',
  clr:'Clearance',blk:'Block',thr:'Throw-in',cross:'Cross',drib:'Beat defender',lost:'Lost ball',fwon:'Foul won',foul:'Foul',off:'Offside',corner:'Corner kick',
  save:'Save',catch:'Catch',dist:'Good distribution',gkick:'Goal kick'};
const TOPS={GK:['save','catch','dist','gkick','clr','bpass'],DEF:['tackle','int','clr','pass','thr','blk'],MID:['pass','kp','int','sot','tackle','thr'],FWD:['sot','soff','kp','pass','drib','fwon']};
const GK_ONLY=['save','catch','dist','gkick'];
/* Slide tackles aren't allowed until 11v11, so that stat only shows for 11v11 teams. */
const slideOK=()=>!!CFG()&&CFG().format==='11v11';
function statOrder(group){const top=TOPS[group]||TOPS.MID;const rest=Object.keys(STATS).filter(k=>!top.includes(k)&&(group==='GK'||!GK_ONLY.includes(k))&&(k!=='slide'||slideOK()));return {top,rest};}
function addStat(pos,id,k){
  const g=G();g.stats=g.stats||[];const t=Math.round(clock(g));
  g.stats.push({t,id,k,pos,u:uid('s')});
  if(k==='save'){g.saves.push({t,gk:id,u:uid('v')});}
  UI.lastStat={id,k,at:Date.now()};say(STATS[k]+', '+nm(id));save();
}
function undoStat(){
  const g=G();if(!g.stats.length){say('No stats to undo');return;}const s=dropItem(g,'stats',g.stats.length-1);
  if(s.k==='save'){for(let i=g.saves.length-1;i>=0;i--){if(g.saves[i].t===s.t&&g.saves[i].gk===s.id){dropItem(g,'saves',i);break;}}}
  say('Removed: '+STATS[s.k]+', '+nm(s.id));save();
}
function statCounts(g,extra){const c={};(g.stats||[]).concat(extra||[]).forEach(s=>{c[s.id]=c[s.id]||{};c[s.id][s.k]=(c[s.id][s.k]||0)+1;});return c;}
/* Parent stats: positive only, saved apart from the game record (see state.mjs). */
const POS_STATS=['sot','kp','pass','tackle','slide','int','clr','blk','cross','drib','fwon','save','catch','dist'];
const PST={srv:{},pend:[]};
function pstatsOf(gid){const srv=(PST.srv[S.team]||{})[gid]||[];const have=new Set(srv.map(x=>x.u));
  return srv.concat(PST.pend.filter(x=>x.team===S.team&&x.gid===gid&&!have.has(x.u)));}
async function addPstat(gid,st){
  const team=S.team;PST.pend.push(Object.assign({team,gid},st));S.mine=(S.mine||[]).concat(st.u).slice(-300);saveLocal();
  say('Thanks! '+STATS[st.k]+', '+nm(st.id));renderAll();
  try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'pstat',team,gid,stat:st})});if(!r.ok)throw 0;}
  catch(e){PST.pend=PST.pend.filter(x=>x.u!==st.u);say('That stat didn’t save. Check your signal and try again.');renderAll();}
}
async function delPstat(gid,u){
  const team=S.team;const body={kind:'pstatdel',team,gid,u,dv:S.dv};if(canEdit())Object.assign(body,creds());
  try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw 0;
    PST.pend=PST.pend.filter(x=>x.u!==u);const L=(PST.srv[team]||{})[gid];if(L)PST.srv[team][gid]=L.filter(x=>x.u!==u);say('Stat removed');}
  catch(e){say('Couldn’t remove that stat. Try again.');}
  renderAll();
}
function positiveHTML(g,plist){
  const c=statCounts({stats:(g.stats||[]).filter(s=>POS_STATS.includes(s.k)&&s.k!=='save')},plist);
  g.saves.forEach(v=>{if(v.gk){c[v.gk]=c[v.gk]||{};c[v.gk].save=(c[v.gk].save||0)+1;}});
  g.goals.forEach(x=>{if(x.side!=='us')return;if(x.by){c[x.by]=c[x.by]||{};c[x.by].g=(c[x.by].g||0)+1;}if(x.ast){c[x.ast]=c[x.ast]||{};c[x.ast].a=(c[x.ast].a||0)+1;}});
  const cols=[['G','g'],['A','a']].concat(POS_STATS.map(k=>[STATS[k],k])).filter(([,k])=>Object.values(c).some(x=>x[k]));
  const rows=PLAYERS.filter(p=>c[p.id]&&cols.some(([,k])=>c[p.id][k]));
  if(!rows.length)return '<div class="empty">No stats yet. Tap a player above to add the first one.</div>';
  return `<div class="rwrap"><table class="rtable"><thead><tr><th>Player</th>${cols.map(([l])=>`<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map(p=>`<tr><td class="pn">${esc(p.name)}${jn(p)}</td>${cols.map(([,k])=>{const v=c[p.id][k]||0;return `<td class="${v?'':'z'}">${v||'·'}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderParentStats(d){
  const g=G();const gc=GC();const pl=pstatsOf(gc.id);
  let h=`<p class="fine" style="margin-top:0">Saw something great? Tap the player and log it. Everyone following along sees these.</p>`;
  if(!g.started)h+='<div class="ctx">You can add stats once the game kicks off.</div>';
  else{const here=PLAYERS.filter(p=>av(g,p.id));const posOf=id=>POS.find(x=>d.L[x]===id);
    h+='<div class="pstgrid">'+here.filter(p=>d.on.has(p.id)).concat(here.filter(p=>!d.on.has(p.id))).map(p=>{const q=posOf(p.id);
      return `<button class="pstb ${q?'on':''}" data-act="pstatopen" data-id="${p.id}"><b>${esc(p.name)}</b>${jn(p)}<small>${q?'On at '+q:'Bench'}</small></button>`;}).join('')+'</div>';}
  h+='<h3>Great plays</h3>'+positiveHTML(g,pl);
  const mine=pl.filter(x=>(S.mine||[]).includes(x.u)).slice(-6).reverse();
  if(mine.length)h+=`<h3>You added</h3><ul class="log">${mine.map(x=>`<li><div class="lt">${tfmt(g,x.t)}</div><div class="ll"><div>${esc(nm(x.id))}: ${esc(STATS[x.k])}<button class="del" data-act="pstatundo" data-u="${x.u}">Undo</button></div></div></li>`).join('')}</ul>`;
  return h;
}
function teamShots(g){const st=g.stats||[];const goals=g.goals.filter(x=>x.side==='us').length;const sot=st.filter(s=>s.k==='sot').length,soff=st.filter(s=>s.k==='soff').length;
  return {shots:sot+soff+goals,onT:sot+goals,goals,saves:g.saves.length,ga:g.goals.filter(x=>x.side==='them').length,corners:st.filter(s=>s.k==='corner').length};}
function tapPos(p){
  if(UI.fieldMode==='stat'&&canEdit()){const id=replay(G()).L[p];if(id){UI.sheet={pos:p,id,more:false};renderAll();}return;}
  const sel=UI.sel;const d=replay(G());
  if(sel&&sel.type==='pos'){
    if(sel.pos===p)UI.sel=null;
    else{const a=d.L[sel.pos],b=d.L[p];change([{pos:sel.pos,to:b},{pos:p,to:a}],'Swapped '+nm(a)+' and '+nm(b));UI.sel=null;}
  }else if(sel&&sel.type==='player'){const g=G();if(pOff(g)&&g.started&&!sel.now)queueSet(sel.id,p);else{g.queue=(g.queue||[]).filter(q=>q.id!==sel.id);change([{pos:p,to:sel.id}],nm(sel.id)+' in for '+nm(d.L[p]));}UI.sel=null;}
  else{UI.sel={type:'pos',pos:p};S.tab='bench';}
  renderAll();
}
function tapBench(id){
  const sel=UI.sel;const g=G();const d=replay(g);
  if(sel&&sel.type==='pos'){const old=d.L[sel.pos];change([{pos:sel.pos,to:id}],nm(id)+' in for '+nm(old));
    if(sel.injury&&old){g.avail[old]=false;const later=PL().some((b,i)=>i>blockAt(g,clock(g))&&POS.some(x=>b[x]===old));
      say(nm(id)+' in, '+nm(old)+' marked out'+(later?'. Fix her later spots on the Plan tab':''));save();}
    UI.sel=null;}
  else if(sel&&sel.type==='player'&&sel.id===id)UI.sel=null;
  else UI.sel={type:'player',id};
  renderAll();
}
function applyPlan(k){
  const g=G();const d=replay(g);const target=PL()[k];if(!target)return;
  const pairs=POS.filter(p=>d.L[p]!==target[p]).map(p=>({pos:p,to:target[p]}));
  if(pairs.length)change(pairs,'Planned subs made');else say('Field already matches the plan');
  if(g.pending===k)g.pending=null;UI.sel=null;save();renderAll();
}
function pickSet(id){
  const g=G();const pk=UI.pick;if(!pk)return;const b=g.plan[pk.k];const old=b[pk.p];
  const syncStart=!g.started&&pk.k===0&&POS.every(x=>(g.start[x]||null)===(b[x]||null));
  if(old!==id){
    const q=POS.find(x=>b[x]===id);if(q)b[q]=old;b[pk.p]=id;
    if(pk.all&&old){for(let j=pk.k+1;j<g.plan.length;j++){const bj=g.plan[j];const r=POS.find(x=>bj[x]===old);if(r&&!POS.some(x=>bj[x]===id))bj[r]=id;}}
    say(nm(id)+' now planned at '+pk.p+' for '+blockRange(g,pk.k)+(pk.all?' and later':'')+(syncStart?'. Starting lineup updated':''));
    if(syncStart)g.start=Object.assign({},b);
  }
  UI.pick=null;save();renderAll();
}
function play(){
  const g=G();if(g.fullDone)return;unlockAudio();
  if(g.running){g.acc=clock(g);g.running=false;}
  else{g.started=true;g.runStart=T();g.running=true;wake();}
  save();renderAll();
}
function adjust(delta){
  const g=G();const E=ends(g);const tot=E[E.length-1];const c=Math.min(tot,Math.max(0,clock(g)+delta));
  const prev=g.stops.slice();g.acc=c;if(g.running)g.runStart=T();
  g.stops=E.filter(e=>e<c||(e===c&&prev.includes(e)));
  g.halfDone=c>=E[0];g.fullDone=c>=tot;if(g.fullDone){g.running=false;g.pending=null;if(!g.stops.includes(tot))g.stops.push(tot);}
  const r=regOf(g,c);g.alerted=g.alerted.filter(i=>i*SMS(g)<=r);
  if(g.pending!=null&&g.pending*SMS(g)>r)g.pending=null;
  save();renderAll();
}
/* Added (stoppage) time for period i. If that period is already over, everything after its end moves later too. */
function addedTime(i,d){
  const g=G();const E=ends(g);const c=clock(g);const end=E[i];if(end===undefined)return;
  const cur=XT(g,i);let nx=Math.max(0,cur+d);
  if(c<end||(c===end&&g.running)){const played=Math.max(0,c-(i?E[i-1]:0)-perLen(g,i));nx=Math.max(nx,played);}
  d=nx-cur;if(!d)return;
  while(g.xt.length<=i)g.xt.push(0);g.xt[i]=nx;
  if(c>=end&&!(c===end&&g.running)){const lo=end+Math.min(0,d);
    const mv=t=>t>=end?t+d:t>lo?lo:t;
    g.events.forEach(x=>x.t=mv(x.t));['goals','stats','saves'].forEach(k=>g[k].forEach(x=>x.t=mv(x.t)));
    g.stops=g.stops.map(x=>x>=end?x+d:x);g.acc+=d;}
  say(PNAME(g,i)+' added time now '+fmt(nx));save();renderAll();
}
function undo(){
  const g=G();if(!g.events.length)return;const last=g.events[g.events.length-1].b;
  g.events=g.events.filter(e=>e.b!==last);say('Last change undone');save();renderAll();
}
function addGoal(o){const g=G();if(!g.started){g.started=true;g.runStart=T();}o.u=uid('g');g.goals.push(o);g.goals.sort((a,b)=>a.t-b.t);}

/* ---------- Setup actions ---------- */
function applyForm(){
  const c=CFG();const key=teamKey(c);let n=0;
  const cf=customForm(c.formation);
  c.games.forEach(gc=>{gc.plan=null;const st=TS().games[gc.id];if(st&&!st.started){st.form=key;if(cf)st.formDef=cf.pos.map(p=>Object.assign({},p));else delete st.formDef;st.plan=autoPlan(st);st.start=Object.assign({},st.plan[0]||{});n++;}});
  useTeam();say(c.format+' '+formName(c)+' set'+(n?'. Rotations rebuilt for '+n+' game'+(n>1?'s':''):''));
}
function uid(p){return p+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36);}
function readLogo(f){
  if(!f)return;const r=new FileReader();
  r.onload=()=>{const img=new Image();img.onload=()=>{const s=160,sc=Math.min(1,s/Math.max(img.width,img.height));
    const cv=document.createElement('canvas');cv.width=Math.round(img.width*sc);cv.height=Math.round(img.height*sc);
    const cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(img,0,0,cv.width,cv.height);
    CFG().logo=cv.toDataURL('image/jpeg',0.85);say('Logo updated');save();renderAll();};img.src=r.result;};
  r.readAsDataURL(f);
}
const parentLink=()=>location.origin+location.pathname+'?team='+encodeURIComponent(S.team);
async function setCode(){
  const el=$('newcode');const nc=el?el.value.trim():'';
  if(nc.length<4){say('Use at least 4 characters for the code');renderHint();return;}
  try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({kind:'setcode',team:S.team,newCode:nc},creds()))});
    if(r.ok){say('Team code set. Share it with this team’s coaches.');el.value='';}
    else if(r.status===401)say('Your code can’t change this team’s code');else say('Couldn’t set the code');
  }catch(e){say('Couldn’t reach the server');}
  renderAll();
}

/* ---------- Click handling ---------- */
const LOCK_ACTS=new Set(['goalus','goalthem','goalminus','goaldel','goalby','goalast','save','savedel','reset','reopen','play','adj','adjset','xt','endgame','ot','otcancel','pk','pkus','pkres','pkthem','pkundo','pkquick','apply','applyq','statgoal','undo']);
const VIEW_OK=new Set(['sheetclose','game','tab','unlock','song','cancel','pickcancel','teamgo','pstatopen','pstat','pstatundo']);
function act(a,ds){
  if(!CFG()&&a!=='teamgo')return;
  const g=CFG()?G():null;
  if(!canEdit()&&!VIEW_OK.has(a)){say('You’re following along. Coaches can unlock on the Team tab.');renderHint();return;}
  if(EXT[a]){if(EXT[a](ds,g)!==false)renderAll();return;}
  if(g&&LOCK_ACTS.has(a)&&gameLocked()){say('This game is final and locked. Unlock it on the Players tab first.');renderHint();return;}
  switch(a){
    case 'editor':S.auth={};delete S.master;S.sess='';ME.user=null;saveLocal();resetSync();SY.first=false;say('This device is now view only');break;
    case 'unlock':unlock();return;
    case 'song':S.song=!songOn();saveLocal();if(S.song){primeSong();say('Goal song on for this device');}else{try{songAudio().pause();}catch(e){}say('Goal song off for this device');}break;
    case 'fmode':UI.fieldMode=ds.m;UI.sel=null;break;
    case 'sheetclose':UI.sheet=null;break;
    case 'pstatopen':{const d=replay(g);const q=POS.find(x=>d.L[x]===ds.id);const p=P[ds.id];UI.sheet={id:ds.id,parent:true,grp:q?PI[q].g:(p&&gr(p)[0])||'MID'};break;}
    case 'pstat':if(UI.sheet&&UI.sheet.parent&&g.started){const st={id:UI.sheet.id,k:ds.k,t:Math.round(clock(g)),u:uid('p'),dv:S.dv};UI.sheet=null;addPstat(GC().id,st);return;}break;
    case 'pstatundo':delPstat(GC().id,ds.u);return;
    case 'pstatdel':{const k='pst'+ds.u;if(armed(k)){UI.arm=null;delPstat(GC().id,ds.u);return;}arm(k);break;}
    case 'sheetmore':if(UI.sheet)UI.sheet.more=!UI.sheet.more;break;
    case 'stat':if(UI.sheet){addStat(UI.sheet.pos,UI.sheet.id,ds.k);UI.sheet=null;}break;
    case 'statgoal':if(UI.sheet){const by=UI.sheet.id,t=Math.round(clock(g));const o={side:'us',t,by};addGoal(o);UI.lastUs=scoreOf(g).us;UI.goal={side:'us',t,step:'ast',by,u:o.u};UI.sheet=null;playSong();say('Goal! '+nm(by)+'. Add an assist above if there was one.');save();}break;
    case 'statundo':undoStat();break;
    case 'statdel':{const k=+ds.i;if(armed('stat'+k)){const s=dropItem(g,'stats',k);if(s&&s.k==='save'){const i=g.saves.findIndex(x=>x.t===s.t&&x.gk===s.id);if(i>=0)dropItem(g,'saves',i);}UI.arm=null;save();}else arm('stat'+k);break;}
    case 'goalminus':{const side=ds.side;const k=g.goals.map((x,i)=>x.side===side?i:-1).filter(i=>i>=0).pop();
      if(k===undefined){say('No goal to take off');break;}
      if(armed('minus'+side)){dropItem(g,'goals',k);UI.arm=null;UI.lastUs=scoreOf(g).us;say('Goal taken off');save();}else{arm('minus'+side);say('Tap − again to take off the last '+(side==='us'?shortName():oppName())+' goal');}break;}
    case 'goalus':UI.goal={side:'us',t:Math.round(clock(g)),step:'by'};playSong();break;
    case 'goalthem':{const d=replay(g);addGoal({side:'them',t:Math.round(clock(g)),gk:d.L.GK||null});say(oppName()+' goal at '+fmt(clock(g)));save();break;}
    case 'endgame':
      if(armed('endgame')){if(g.running){g.acc=clock(g);g.running=false;}g.started=true;g.fullDone=true;g.halfDone=true;g.pending=null;
        const E=ends(g);if(!g.stops.includes(E[E.length-1]))g.stops.push(E[E.length-1]);UI.arm=null;UI.sel=null;
        const sc=scoreOf(g);say('Final: '+shortName()+' '+sc.us+', '+oppName()+' '+sc.them);save();}
      else{arm('endgame');say('Tap End game again to make the score final');}
      break;
    case 'unlockgame':if(!isHead()){say('Only a head coach can unlock a finished game');break;}UI.unlock[GC().id]=true;say('Unlocked on this device. Changes to the result are saved.');break;
    case 'relock':delete UI.unlock[GC().id];say('Locked again');break;
    case 'reopen':if(armed('reopen')){g.fullDone=false;UI.arm=null;say('Game reopened');save();}else arm('reopen');break;
    case 'goalcancel':UI.goal=null;break;
    case 'goalby':if(!UI.goal)break;
      if(ds.id){const o={side:'us',t:UI.goal.t,by:ds.id};addGoal(o);UI.lastUs=scoreOf(g).us;UI.goal.by=ds.id;UI.goal.u=o.u;UI.goal.step='ast';say('Goal! '+nm(ds.id)+' at '+fmt(UI.goal.t));save();}
      else{addGoal({side:'us',t:UI.goal.t});UI.lastUs=scoreOf(g).us;say('Goal '+shortName()+'!');UI.goal=null;save();}
      break;
    case 'goalast':if(!UI.goal)break;
      {const x=UI.goal.u&&g.goals.find(q=>q.u===UI.goal.u);
      if(UI.goal.u){if(x&&ds.id){x.ast=ds.id;say('Assist: '+nm(ds.id));}}else addGoal({side:'us',t:UI.goal.t,by:UI.goal.by,ast:ds.id||null});
      UI.lastUs=scoreOf(g).us;UI.goal=null;save();break;}
    case 'goaldel':{const k=+ds.i;if(armed('goal'+k)){dropItem(g,'goals',k);UI.arm=null;say('Goal removed');save();}else arm('goal'+k);break;}
    case 'save':{const d=replay(g);g.saves.push({t:Math.round(clock(g)),gk:d.L.GK||null,u:uid('v')});say('Save, '+nm(d.L.GK));save();break;}
    case 'savedel':{const k=+ds.i;if(armed('save'+k)){dropItem(g,'saves',k);UI.arm=null;say('Save removed');save();}else arm('save'+k);break;}
    case 'ot':if(g.fullDone&&!g.ot&&!g.pk){g.ot={n:g.otN||2,len:g.otLen||5};g.fullDone=false;say('Overtime added. Tap Start overtime when ready.');save();}break;
    case 'otcancel':if(g.ot&&!g.running&&clock(g)===ends(g)[1]){g.ot=null;g.fullDone=true;save();}break;
    case 'pk':if(g.fullDone&&!g.pk){g.pk={us:[],them:[],order:[]};save();}break;
    case 'pkus':UI.pk={step:'kicker'};break;
    case 'pkquick':{if(!g.pk||pkState(g).win)break;const id=nextKicker(g);if(!id)break;g.pk.us.push({id,made:ds.m==='1'});g.pk.order.push('us');if(ds.m==='1')playSong();
      const st=pkState(g);say(nm(id)+(ds.m==='1'?' scores':' misses')+(st.win?'. '+(st.win==='us'?shortName():oppName())+' win the shootout '+st.u+'–'+st.t:''));save();break;}
    case 'pkfirst':if(g.pk&&!g.pk.order.length){g.pk.first=ds.s;save();}break;
    case 'pkedit':S.tab='plan';saveLocal();break;
    case 'pkadd':if(!g.pkOrder.includes(ds.id)){g.pkOrder.push(ds.id);save();}break;
    case 'pkrm':g.pkOrder.splice(+ds.i,1);save();break;
    case 'pkmv':{const i=+ds.i,j=i+(+ds.d);if(j>=0&&j<g.pkOrder.length){const x=g.pkOrder[i];g.pkOrder[i]=g.pkOrder[j];g.pkOrder[j]=x;save();}break;}
    case 'pkclear':if(armed('pkclear')){g.pkOrder=[];UI.arm=null;save();}else arm('pkclear');break;
    case 'pkkicker':UI.pk={step:'result',id:ds.id};break;
    case 'pkres':if(UI.pk&&UI.pk.id){g.pk.us.push({id:UI.pk.id,made:ds.m==='1'});g.pk.order.push('us');if(ds.m==='1')playSong();UI.pk=null;save();}break;
    case 'pkthem':g.pk.them.push(ds.m==='1');g.pk.order.push('them');save();break;
    case 'pkundo':{const o=g.pk.order.pop();if(o==='us')g.pk.us.pop();else if(o==='them')g.pk.them.pop();else if(!g.pk.us.length&&!g.pk.them.length)g.pk=null;UI.pk=null;save();break;}
    case 'pkcancel':UI.pk=null;break;
    case 'game':S.cur[S.team]=+ds.i;S.pick=S.pick||{};{const pg=CFG().games[+ds.i];if(pg)S.pick[S.team]={id:pg.id,at:Date.now()};}UI.planK=null;UI.goal=null;UI.pk=null;UI.sel=null;UI.adj=false;UI.pick=null;UI.win=undefined;UI.lastUs=undefined;useTeam();saveLocal();break;
    case 'tab':S.tab=ds.t;if(ds.t!=='plan'){UI.planK=null;UI.pick=null;}if(ds.t==='setup')loadTeamList();saveLocal();break;
    case 'play':play();return;
    case 'undo':undo();return;
    case 'adjtoggle':UI.adj=!UI.adj;break;
    case 'adj':adjust(+ds.d*1000);return;
    case 'adjset':{const el=$('adjto');const v=String(el&&el.value||'').trim();const m=v.match(/^(\d{1,3})(?::(\d{1,2}))?$/);
      if(!m||+(m[2]||0)>59){say('Type the time like 23:40');renderHint();return;}
      const t=fromReg(g,(+m[1]*60+(+(m[2]||0)))*1000);adjust(t-clock(g));say('Clock set to '+fmtClock(regOf(g,clock(g))));renderHint();return;}
    case 'xt':addedTime(+ds.i,+ds.d*1000);return;
    case 'pos':tapPos(ds.p);return;
    case 'bench':tapBench(ds.id);return;
    case 'cancel':UI.sel=null;break;
    case 'injury':if(UI.sel&&UI.sel.type==='pos')UI.sel.injury=!UI.sel.injury;break;
    case 'editplan':S.tab='plan';UI.pick=null;saveLocal();break;
    case 'planedit':{const k=+ds.k;UI.planK=UI.planK===k?null:k;UI.pick=null;break;}
    case 'planedone':UI.planK=null;UI.pick=null;break;
    case 'cell':{const k=+ds.k,p=ds.p;const pk=UI.pick;UI.planK=k;
      // Second tap on the same block swaps the two spots; an empty spot just takes the player.
      if(pk&&pk.k===k&&pk.p!==p){const b=g.plan[k];if(b[p])pickSet(b[p]);else{b[p]=b[pk.p];b[pk.p]=null;UI.pick=null;say(nm(b[p])+' moved to '+p);save();renderAll();}return;}
      UI.pick=(pk&&pk.k===k&&pk.p===p)?null:{k,p,all:false};break;}
    case 'pbench':{const pk=UI.pick;if(pk&&pk.k===+ds.k){pickSet(ds.id);return;}say('Tap a player on the field first, then the bench player to bring in');renderHint();break;}
    case 'pickall':if(UI.pick)UI.pick.all=!UI.pick.all;break;
    case 'pickcancel':UI.pick=null;break;
    case 'pickset':pickSet(ds.id);return;
    case 'planview':S.planView=ds.v;saveLocal();break;
    case 'planreset':
      if(armed('planreset')){const gc=GC();g.plan=validPlan(gc.plan,g)?gc.plan.map(b=>Object.assign({},b)):autoPlan(g);UI.arm=null;UI.pick=null;say('Saved plan restored');save();}
      else arm('planreset');break;
    case 'planauto':
      if(armed('planauto')){g.plan=autoPlan(g);if(!g.started)g.start=Object.assign({},g.plan[0]||{});UI.arm=null;UI.pick=null;say('New rotation built from who’s here');save();}
      else arm('planauto');break;
    case 'apply':applyPlan(+ds.k);return;
    case 'startwith':g.start=Object.assign({},PL()[+ds.k]);say('Starting lineup set from '+blockRange(g,+ds.k));save();break;
    case 'applyq':{const d=replay(g);const q=liveQueue(g,d);if(q.length)change(q.map(x=>({pos:x.pos,to:x.id})),'Subs made');g.queue=[];g.pending=null;UI.sel=null;save();break;}
    case 'planoff':g.planOff=!g.planOff;if(!g.planOff)g.queue=[];UI.sel=null;say(g.planOff?'Plan off. Tap a bench player to line up where she goes in.':'Following the plan again');save();break;
    case 'benchq':if(UI.sel&&UI.sel.type==='player'){queueSet(UI.sel.id,ds.p);UI.sel=null;}break;
    case 'benchnow':if(UI.sel&&UI.sel.type==='player'){const id=UI.sel.id;const d=replay(g);g.queue=(g.queue||[]).filter(q=>q.id!==id);change([{pos:ds.p,to:id}],nm(id)+' in for '+nm(d.L[ds.p]));UI.sel=null;}break;
    case 'benchnowmode':if(UI.sel&&UI.sel.type==='player')UI.sel.now=!UI.sel.now;break;
    case 'unq':g.queue=(g.queue||[]).filter(q=>q.id!==ds.id);UI.sel=null;say(nm(ds.id)+' is no longer lined up');save();break;
    case 'dismiss':g.pending=null;save();break;
    case 'avail':g.avail[ds.id]=!av(g,ds.id);if(UI.sel&&UI.sel.type==='player'&&UI.sel.id===ds.id)UI.sel=null;save();break;
    case 'set':{const k=ds.key,dl=+ds.d;
      if(k==='half')g.half=Math.min(60,Math.max(5,g.half+dl));if(k==='sub')g.sub=Math.min(30,Math.max(2,g.sub+dl));
      if(k==='otLen')g.otLen=Math.min(15,Math.max(1,g.otLen+dl));if(k==='otN')g.otN=Math.min(2,Math.max(1,g.otN+dl));save();break;}
    case 'beep':S.beep=!S.beep;if(S.beep){unlockAudio();lastAlarm=0;alarm();}saveLocal();break;
    case 'reset':
      if(armed('reset')){const ng=freshGame(GC(),g);ng.del=g.del.concat(g.goals,g.stats,g.saves).map(x=>x.u||x).filter((x,i,a)=>typeof x==='string'&&a.indexOf(x)===i);TS().games[GC().id]=ng;UI.pick=null;UI.arm=null;UI.sel=null;UI.goal=null;UI.pk=null;useTeam();say(GC().title+' reset');save();}
      else arm('reset');break;
    /* setup */
    case 'fmt':{const c=CFG();if(c.format!==ds.f){c.format=ds.f;c.formation=Object.keys(FORMS[ds.f])[0];applyForm();save();}break;}
    case 'formation':{const c=CFG();if(c.formation!==ds.n){c.formation=ds.n;applyForm();save();}break;}
    case 'grp':{const p=P[ds.id];if(p){const i=p.gr.indexOf(ds.g);if(i>=0)p.gr.splice(i,1);else p.gr.push(ds.g);save();}break;}
    case 'guest':{const p=P[ds.id];if(p){p.guest=!p.guest;save();}break;}
    case 'pladd':{const c=CFG();const p={id:uid('p'),name:'New player',gr:['MID']};c.players.push(p);useTeam();UI.focus='pl-'+p.id;save();break;}
    case 'pldel':{if(armed('pldel'+ds.id)){const c=CFG();c.players=c.players.filter(p=>p.id!==ds.id);useTeam();UI.arm=null;say('Player removed');save();}else arm('pldel'+ds.id);break;}
    case 'gmadd':{const c=CFG();const last=c.games[c.games.length-1]||{};c.games.push({id:uid('g'),title:'Game '+(c.games.length+1),opp:'',dt:'',field:'',place:last.place||'',half:last.half||30,sub:last.sub||10,out:[]});say('Game added');save();break;}
    case 'gmdel':{const c=CFG();if(c.games.length<2){say('A team needs at least one game');break;}
      if(armed('gmdel'+ds.gid)){c.games=c.games.filter(x=>x.id!==ds.gid);delete TS().games[ds.gid];S.cur[S.team]=Math.min(curIdx(),c.games.length-1);useTeam();UI.arm=null;say('Game removed');save();}
      else arm('gmdel'+ds.gid);break;}
    case 'gmplan':{if(armed('gmplan'+ds.gid)){const gc=CFG().games.find(x=>x.id===ds.gid);if(gc){const st=stateOf(gc);st.plan=autoPlan(st);if(!st.started)st.start=Object.assign({},st.plan[0]||{});say('Rotation rebuilt for '+gc.title);}UI.arm=null;save();}
      else arm('gmplan'+ds.gid);break;}
    case 'opplogodel':{const gc=CFG().games.find(x=>x.id===ds.gid);if(gc){delete gc.oppLogo;save();}break;}
    case 'cfgplan':{const c=CFG();c.usePlan=!c.usePlan;if(!c.usePlan&&S.tab==='plan')S.tab='bench';UI.pick=null;UI.planK=null;say(c.usePlan?'Rotation plan on. The Plan tab is back.':'Rotation plan off. Sub alerts still sound; tap bench players to line up subs.');save();break;}
    case 'cfgsong':CFG().song=!CFG().song;save();break;
    case 'logodel':CFG().logo=null;save();break;
    case 'teamnew':UI.newTeam=true;break;
    case 'teamnewcancel':UI.newTeam=false;break;
    case 'ntfmt':UI.ntFmt=ds.f;break;
    case 'teamcreate':createTeam();return;
    case 'teamgo':switchTeam(ds.id);return;
    case 'puball':publishAll();return;
    case 'reload':location.reload();return;
    case 'setcode':setCode();return;
    case 'testmake':testAction('testcopy');return;
    case 'testopen':goTeam(testIdOf(S.team));return;
    case 'testback':goTeam(CFG().testOf);return;
    case 'testreset':if(armed('testreset')){UI.arm=null;testAction('testcopy');return;}arm('testreset');break;
    case 'testdel':if(armed('testdel')){UI.arm=null;testAction('testdel');return;}arm('testdel');break;
    case 'copyclub':{try{navigator.clipboard.writeText(location.origin+clubLink()).then(()=>{say('Club link copied');renderHint();},()=>{});}catch(e){}break;}
    case 'copylink':{const link=parentLink();
      try{navigator.clipboard.writeText(link).then(()=>{say('Parent link copied');renderHint();},()=>{say('Press and hold the link to copy it');renderHint();});}catch(e){say('Press and hold the link to copy it');}
      break;}
  }
  renderAll();
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&UI.sheet){UI.sheet=null;renderSheet();}});
document.addEventListener('submit',e=>{if(e.target&&e.target.dataset&&e.target.dataset.form==='unlock'){e.preventDefault();unlock();}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b||b.disabled)return;act(b.dataset.act,b.dataset);});
document.addEventListener('input',e=>{if(e.target&&e.target.id==='nt-name')UI.ntName=e.target.value;});
document.addEventListener('change',e=>{
  const el=e.target;const k=el&&el.dataset&&el.dataset.cfg;if(!k||!CFG()||!canEdit())return;
  const c=CFG();
  if(k==='team'){c[el.dataset.f]=el.value.trim();}
  else if(k==='pl'&&el.dataset.f==='grad'){const p=P[el.dataset.id];if(p){if(+el.value)p.grad=+el.value;else delete p.grad;}}
  else if(k==='pl'){const p=P[el.dataset.id];if(p&&el.dataset.f==='num')p.num=el.value.replace(/[^0-9]/g,'').slice(0,3);else if(p&&el.value.trim())p[el.dataset.f]=el.value.trim();}
  else if(k==='gm'){const gc=c.games.find(x=>x.id===el.dataset.gid);if(!gc)return;const f=el.dataset.f;
    if(f==='half'||f==='sub'){const v=parseInt(el.value,10);if(!v)return;const lim=f==='half'?[5,60]:[2,30];const nv=Math.min(lim[1],Math.max(lim[0],v));
      if(nv!==gc[f]){gc[f]=nv;gc.plan=null;const st=TS().games[gc.id];if(st){st[f]=nv;if(!st.started){st.plan=autoPlan(st);st.start=Object.assign({},st.plan[0]||{});}}}}
    else if(f==='dtdate'||f==='dttime'){const cur=String(gc.dt||''),d=f==='dtdate'?el.value:cur.slice(0,10),t=f==='dttime'?el.value:cur.slice(11,16);gc.dt=d?(t?d+'T'+t:d):'';}
    else gc[f]=el.value.trim();}
  else if(k==='logo'){readLogo(el.files&&el.files[0]);return;}
  else if(k==='opplogo'){const gc=c.games.find(x=>x.id===el.dataset.gid);const f=el.files&&el.files[0];if(!gc||!f)return;const r=new FileReader();
    r.onload=()=>{const img=new Image();img.onload=()=>{const s=96,sc=Math.min(1,s/Math.max(img.width,img.height));const cv=document.createElement('canvas');cv.width=Math.round(img.width*sc);cv.height=Math.round(img.height*sc);
      const cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(img,0,0,cv.width,cv.height);gc.oppLogo=cv.toDataURL('image/jpeg',0.85);say('Opponent logo updated');save();renderAll();};img.src=r.result;};r.readAsDataURL(f);return;}
  save();renderAll();
});

/* ---------- Rendering ---------- */
function status(gc){
  const g=stateOf(gc);const sc=scoreOf(g);const pk=g.pk?', PKs '+pkScore(g).us+'–'+pkScore(g).them:'';const ss=' ('+sc.us+'–'+sc.them+pk+')';
  const st=gStatus(gc);
  if(st==='final')return 'Final'+ss;
  if(st==='postponed')return 'Postponed';
  if(st==='awaiting')return statusLabel(st,g)+(g.started?ss:'');
  if(!g.started||['today','upcoming','undated'].includes(st))return whenText(gc)+(g.started&&(sc.us||sc.them)?ss:'');
  if(st==='halftime')return 'Halftime'+ss;
  const e=pausedAt(g);if(e!=null)return endLabel(g,e)+ss;
  return (g.running?'Live ':'Paused ')+tfmt(g,clock(g))+ss;
}
const placeIcon=l=>/champion/i.test(l)?'🏆':/finalist/i.test(l)?'🥈':/^3rd/i.test(l)?'🥉':'🏅';
const placeText=pl=>pl&&pl.label?placeIcon(pl.label)+' '+pl.label+(pl.event?', '+pl.event:''):'';
/* ---------- Test team: a hidden copy of a team (ID-test) for trying things without touching real games ---------- */
const TEST={exists:{},busy:false};
const testIdOf=id=>id+'-test';
async function testCheck(id){if(TEST.exists[id]!==undefined||!SY.on)return;TEST.exists[id]=null;
  try{const r=await fetch(API+'?team='+encodeURIComponent(testIdOf(id)),{cache:'no-store'});const j=await r.json();TEST.exists[id]=!!(j&&j.config);}catch(e){TEST.exists[id]=false;}renderAll();}
function goTeam(id){if(S.auth&&S.auth[S.team]&&!S.auth[id])S.auth[id]=S.auth[S.team];saveLocal();location.href=location.pathname+'?team='+encodeURIComponent(id);}
async function testAction(kind){const c=CFG();const src=c.test?c.testOf:S.team;TEST.busy=true;renderAll();
  const r=await apiPost(Object.assign({kind,team:src},creds()));TEST.busy=false;
  if(!r.ok){say(r.j.error||'Couldn’t do that');renderAll();return;}
  if(kind==='testdel'){TEST.exists[src]=false;delete S.T[testIdOf(src)];saveLocal();say('Test team deleted');if(c.test){goTeam(src);return;}renderAll();return;}
  TEST.exists[src]=true;
  // Take the fresh copy as-is on this device too.
  if(S.T[testIdOf(src)])delete S.T[testIdOf(src)];saveLocal();
  if(c.test){location.reload();return;}
  say('Test team ready ('+r.j.games+' games copied)');goTeam(testIdOf(src));}
function testTeamHTML(){const c=CFG();if(!SY.on)return '';
  if(c.test){const real=(S.T[c.testOf]&&S.T[c.testOf].cfg&&S.T[c.testOf].cfg.name)||'the real team';
    return `<div class="card testcard"><h3>🧪 This is a test team</h3><p class="fine" style="margin-top:-4px">A private copy of ${esc(real)}. Try plans, voice changes, practices and games here; the real team isn’t affected and parents never see this team.</p>
      <div class="gacts"><button class="btn small primary-s" data-act="testback">‹ Back to ${esc(real)}</button><button class="btn small ${armed('testreset')?'danger-s armed':''}" data-act="testreset" ${TEST.busy?'disabled':''}>${armed('testreset')?'Tap again: copy the real team again':'Reset from the real team'}</button>
      <button class="btn small ${armed('testdel')?'danger-s armed':''}" data-act="testdel" ${TEST.busy?'disabled':''}>${armed('testdel')?'Tap again to delete':'Delete test team'}</button></div></div>`;}
  testCheck(S.team);const ex=TEST.exists[S.team];
  return `<div class="card testcard"><h3>🧪 Test team</h3><p class="fine" style="margin-top:-4px">A private copy of ${esc(c.name)} (players, games, plans, practices) to try things on. It never shows on the club page or the team list; open it from here. The same coach code works there.</p>
    <div class="gacts">${ex?`<button class="btn small primary-s" data-act="testopen">Open test team</button><button class="btn small ${armed('testreset')?'danger-s armed':''}" data-act="testreset" ${TEST.busy?'disabled':''}>${armed('testreset')?'Tap again: start over from today’s team':'Reset from this team'}</button>`
      :ex===false?`<button class="btn small primary-s" data-act="testmake" ${TEST.busy?'disabled':''}>${TEST.busy?'Copying…':'Make a test team'}</button>`:'<span class="fine">Checking…</span>'}</div></div>`;}
function renderBrand(){
  const c=CFG();document.documentElement.classList.toggle('testteam',!!c.test);
  $('bname').innerHTML=`<span class="bn">${esc(teamShortTitle(c))}</span>`;$('bname').title=c.name;$('bsub').textContent=c.name;
  const ini=c.name.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
  $('blogo').innerHTML=c.logo?`<img src="${esc(c.logo)}" alt="${esc(c.name)}">`:`<span class="badge">${esc(ini)}</span>`;
  document.title=c.name+(document.documentElement.classList.contains('beta')?' (Beta)':' game tracker');setAppTitle(teamShortTitle(c));
}
function renderGames(){
  $('games').innerHTML=`<a class="gbtn clubbtn" href="${clubLink()}"><b>‹ Club</b><small>All teams</small></a>`+CFG().games.map((gc,i)=>gc.imported&&i!==curIdx()&&!(Date.now()-new Date(gc.dt).getTime()<7*864e5)?'':`<button class="gbtn" data-act="game" data-i="${i}" aria-pressed="${i===curIdx()}"><b>${esc(gc.title)}</b><small data-lv="gstat" data-i="${i}">${esc(status(gc))}</small></button>`).join('');
}
function renderClock(){
  const g=G();const c=clock(g);const H=HMS(g),SUB=SMS(g);const r=regOf(g,c),xs=stopIn(g,c),E=ends(g);
  $('time').textContent=fmtClock(r)+(xs>0?' +'+fmt(xs):'');
  let per;const e=pausedAt(g);
  const gst=gStatus(GC());
  if(g.pk)per='Penalty kicks';
  else if(g.fullDone)per='Full time';
  else if(gst==='awaiting'||gst==='postponed')per=statusLabel(gst,g);
  else if(gst==='halftime')per='Halftime';
  else if(!g.started||gst!=='live')per=isParent()?'Kickoff '+whenText(GC()):'Ready to kick off';
  else if(e!=null)per=endLabel(g,e);
  else per=periodName(g,c)+(g.running?'':' (paused)');
  $('period').textContent=per;
  const nx=$('next');nx.style.display=isParent()||gst==='awaiting'||gst==='postponed'?'none':'';
  // Before kickoff, parents see the kickoff time rather than a 00:00 clock.
  const cf=$('time').parentElement;if(cf)cf.classList.toggle('pre',isParent()&&!g.started&&['today','upcoming','undated'].includes(gst));
  if(isParent()){}
  else if(g.fullDone){nx.className='next';nx.innerHTML='<span>Game over</span><b>Final</b>';}
  else if(g.pending!=null){nx.className='next due';nx.innerHTML='<span>Subs due</span><b>Now</b>';}
  else{const nb=(Math.floor(r/SUB)+1)*SUB;const tot=totalMs(g);const pe=E[periodOf(g,c)];
    if(xs>0){nx.className='next';nx.innerHTML='<span>'+(pe===E[0]?'Halftime':pe===tot?'Full time':'Period ends')+' in</span><b>'+fmt(pe-c)+'</b>';}
    else if(r>=2*H){nx.className='next';nx.innerHTML='<span>Overtime ends in</span><b>'+fmt(tot-c)+'</b>';}
    else if(nb>=2*H){nx.className='next';nx.innerHTML='<span>Full time in</span><b>'+fmt(E[1]-c)+'</b>';}
    else{const left=nb===H?E[0]-c:nb-r;nx.className='next'+(left<=30000&&g.running?' soon':'');
      nx.innerHTML='<span>'+(nb===H?'Halftime in':'Next sub in')+'</span><b>'+fmt(left)+'</b>';}}
  document.querySelectorAll('[data-lv="gstat"]').forEach(el=>{const gc=CFG().games[+el.dataset.i];if(gc)el.textContent=status(gc);});
}
function renderCtrl(){
  const g=G();const c=clock(g);
  if(!canEdit()){$('ctrl').innerHTML='';$('adjrow').hidden=true;return;}
  let label='Resume',cls='btn primary';const e=pausedAt(g);
  if(g.running){label='Pause';cls+=' pause';}
  else if(g.fullDone)label='Final';
  else if(!g.started)label='Kick off';
  else if(e!=null){const E=ends(g);label=e===E[0]?'Start 2nd half':e===E[1]?'Start overtime':'Start OT '+(otIndex(g,e)+1);}
  // One main game action beside the clock. Undo, clock fixes and End game are in the ⋯ menu.
  $('ctrl').innerHTML=g.fullDone?'':`<button class="${cls}" data-act="play">${label}</button>`;
  const ar=$('adjrow');if(!g.started)UI.adj=false;ar.hidden=!UI.adj;
  if(UI.adj&&document.activeElement&&document.activeElement.id==='adjto')return;
  if(UI.adj){const E=ends(g);const at=E.indexOf(c);const pi=periodOf(g,c);const last=at>=0&&!g.running?at:pi;
    let st='';for(let i=0;i<=last&&i<E.length;i++)st+=`<div class="adjl"><span>${PNAME(g,i)} added time <b>${fmt(XT(g,i))}</b></span><button class="btn small" data-act="xt" data-i="${i}" data-d="-60" ${XT(g,i)?'':'disabled'}>−1 min</button><button class="btn small" data-act="xt" data-i="${i}" data-d="60">+1 min</button></div>`;
    ar.innerHTML=`<div class="adjbg" data-act="adjtoggle"></div><div class="adjsheet"><div class="adjhead"><b>Clock</b><button class="btn small primary-s" data-act="adjtoggle">Done</button></div><div class="adjp"><div class="adjc"><h4>Fix the clock</h4><p class="fine">Match our clock to the ref’s watch.</p>
      <div class="adjl"><span>Ref stopped play, our clock is ahead</span><button class="btn small" data-act="adj" data-d="-300">−5:00</button><button class="btn small" data-act="adj" data-d="-60">−1:00</button><button class="btn small" data-act="adj" data-d="-10">−0:10</button></div>
      <div class="adjl"><span>Our clock is behind (late start)</span><button class="btn small" data-act="adj" data-d="10">+0:10</button><button class="btn small" data-act="adj" data-d="60">+1:00</button><button class="btn small" data-act="adj" data-d="300">+5:00</button></div>
      <div class="adjl"><span>Or set it to</span><input id="adjto" class="adjin" inputmode="numeric" placeholder="mm:ss" aria-label="Set the clock to minutes and seconds"><button class="btn small primary-s" data-act="adjset">Set clock</button></div></div>
      <div class="adjc"><h4>Added time</h4><p class="fine">Ref played past ${g.half}:00? Add it here, even after the whistle. The players who were on get the minutes, and the next half’s subs move with it.</p>${st}</div>
      <div class="adjc"><button class="btn small danger-s ${armed('reset')?'armed':''}" data-act="reset">${armed('reset')?'Tap again to reset':'Reset '+esc(GC().title)}</button></div></div></div>`;}
}
/* A game that has gone quiet past its expected end (or never got a score) asks a coach for the result.
   The app never makes a score final on its own. */
function resultPromptHTML(g,gc){
  const sc=scoreOf(g),rs=UI.rs&&UI.rs.gid===gc.id?UI.rs:{us:sc.us,them:sc.them},played=g.started;
  return `<div class="resultbox" role="group" aria-label="Final score"><p><b>${played?'Is this the final score?':'No result yet'}</b><span class="muted">${played?' This game looks finished.':' Enter the final score when you have it.'}</span></p>
    <div class="rsin"><label><span>${esc(shortName())}</span><input data-rs="us" type="number" inputmode="numeric" min="0" max="40" value="${rs.us}"></label><span class="dash" aria-hidden="true">–</span><label><span>${esc(oppName())}</span><input data-rs="them" type="number" inputmode="numeric" min="0" max="40" value="${rs.them}"></label></div>
    <div class="gacts"><button class="btn primary-s" data-act="rsfinal">Save final score</button>${isHead()&&!played?'<button class="btn small" data-act="rspost">Mark postponed</button>':''}</div></div>`;
}
document.addEventListener('input',e=>{const k=e.target&&e.target.dataset&&e.target.dataset.rs;if(!k||!CFG())return;
  const gc=GC(),sc=scoreOf(G());if(!UI.rs||UI.rs.gid!==gc.id)UI.rs={gid:gc.id,us:sc.us,them:sc.them};UI.rs[k]=e.target.value;});
EXT.rsfinal=()=>{
  const g=G(),gc=GC(),sc=scoreOf(g),rs=UI.rs&&UI.rs.gid===gc.id?UI.rs:sc;
  const n=v=>Math.max(0,Math.min(40,parseInt(v,10)||0)),want={us:n(rs.us),them:n(rs.them)};
  ['us','them'].forEach(side=>{let have=g.goals.filter(x=>x.side===side).length;
    while(have>want[side]){dropItem(g,'goals',g.goals.map(x=>x.side).lastIndexOf(side));have--;}
    while(have<want[side]){g.goals.push({side,t:Math.round(clock(g)),u:uid('g')});have++;}});
  if(g.running){g.acc=clock(g);g.running=false;}
  g.started=true;g.fullDone=true;g.halfDone=true;g.pending=null;const E=ends(g);if(!g.stops.includes(E[E.length-1]))g.stops.push(E[E.length-1]);
  UI.rs=null;UI.lastUs=scoreOf(g).us;say('Final score saved: '+shortName()+' '+want.us+', '+oppName()+' '+want.them);save();
};
EXT.rspost=()=>{if(!isHead()){say('Only a head coach can change the schedule');return;}GC().status='postponed';say('Marked postponed. Change the date in Team › Schedule.');save();};
function renderScore(){
  const g=G();const gc=GC();const sc=scoreOf(g);const ed=canEdit();const d=replay(g);
  // Don't redraw while a coach is typing a final score.
  const ae=document.activeElement;if(ae&&ae.dataset&&ae.dataset.rs)return;
  const gst=gStatus(gc);
  const key=S.team+'/'+gc.id;
  if(UI.lastUs!==undefined&&UI.lastKey===key&&sc.us>UI.lastUs)playSong();
  UI.lastUs=sc.us;UI.lastKey=key;
  const pmb=side=>ed?`<span class="pm"><button class="gbtn2" data-act="goal${side}">+ Goal</button><button class="mbtn ${armed('minus'+side)?'armed':''}" data-act="goalminus" data-side="${side}" aria-label="Take off a goal">−</button></span>`:'';
  let h=`<div class="scorebar"><div class="side us"><div class="tmrow">${logoImg(CFG().logo,'slg')}<span class="tm">${esc(shortName())}</span></div>${pmb('us')}</div>
    <div class="sbsc"><span class="num">${sc.us}</span><span class="dash">–</span><span class="num">${sc.them}</span></div>
    <div class="side them"><div class="tmrow">${logoImg(oppLogoOf(gc),'slg')}<span class="tm">${esc(oppName())}</span></div>${pmb('them')}</div>`;
  if(gst==='awaiting')h+=ed?resultPromptHTML(g,gc):`<div class="gamestate await">${esc(statusLabel(gst,g))}${g.started&&(sc.us||sc.them)?` <span class="muted">${sc.us}–${sc.them} when last updated</span>`:''}</div>`;
  else if(gst==='postponed')h+=`<div class="gamestate">Postponed${ed&&isHead()?' <span class="muted">Set a new date in Team › Schedule.</span>':''}</div>`;
  else if(!g.started){
    const cd=countdown(gc);
    h+=`<div class="gameinfo"><span><b>${esc(whenText(gc))}</b>${gc.field?', '+esc(gc.field):''}</span>${cd?`<span class="cd" data-lv="kick">${cd}</span>`:''}${(gc.place||'')?`<a class="maplink" href="${mapUrl(gc.place)}" target="_blank" rel="noopener">Map</a>`:''}${gc.note?`<span class="muted">${esc(gc.note)}</span>`:''}</div>`;
  }
  const row=[];
  if(hasSong())row.push(`<button class="snd ${songOn()?'on':''}" data-act="song" aria-pressed="${songOn()}">${songOn()?'🔊 Goal song on':'🔈 Tap to turn on the goal song'}</button>`);
  if(ed&&g.started&&!g.fullDone&&d.L.GK)row.push(`<button class="snd on" data-act="save">🧤 + Save (${esc(nm(d.L.GK))})</button>`);
  if(row.length)h+=`<div class="songrow">${row.join('')}</div>`;
  const ours=g.goals.filter(x=>x.side==='us');
  if(ours.length&&!g.imported)h+=`<div class="scorers">${ours.map(x=>`${esc(x.by?nm(x.by):'Goal')} ${tmin(g,x.t)}${x.ast?' (assist '+esc(nm(x.ast))+')':''}`).join(', ')}</div>`;
  if(ed&&g.fullDone&&!g.pk&&sc.us===sc.them){
    h+=`<div class="pkbtns">${g.ot?'':`<button class="optb" data-act="ot">Overtime (${g.otN} × ${g.otLen} min)</button>`}<button class="optb" data-act="pk">Penalty kicks</button></div>`;
  }
  if(ed&&g.ot&&!g.running&&!g.pk&&clock(g)===ends(g)[1])h+=`<div class="pkbtns"><button class="optb skip" data-act="otcancel">Cancel overtime</button></div>`;
  if(g.pk){const ps=pkScore(g);
    h+=`<div class="pk"><div class="tally">Penalty kicks ${ps.us}–${ps.them}</div>
      <div class="kicks"><span class="lbl">${esc(shortName())}</span>${g.pk.us.map(k=>`<span class="${k.made?'m':'x'}">${esc(nm(k.id))} ${k.made?'✓':'✗'}</span>`).join('')||'<span>No kicks yet</span>'}</div>
      <div class="kicks"><span class="lbl">${esc(oppName())}</span>${g.pk.them.map(m=>`<span class="${m?'m':'x'}">${m?'✓':'✗'}</span>`).join('')||'<span>No kicks yet</span>'}</div>`;
    if(ed){
      if(UI.pk&&UI.pk.step==='kicker')h+=`<div class="q">Who’s kicking?</div><div class="pkbtns">${PLAYERS.filter(p=>av(g,p.id)).map(p=>`<button class="optb" data-act="pkkicker" data-id="${p.id}">${esc(p.name)}</button>`).join('')}<button class="optb skip" data-act="pkcancel">Cancel</button></div>`;
      else if(UI.pk&&UI.pk.step==='result')h+=`<div class="q">${esc(nm(UI.pk.id))}’s kick</div><div class="pkbtns"><button class="optb ok" data-act="pkres" data-m="1">Scored</button><button class="optb" data-act="pkres" data-m="0">Missed</button><button class="optb skip" data-act="pkcancel">Cancel</button></div>`;
      else{const st=pkState(g);
        if(st.win)h+=`<div class="pkwin">${esc(st.win==='us'?shortName():oppName())} win the shootout ${st.u}–${st.t}</div><div class="pkbtns"><button class="optb skip" data-act="pkundo">Undo last kick</button></div>`;
        else{const nk=nextKicker(g);const pos=nk?(g.pkOrder||[]).indexOf(nk):-1;
          h+=`<div class="pkround">${st.sd?'Sudden death, round '+st.round:'Round '+st.round+' of 5'}</div>`;
          if(!st.ua&&!st.ta)h+=`<div class="pkfirst"><span>Who kicks first?</span><button data-act="pkfirst" data-s="us" aria-pressed="${(g.pk.first||'us')==='us'}">${esc(shortName())}</button><button data-act="pkfirst" data-s="them" aria-pressed="${g.pk.first==='them'}">${esc(oppName())}</button></div>`;
          h+=`<div class="pkturn ${st.turn==='us'?'now':''}"><div class="q">${st.turn==='us'?'Our turn. ':''}Next kicker: <b>${nk?esc(nm(nk)):'Pick a kicker'}</b>${pos>=0?` <span class="muted">(#${pos+1} on the list)</span>`:''}</div>
            <div class="pkbtns">${nk?`<button class="optb ok" data-act="pkquick" data-m="1">Scored</button><button class="optb" data-act="pkquick" data-m="0">Missed</button>`:''}<button class="optb skip" data-act="pkus">Different kicker</button></div></div>
            <div class="pkturn ${st.turn==='them'?'now':''}"><div class="q">${st.turn==='them'?'Their turn':'Their kick'}</div><div class="pkbtns"><button class="optb" data-act="pkthem" data-m="1">Scored</button><button class="optb" data-act="pkthem" data-m="0">Missed</button></div></div>
            <div class="pkbtns"><button class="optb skip" data-act="pkundo">Undo last kick</button><button class="optb skip" data-act="pkedit">Edit kicker order</button></div>`;}}
    }
    h+='</div>';}
  const gp=UI.goal;
  if(gp&&ed){
    const onIds=POS.map(p=>d.L[p]).filter(Boolean);
    if(gp.step==='by')h+=`<div class="goalpick"><div class="q">Goal at ${fmt(gp.t)}. Who scored?</div><div class="opts">${onIds.map(id=>`<button data-act="goalby" data-id="${id}">${esc(nm(id))}</button>`).join('')}<button class="skip" data-act="goalby" data-id="">Not sure</button><button class="skip" data-act="goalcancel">Cancel</button></div></div>`;
    else h+=`<div class="goalpick"><div class="q">${esc(nm(gp.by))} scored. Any assist?</div><div class="opts">${onIds.filter(id=>id!==gp.by).map(id=>`<button data-act="goalast" data-id="${id}">${esc(nm(id))}</button>`).join('')}<button class="skip" data-act="goalast" data-id="">No assist</button></div></div>`;
  }
  h+='</div>';
  $('score').innerHTML=h;$('score2').innerHTML=h;
}
function renderBanner(){
  const g=G();const el=$('banner');
  if(pOff(g)){if(g.pending==null||g.fullDone||isParent()){el.innerHTML='';return;}
    const d=replay(g);const q=liveQueue(g,d);const lines=q.length?describe(d.L,queueTarget(g,d)):[];const isHalf=g.pending*g.sub===g.half;
    el.innerHTML=`<div class="banner" role="status"><div><h2>${isHalf?'Halftime':'Sub time'}</h2><p>${lines.length?lines.length+' sub'+(lines.length>1?'s':'')+' lined up':'Tap a bench player to choose where she goes in'}</p></div>
      <div class="chg">${lines.map(l=>`<span><i>${l.p||''}</i>${esc(l.t)}</span>`).join('')}</div>
      <div class="acts">${lines.length?'<button class="btn" data-act="applyq">Make these subs</button>':''}<button class="btn ghost" data-act="dismiss">${lines.length?'Not now':'OK'}</button></div></div>`;return;}
  if(g.pending==null||g.fullDone||isParent()||!PL()[g.pending]){el.innerHTML='';return;}
  const k=g.pending;const d=replay(g);const lines=describe(d.L,PL()[k]);
  const isHalf=k*g.sub===g.half;
  const title=isHalf?'Halftime: planned subs for the 2nd half':'Sub time: plan for '+blockRange(g,k);
  const chips=lines.length?lines.map(l=>`<span class="${av(g,l.id)?'':'warn'}"><i>${l.p||''}</i>${esc(l.t)}${av(g,l.id)?'':' (not here)'}</span>`).join('')
    :'<span>The field already matches the plan.</span>';
  el.innerHTML=`<div class="banner" role="status"><div><h2>${title}</h2><p>${lines.length?lines.length+' change'+(lines.length>1?'s':''):'No changes needed'}</p></div>
    <div class="chg">${chips}</div>
    <div class="acts">${lines.length?`<button class="btn" data-act="apply" data-k="${k}">Make planned subs</button>`:''}
    <button class="btn ghost" data-act="editplan">Change plan</button><button class="btn ghost" data-act="dismiss">${lines.length?'Skip':'OK'}</button></div></div>`;
}
const LINES=`<svg viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.5" vector-effect="non-scaling-stroke">
 <rect x="2" y="2" width="64" height="96" vector-effect="non-scaling-stroke"/><line x1="2" y1="50" x2="66" y2="50" vector-effect="non-scaling-stroke"/>
 <ellipse cx="34" cy="50" rx="8" ry="5.4" vector-effect="non-scaling-stroke"/>
 <rect x="15" y="2" width="38" height="14" vector-effect="non-scaling-stroke"/><rect x="25" y="2" width="18" height="5" vector-effect="non-scaling-stroke"/>
 <rect x="15" y="84" width="38" height="14" vector-effect="non-scaling-stroke"/><rect x="25" y="93" width="18" height="5" vector-effect="non-scaling-stroke"/>
</g></svg>`;
const planEditing=()=>{if(S.tab!=='plan'||!canEdit()||UI.planK==null)return false;const g=G();if(!PL()[UI.planK])return false;return !g.started||UI.planK>blockAt(g,clock(g));};
function renderPlanField(){
  const g=G();const k=UI.planK;const b=PL()[k];const pk=UI.pick&&UI.pick.k===k?UI.pick:null;
  const pitch=$('pitch');pitch.className='pitch f'+String(g.form).split('v')[0]+' planedit';
  let h=LINES+`<div class="pedit"><span>Editing plan ${blockRange(g,k)}</span><button data-act="planedone">Done</button></div>`;
  POS.forEach(p=>{const id=b[p];const pi=PI[p];const cls=['chip'];if(p==='GK')cls.push('gk');if(nm(id).length>6)cls.push('long');if(id&&!av(g,id))cls.push('warn');
    if(pk&&pk.p===p)cls.push('sel');else if(pk)cls.push('target');
    h+=`<button class="${cls.join(' ')}" style="left:${pi.x}%;top:${pi.y}%" data-act="cell" data-k="${k}" data-p="${p}" aria-label="${esc(pi.name)}: ${esc(nm(id))}"><div class="ps">${p}</div><div class="nm">${esc(nm(id))}</div></button>`;});
  pitch.innerHTML=h;
}
function renderField(){
  if(planEditing()){renderPlanField();return;}
  const g=G();const d=replay(g);const sel=UI.sel;const par=isParent();const up=par?null:upcoming(g,d);
  const pitch=$('pitch');pitch.className='pitch f'+String(g.form).split('v')[0]+(UI.fieldMode==='stat'&&canEdit()?' statmode':'');
  let h=LINES;
  POS.forEach(p=>{const id=d.L[p];const pi=PI[p];
    const cls=['chip'];if(p==='GK')cls.push('gk');if(nm(id).length>6)cls.push('long');
    let inc='';
    if(up&&up.target[p]!==undefined&&up.target[p]!==id&&up.target[p]){cls.push('out');const n=up.target[p];const from=POS.find(q=>d.L[q]===n);
      inc=av(g,n)?`<div class="inc">${esc(nm(n))} ${from?'from '+from:'in'}</div>`:`<div class="inc bad">${esc(nm(n))} is out</div>`;}
    if(sel&&sel.type==='pos'&&sel.pos===p)cls.push('sel');
    if(sel&&(sel.type==='player'||(sel.type==='pos'&&sel.pos!==p)))cls.push('target');
    if(id&&!av(g,id))cls.push('warn');
    const s=id&&d.st[id]?d.st[id]:{played:0};
    h+=`<button class="${cls.join(' ')}" style="left:${pi.x}%;top:${pi.y}%" data-act="pos" data-p="${p}" aria-label="${esc(pi.name)}: ${esc(nm(id))}">
      <div class="ps">${p}</div><div class="nm">${esc(nm(id))}</div>
      ${par?'':`<div class="mn"><span>In <b data-lv="played" data-id="${id}">${fmt(s.played)}</b></span><span>Sat <b data-lv="sattot" data-id="${id}">${fmt(d.now-s.played)}</b></span></div>`}${inc}</button>`;});
  if(hideLineup())h=LINES+`<div class="lineuphide"><b>Lineup at kickoff</b><span>${esc(whenText(GC()))}</span></div>`;
  pitch.innerHTML=h;
}
function renderHint(){
  const el=$('hint');const sel=UI.sel;if(!CFG()){el.textContent='';return;}const g=G();
  if(VER.ready&&!sel&&canEdit()){el.className='hint on';el.innerHTML='<span>A new version of the tracker is ready. It loads on its own when the clock is stopped.</span><button class="btn small" data-act="reload">Refresh now</button>';return;}
  if(!sel&&!UI.msg&&planEditing()){el.className='hint on';el.innerHTML=`<span>Editing the plan for ${blockRange(g,UI.planK)}. Tap a player, then another to swap, or a bench name in that block below.</span><button class="btn small" data-act="planedone">Done</button>`;return;}
  if(sel){
    const t=sel.type==='pos'?`Pick who comes in at ${esc(PI[sel.pos]?PI[sel.pos].name.toLowerCase():sel.pos)}, or tap another spot to swap.`:`Tap a spot on the field to put ${esc(nm(sel.id))} in.`;
    el.className='hint on';el.innerHTML=`<span>${t}</span><button class="btn small" data-act="cancel">Cancel</button>`;
  }else if(UI.msg){el.className='hint msg';el.textContent=UI.msg;}
  else if(UI.fieldMode==='stat'&&canEdit()){el.className='hint';el.textContent='Tracking stats: tap a player to log a pass, shot, won ball and more.';}
  else{const k=gStatus(GC());el.className='hint';el.textContent=isParent()?(k==='live'||k==='halftime'?'Following live. The score, clock and lineup update on their own.':k==='final'?'Final score.':k==='awaiting'?'Waiting for a coach to confirm the final score.':k==='postponed'?'This game is postponed.':'The lineup shows here when the game kicks off.'):g.started?'Tap a player, then a bench player to sub, or another player to swap spots.':'Before kickoff, changes set the starting lineup. Nothing is logged until the clock starts.';}
}
/* Coaches switch between Game mode (the field, clock and only what a game needs) and Practice mode
   (practice plans, the season and team setup). Parents always follow the game. */
/* Coaches work in three modes: Game (clock, goals, subs, plan, live stats), Practice (plans, drills, timer)
   and Team (roster, schedule, season reports, coaches and settings). Parents get Game, Schedule and Team. */
const MODE_TABS={game:['players','plan','bench','log','stats','minutes'],practice:['practice'],team:['roster','schedule','season','setup']};
const PARENT_TABS=['game','schedule','team'];
function gameDayNow(){return CFG().games.some(gc=>['live','today'].includes(gBucket(gc)));}
const modeOfTab=t=>Object.keys(MODE_TABS).find(m=>MODE_TABS[m].includes(t));
function coachMode(){
  if(isParent())return 'game';
  // On opening a team, a game today (or one under way) opens Game mode.
  if(UI.modeTeam!==S.team){UI.modeTeam=S.team;if(gameDayNow()){S.mode='game';if(!MODE_TABS.game.includes(S.tab))S.tab='bench';}}
  if(!MODE_TABS[S.mode])S.mode='game';
  // Something that opens a tab from another mode (e.g. "+ Add a game" opens the schedule) switches modes with it.
  const m=modeOfTab(S.tab);if(m&&m!==S.mode)S.mode=m;
  return S.mode;
}
function renderMode(){
  const el=$('modesw');const app=document.querySelector('.app');if(!el||!app)return;
  const m=coachMode();app.classList.toggle('practice',m!=='game');app.classList.toggle('onetab',!isParent()&&MODE_TABS[m].length===1);
  const b=(k,icon,l)=>`<button data-act="mode" data-m="${k}" aria-pressed="${m===k}"><span aria-hidden="true">${icon}</span> ${l}</button>`;
  const h=isParent()?'':`<div class="modesw" role="group" aria-label="Mode">${b('game','⚽','Game')}${b('practice','📋','Practice')}${b('team','👥','Team')}</div>`;
  if(el.innerHTML!==h)el.innerHTML=h;
}
EXT.mode=ds=>{if(!MODE_TABS[ds.m])return false;S.mode=ds.m;S.tab=ds.m==='game'?'bench':MODE_TABS[ds.m][0];UI.sel=null;UI.pick=null;saveLocal();try{window.scrollTo(0,0);}catch(e){}};
VIEW_OK.add('mode');
function renderTabs(){
  renderMode();
  if(CFG()&&!isParent()&&S.tab==='plan'&&!usePlan())S.tab='bench';
  const g=G();const d=replay(g);const benchN=PLAYERS.filter(p=>av(g,p.id)&&!d.on.has(p.id)).length;
  if(isParent()&&!PARENT_TABS.includes(S.tab))S.tab=S.tab==='players'?'team':'game';
  const m=coachMode();
  const tabs=isParent()?[['game','Game',g.goals.length||''],['schedule','Schedule',''],['team','Team','']]
    :m==='practice'?[['practice','Practice','']]
    :m==='team'?[['roster','Roster',PLAYERS.length||''],['schedule','Schedule',''],['season','Season',''],['setup','Settings','']]
    :[['players','Players',''],...(usePlan()?[['plan','Plan','']]:[]),['bench','Bench',benchN],['log','Log',d.batches.length||''],['stats','Stats',''],['minutes','Minutes','']];
  if(!tabs.some(t=>t[0]===S.tab))S.tab=tabs.find(t=>t[0]==='bench')?'bench':tabs[0][0];
  $('tabs').innerHTML=tabs.map(([t,l,c])=>`<button class="tab" role="tab" data-act="tab" data-t="${t}" aria-selected="${S.tab===t}">${l}${c!==''?`<span class="ct">${c}</span>`:''}</button>`).join('');
}
function upNext(g,d,id){
  if(!g.started||pOff(g))return '';
  const k=g.pending!=null?g.pending:blockAt(g,d.now)+1;if(k>=PL().length)return '';
  const b=PL()[k];const p=POS.find(x=>b[x]===id);if(!p)return '';const f=d.L[p];
  return `Next sub (${k*g.sub}:00): in at ${p}${f&&f!==id?', call out '+esc(nm(f)):''}`;
}
function gameNote(gc,g){
  const out=PLAYERS.filter(p=>!av(g,p.id)).map(p=>p.name);
  const parts=[];if(gc.opp)parts.push('vs '+gc.opp);if(gc.field)parts.push(gc.field);
  let s=parts.join(', ');
  if(out.length)s+=(s?'. ':'')+(out.length===1?out[0]+' is out':out.slice(0,-1).join(', ')+' and '+out[out.length-1]+' are out');
  else s+=(s?'. ':'')+'Full roster';
  return s;
}
function renderBench(d){
  const g=G();const sel=UI.sel;const up=upcoming(g,d);let h='';
  if(sel&&sel.type==='pos'){const cur=d.L[sel.pos];
    h+=`<div class="ctx live">Who goes in at <b>${esc(PI[sel.pos]?PI[sel.pos].name.toLowerCase():sel.pos)}</b>${cur?' for <b>'+esc(nm(cur))+'</b>':''}?
      ${cur&&g.started?`<div class="inj"><button class="tog ${sel.injury?'on':''}" data-act="injury" aria-pressed="${!!sel.injury}">${sel.injury?'Yes':'No'}</button><span>Injured or done for the day? ${sel.injury?esc(nm(cur))+' will be marked out.':'Turn on to mark her out.'}</span></div>`:''}</div>`;}
  else if(sel&&sel.type==='player'){const queue=pOff(g)&&g.started&&!sel.now;const q=(g.queue||[]).find(x=>x.id===sel.id);
    h+=`<div class="ctx live pickpos"><div>Where is <b>${esc(nm(sel.id))}</b> going ${queue?'at the next sub':'in now'}? Tap a spot here or on the field.</div>
      <div class="posgrid">${POS.map(p=>{const cur=d.L[p];const lined=(g.queue||[]).find(x=>x.pos===p&&x.id!==sel.id);
        return `<button class="${q&&q.pos===p?'cur':''}" data-act="${queue?'benchq':'benchnow'}" data-p="${p}"><b>${p}</b><small>${cur?esc(nm(cur)):'Empty'}${lined?' · '+esc(nm(lined.id))+' lined up':''}</small></button>`;}).join('')}</div>
      <div class="pickacts">${pOff(g)&&g.started?`<button class="btn small" data-act="benchnowmode">${sel.now?'Line up for next sub instead':'Sub in right now instead'}</button>`:''}${q?`<button class="btn small" data-act="unq" data-id="${sel.id}">Not going in</button>`:''}<button class="btn small" data-act="cancel">Cancel</button></div></div>`;}
  else if(up&&pOff(g))h+=`<div class="ctx live">${g.pending!=null?'Sub time.':'Lined up for the next sub.'} Green players are going in.${g.pending!=null?' <button class="btn small" data-act="applyq">Make these subs</button>':''}</div>`;
  else if(up)h+=`<div class="ctx live">${g.pending!=null?'Subs are due now.':'Subs coming in under a minute.'} Green players are going in. <button class="btn small" data-act="editplan">Change plan</button></div>`;
  if(!sel&&usePlan())h+=`<div class="planrow"><span>Subs: <b>${g.planOff?'You choose':'Follow the plan'}</b></span><button class="btn small" data-act="planoff">${g.planOff?'Use the plan':'Turn off the plan'}</button></div>`;
  const bench=PLAYERS.filter(p=>av(g,p.id)&&!d.on.has(p.id)).sort((a,b)=>d.st[a.id].offAt-d.st[b.id].offAt||d.st[a.id].played-d.st[b.id].played);
  if(!bench.length)h+=`<div class="empty">${PLAYERS.length?'Everyone who’s here is on the field.':'No players yet. Add your roster on the Setup tab.'}</div>`;
  else{h+='<div class="bgrid">';
    bench.forEach(p=>{const s=d.st[p.id];
      let goTxt='';
      if(up){const q=POS.find(x=>up.target[x]===p.id);if(q){const f=d.L[q];goTxt=`Going in at ${q}${f?': call out '+esc(nm(f)):''}`;}}
      const upTxt=goTxt?'':upNext(g,d,p.id);
      const cls=['bp'];if(goTxt)cls.push('goin');if(sel&&sel.type==='player'&&sel.id===p.id)cls.push('sel');if(sel&&sel.type==='pos')cls.push('go');
      h+=`<button class="${cls.join(' ')}" data-act="bench" data-id="${p.id}"><span class="n">${esc(p.name)}${jn(p)}${p.guest?'<span class="tag">Guest</span>':''}</span>
        <span class="r">${esc(roleText(p))}</span>${goTxt?`<span class="go2">${goTxt}</span>`:upTxt?`<span class="up">${upTxt}</span>`:''}
        <span class="s"><span>Sitting now <b data-lv="sit" data-id="${p.id}">${fmt(d.now-s.offAt)}</b></span></span>
        <span class="tot"><span>In <b data-lv="played" data-id="${p.id}">${fmt(s.played)}</b></span><span>Sat <b data-lv="sattot" data-id="${p.id}">${fmt(d.now-s.played)}</b></span></span></button>`;});
    h+='</div>';}
  const out=PLAYERS.filter(p=>!av(g,p.id));
  if(out.length)h+=`<h3>Not here or out</h3><div class="outlist">${out.map(p=>`<span>${esc(p.name)}</span>`).join('')}</div><p class="fine">Change who’s available on the Players tab.</p>`;
  return h;
}
function miniField(g,b,i,editable,pk,base){
  let h=`<div class="mpitch f${String(g.form).split('v')[0]}${pk?' choosing':''}"><div class="mlines">${LINES}</div>`;
  formOf(g).forEach(pi=>{const p=pi.id,id=b[p];const cls=['mchip'];if(p==='GK')cls.push('gk');
    if(id&&!av(g,id))cls.push('warn');if(base&&id&&!POS.some(x=>base[x]===id))cls.push('new');if(pk&&pk.p===p)cls.push('picked');
    const st=`left:${pi.x}%;top:${((pi.y-12)/86*100).toFixed(1)}%`;
    const inner=`<span class="mps">${p}</span><span class="mnm">${esc(id?nm(id):'Empty')}${id&&!av(g,id)?' (out)':''}</span>`;
    h+=editable?`<button class="${cls.join(' ')}" style="${st}" data-act="cell" data-k="${i}" data-p="${p}" aria-label="${esc(pi.name)}: ${esc(nm(id))}">${inner}</button>`:`<div class="${cls.join(' ')}" style="${st}">${inner}</div>`;});
  return h+'</div>';
}
function renderPlan(d){
  const g=G();const gc=GC();const cb=g.started?blockAt(g,d.now):-1;let h='';
  const bad=new Set();PL().forEach((b,i)=>{if(i>cb)POS.forEach(p=>{if(b[p]&&!av(g,b[p]))bad.add(b[p]);});});
  if(bad.size)h+=`<div class="notice">${[...bad].map(nm).join(', ')} ${bad.size>1?'are':'is'} out but still in the plan. Tap a highlighted spot to pick someone else, or rebuild the rotation.</div>`;
  h+=`<p class="fine" style="margin-top:0">${esc(gameNote(gc,g))}. Tap any name in an upcoming block to change who plays there. Each block lists who sits; orange means sitting a second block in a row.</p>`;
  h+=`<div class="set planswitch"><span><b>Use the plan for subs</b><br><span class="fine">Off: sub alerts still go off, and you tap bench players to line up where each goes in.</span></span><button class="tog ${g.planOff?'':'on'}" data-act="planoff" aria-pressed="${!g.planOff}">${g.planOff?'Off':'On'}</button></div>`;
  const fv=S.planView!=='list';
  h+=`<div class="seg planview"><button data-act="planview" data-v="field" aria-pressed="${fv}">Field</button><button data-act="planview" data-v="list" aria-pressed="${!fv}">List</button></div>${fv?'<p class="fine">Tap a player, then another player on the same field to swap them, or a bench name to bring her in. A green ring means she comes in at that block.</p>':''}`;
  PL().forEach((b,i)=>{
    const state=i<cb?'done':i===cb?'now':(i===cb+1||(!g.started&&i===0))?'next':'';
    const editable=!g.started||i>cb;
    const pill=state==='now'?'<span class="pill now">On now</span>':state==='done'?'<span class="pill">Done</span>':(g.pending===i?'<span class="pill nx">Due now</span>':(state==='next'&&g.started)?'<span class="pill nx">Next</span>':'');
    const pk=UI.pick&&UI.pick.k===i?UI.pick:null;
    const cells=POS.map(p=>{const c=`cell ${!b[p]||av(g,b[p])?'':'warn'}${editable?' edit':''}${pk&&pk.p===p?' picked':''}`;
      return editable?`<button class="${c}" data-act="cell" data-k="${i}" data-p="${p}"><span>${p}</span>${esc(nm(b[p]))}</button>`:`<div class="${c}"><span>${p}</span>${esc(nm(b[p]))}</div>`;}).join('');
    let picker='';
    if(pk){const old=b[pk.p];
      picker=`<div class="pickbar"><div><b>${esc(old?nm(old):'Empty spot')}</b> at ${pk.p} is selected. Tap another player on this field to swap, or a bench name to bring her in.</div>
        ${old&&i<PL().length-1?`<div class="inj"><button class="tog ${pk.all?'on':''}" data-act="pickall" aria-pressed="${pk.all}">${pk.all?'Yes':'No'}</button><span>When I bring in a bench player, also replace ${esc(nm(old))} in later blocks</span></div>`:''}
        <button class="btn small" data-act="pickcancel">Cancel</button></div>`;}
    let diff='';
    const subBase=state!=='done'&&state!=='now'?((g.started?i===cb+1:i===0)?d.L:PL()[i-1]):null;
    if(state!=='done'&&state!=='now'){
      // The first upcoming block changes from who is on the field now; later blocks change from the block before them.
      const first=g.started?i===cb+1:i===0;const base=first?d.L:PL()[i-1];const lines=describe(base,b);
      const lbl=first?(g.started?'Subs from who’s on now':'Different from the starting lineup'):'Subs at '+blockRange(g,i).split('–')[0]+' min';
      diff=lines.length?`<div class="dlbl">${lbl}</div><ul class="diff">${lines.map(l=>`<li class="${av(g,l.id)?'':'warn'}">${l.p?l.p+': ':''}${esc(l.t)}${av(g,l.id)?'':' (out)'}</li>`).join('')}</ul>`
        :`<ul class="diff"><li class="muted">${first?(g.started?'Matches who’s on now':'This is the starting lineup'):'No subs from the block before'}</li></ul>`;}
    let btn='';
    if(!g.started)btn=`<button class="btn small" data-act="startwith" data-k="${i}">Start with this lineup</button>`;
    else if(state!=='done'&&state!=='now'&&describe(d.L,b).length)btn=`<button class="btn small" data-act="apply" data-k="${i}">Make these subs now</button>`;
    const inB=new Set(POS.map(p=>b[p]).filter(Boolean)),prevB=i?new Set(POS.map(p=>PL()[i-1][p]).filter(Boolean)):null;
    const bn=PLAYERS.filter(p=>av(g,p.id)&&!inB.has(p.id));
    const bench=`<div class="pbench${pk?' go':''}"><b>Bench</b>${bn.length?bn.map(p=>{const two=prevB&&!prevB.has(p.id)&&!pureGK(p);const lbl=esc(p.name)+(two?' (2nd in a row)':'');return editable?`<button class="pbn ${two?'long':''}" data-act="pbench" data-k="${i}" data-id="${p.id}"${two?' title="Also sat the block before"':''}>${lbl}</button>`:`<span class="${two?'long':''}">${lbl}</span>`;}).join(''):'<em>No one, everyone who’s here is on</em>'}</div>`;
    const ed=UI.planK===i&&editable;
    const ebtn=editable?`<button class="btn small ${ed?'primary-s':''}" data-act="${ed?'planedone':'planedit'}" data-k="${i}">${ed?'Done':'Edit on field'}</button>`:'';
    h+=`<div class="blk ${state==='next'?'upnext':state}${ed?' editing':''}"><div class="bh"><b>${blockRange(g,i)}</b><span class="bhr">${ed?'<span class="pill ed">Editing</span>':''}${pill}${ebtn}</span></div>${picker}${fv?miniField(g,b,i,editable,pk,subBase):`<div class="cells">${cells}</div>`}${bench}${diff}${btn}</div>`;
  });
  h+=pkOrderHTML(g);
  if(!isParent()&&typeof voiceBar==='function')h+=voiceBar('game');
  h+=`<button class="btn danger ${armed('planauto')?'armed':''}" data-act="planauto">${armed('planauto')?'Tap again to rebuild the rotation':'Rebuild the rotation from who’s here'}</button>`;
  if(validPlan(gc.plan,g))h+=`<button class="btn danger ${armed('planreset')?'armed':''}" data-act="planreset">${armed('planreset')?'Tap again to restore the saved plan':'Restore the saved plan'}</button>`;
  return h;
}
function goalTag(g,id){const gs=g.goals.filter(x=>x.by===id).length,as=g.goals.filter(x=>x.ast===id).length;return gs||as?`<span class="gtag">${gs?gs+' G':''}${gs&&as?', ':''}${as?as+' A':''}</span>`:'';}
function renderPlayers(d){
  const g=G();const gc=GC();let h='';
  if(SY.on)h+=`<h3>Coach controls</h3><div class="set"><span>This device runs ${esc(CFG().name)} games. Everyone else with the link sees changes live.</span><button class="btn small" data-act="editor">Lock</button></div>`;
  h+=`<h3>${esc(gc.title)}: who’s here</h3><p class="fine" style="margin-top:-4px">${esc(gameNote(gc,g))}. Tap Here or Out to change it.</p>`;
  if(!PLAYERS.length)h+='<div class="empty">No players yet. Add your roster on the Setup tab.</div>';
  const prow=p=>{const here=av(g,p.id);const pos=POS.find(x=>d.L[x]===p.id);const s=d.st[p.id];
    const stat=pos?`On at ${pos}`:here?`Bench <span data-lv="sit" data-id="${p.id}">${fmt(d.now-s.offAt)}</span>`:'Out';
    const pm=here?plannedFor(g,p.id):0;
    h+=`<div class="prow ${here?'':'out'}"><div class="pn"><b>${esc(p.name)}</b>${jn(p)} ${gradeHTML(p)}${p.guest?'<span class="tag">Guest</span>':''}${goalTag(g,p.id)}<div class="r">${esc(roleText(p))}</div></div>
      <div class="pst">${stat}</div>
      <div class="pmin"><b data-lv="played" data-id="${p.id}">${fmt(s.played)}</b><small>${here&&usePlan()?pm+' min planned':'played'}</small></div>
      <button class="tog ${here?'on':''}" data-act="avail" data-id="${p.id}" aria-pressed="${here}">${here?'Here':'Out'}</button></div>`;};
  PLAYERS.filter(p=>!p.guest).forEach(prow);
  const guests=PLAYERS.filter(p=>p.guest);
  if(guests.length){const n=guests.filter(p=>av(g,p.id)).length,on=guests.filter(p=>POS.some(x=>d.L[x]===p.id)).length;
    h+=guestsWrap('players',`Guest players (${guests.length})`,`${n} here${on?', '+on+' on the field':''}`);guests.forEach(prow);h+='</details>';}
  if(g.fullDone&&gameLocked())h+=`<div class="ctx">This game is final and locked, so its score and subs can’t change by accident. <button class="btn small" data-act="unlockgame">Unlock to edit</button></div>`;
  else if(g.fullDone&&UI.unlock[GC().id])h+=`<div class="ctx">Unlocked on this device. <button class="btn small" data-act="relock">Lock again</button> <button class="btn small ${armed('reopen')?'danger-s armed':''}" data-act="reopen">${armed('reopen')?'Tap again to reopen':'Reopen game'}</button></div>`;
  else if(g.fullDone)h+=`<div class="ctx">This game is final. <button class="btn small ${armed('reopen')?'danger-s armed':''}" data-act="reopen">${armed('reopen')?'Tap again to reopen':'Reopen game'}</button></div>`;
  const step=(k,label,val)=>`<div class="set"><span>${label}</span><div class="step"><button data-act="set" data-key="${k}" data-d="-1" aria-label="Less">−</button><b>${val}</b><button data-act="set" data-key="${k}" data-d="1" aria-label="More">+</button></div></div>`;
  h+=`<h3>Game settings</h3>${step('half','Half length',g.half+' min')}${step('sub','Sub every',g.sub+' min')}${step('otLen','Overtime periods',g.otLen+' min')}${step('otN','Number of overtime periods',g.otN)}
   <div class="set"><span>Sub alert sound</span><button class="tog ${S.beep?'on':''}" data-act="beep" aria-pressed="${S.beep}">${S.beep?'On':'Off'}</button></div>
   <button class="btn danger ${armed('reset')?'armed':''}" data-act="reset">${armed('reset')?'Tap again to reset '+esc(gc.title):'Reset '+esc(gc.title)}</button>
   <p class="fine">${SY.on?'Changes from the device running the game show up on every phone within a couple of seconds.':'Everything saves in this browser on this device.'} Resetting clears the clock, subs, goals and log for this game only; who’s here stays as you set it.</p>`;
  return h;
}
function keeperStats(list){
  const k={};const add=id=>(k[id]=k[id]||{gk:0,sv:0,ga:0});
  list.forEach(({g,rep})=>{
    if(rep)Object.entries(rep.st).forEach(([id,s])=>{if(s.gk>0)add(id).gk+=s.gk;});
    g.saves.forEach(s=>{if(s.gk)add(s.gk).sv++;});
    g.goals.filter(x=>x.side==='them'&&x.gk).forEach(x=>{add(x.gk).ga++;});
  });
  return k;
}
function keeperHTML(k,title){
  const ids=Object.keys(k).filter(id=>k[id].gk>0||k[id].sv||k[id].ga);if(!ids.length)return '';
  return `<h3>${title}</h3>`+ids.map(id=>`<div class="krow"><b>${esc(nm(id))}</b><span>${fmt(k[id].gk)} in goal</span><span>${k[id].sv} save${k[id].sv===1?'':'s'}</span><span>${k[id].ga} allowed</span></div>`).join('');
}
function renderLog(d){
  const g=G();const ed=canEdit();
  const items=d.batches.map(b=>({t:b.t,b})).concat(g.goals.map((x,k)=>({t:x.t,goal:x,k}))).concat(g.saves.map((x,k)=>({t:x.t,save:x,k})));
  let h='';
  if(!items.length)h+=`<div class="empty">${g.started?'Nothing yet.':'The clock hasn’t started.'} Subs, goals and saves show up here with the game time.</div>`;
  else{
    items.sort((a,b)=>b.t-a.t);
    if(ed&&d.batches.length)h+=`<button class="btn small" data-act="undo" style="margin-bottom:8px">Undo last sub</button>`;
    h+='<ul class="log">';
    items.forEach(it=>{
      if(it.goal){const x=it.goal;
        const txt=x.side==='us'?'Goal '+esc(shortName())+(x.by?': '+esc(nm(x.by)):'')+(x.ast?', assist '+esc(nm(x.ast)):''):'Goal '+esc(oppName())+(x.gk?' (keeper '+esc(nm(x.gk))+')':'');
        h+=`<li class="${x.side==='us'?'goal':''}"><div class="lt">${tfmt(g,x.t)}</div><div class="ll"><div>${txt}${ed?`<button class="del ${armed('goal'+it.k)?'armed':''}" data-act="goaldel" data-i="${it.k}">${armed('goal'+it.k)?'Tap to remove':'Remove'}</button>`:''}</div></div></li>`;}
      else if(it.save){const x=it.save;
        h+=`<li><div class="lt">${tfmt(g,x.t)}</div><div class="ll"><div>Save: ${esc(nm(x.gk))}${ed?`<button class="del ${armed('save'+it.k)?'armed':''}" data-act="savedel" data-i="${it.k}">${armed('save'+it.k)?'Tap to remove':'Remove'}</button>`:''}</div></div></li>`;}
      else{const b=it.b;h+=`<li><div class="lt">${tfmt(g,b.t)}</div><div class="ll">${b.lines.length?b.lines.map(l=>`<div><i>${l.p||''}</i>${esc(l.t)}</div>`).join(''):'<div class="muted">No net change</div>'}</div></li>`;}
    });
    h+='</ul>';
  }
  h+=keeperHTML(keeperStats([{g,rep:g.started?d:null}]),'Keepers this game');
  return h;
}
function renderMinutes(){
  const c=CFG();const games=c.games.filter(gc=>!gc.imported).map(gc=>({gc,g:stateOf(gc)}));
  const reps=games.map(x=>x.g.started?replay(x.g):null);
  const data=PLAYERS.map(p=>{let played=0,proj=0;
    const cells=games.map((x,i)=>{const g=x.g;const r=reps[i];const m=r&&r.st[p.id]?r.st[p.id].played:0;
      if(r){if(!av(g,p.id)&&m===0)return {t:'Out',cls:'o'};played+=m;proj+=m;return {t:mins(m),cls:''};}
      if(!av(g,p.id))return {t:'Out',cls:'o'};
      if(!usePlan())return {t:'–',cls:'p'};const pm=plannedFor(g,p.id)*60000;proj+=pm;return {t:mins(pm),cls:'p'};});
    return {p,cells,played,proj};});
  const field=data.filter(x=>!pureGK(x.p));const sorted=field.map(x=>x.proj).sort((a,b)=>a-b);
  const cut=sorted.length>3?sorted[2]:-1;
  let h=`<p class="fine" style="margin-top:0">Minutes per game. <span class="p">Gray</span> numbers are planned minutes for games that haven’t started. Projected adds both. The lowest projected totals are in red.</p>
    <div class="rwrap"><table class="rtable"><thead><tr><th>Player</th>${games.map(x=>`<th>${esc(x.gc.title)}</th>`).join('')}<th>Played</th><th>Projected</th></tr></thead><tbody>`;
  data.forEach(x=>{const low=!pureGK(x.p)&&x.proj<=cut;
    h+=`<tr class="${low?'low':''}"><td class="pn">${esc(x.p.name)}${x.p.guest?' <span class="tag">Guest</span>':''}</td>${x.cells.map(c2=>`<td class="${c2.cls}">${c2.t}</td>`).join('')}<td class="tot">${mins(x.played)}</td><td class="tot pj">${mins(x.proj)}</td></tr>`;});
  h+='</tbody></table></div>';
  if(!PLAYERS.length)h='<div class="empty">No players yet. Add your roster on the Setup tab.</div>';
  h+=keeperHTML(keeperStats(games.map((x,i)=>({g:x.g,rep:reps[i]}))),'Keepers, all games');
  return h;
}
/* Setup for a device that's following along: the coach code sits at the top, clear of anything pinned to the bottom of the screen. */
function renderCoachUnlock(){
  return `<div class="card unlockcard"><h3>Coach code</h3><p class="fine" style="margin-top:-4px">Enter the coach code to run ${esc(CFG().name)} games from this device.</p>
    <form class="codebox" data-form="unlock"><input id="code" type="password" autocomplete="current-password" enterkeyhint="go" placeholder="Coach code" aria-label="Coach code" aria-describedby="unlockmsg"><button class="btn small primary-s" type="submit">Unlock</button></form>
    <p class="formmsg" id="unlockmsg" data-unlockmsg role="status" aria-live="polite"></p>
    ${authTeamHTML()}</div>`;
}
/* School teams show each player's grade (saved as a graduation year so it moves up each August). */
const showGrades=()=>!!(CFG().program||CFG().players.some(p=>p.grad));
const gradeHTML=p=>{const t=p.grad?gradeTag(p.grad,T()):'';return t?`<span class="tag gradetag">${t}</span> `:'';};
function gradeSelectHTML(p){
  const now=T(),cur=p.grad?gradeOf(p.grad,now):null;
  const opts=[6,7,8,9,10,11,12].map(gr=>`<option value="${gradFor(gr,now)}" ${cur===gr?'selected':''}>${gr}th grade</option>`).join('');
  const past=cur!=null&&(cur>12||cur<6)?`<option value="${p.grad}" selected>${esc(gradeTag(p.grad,now)||'Class of '+p.grad)}</option>`:'';
  return `<label class="gradesel">Grade <select data-cfg="pl" data-f="grad" data-id="${p.id}" aria-label="${esc(p.name)} grade"><option value="">Not set</option>${opts}${past}</select></label>`;
}
/* Team mode: Roster, Schedule and Settings tabs (Season has its own renderer). */
function renderSetup(part){
  part=part||'setup';const c=CFG();let h='';
  if(SY.on&&!isHead())return `<div class="notice">You’re signed in as ${esc(ROLE_NAME[myRole()]||'a coach')} for this team. Only a head coach can change the roster, schedule and team settings.</div>`+(part==='setup'?authSetupHTML():'');
  const note=`<p class="savednote">Changes save on their own when you tap out of a box.</p>`;
  const out={setup:'',roster:'',schedule:''};
  h+=`<div class="card"><h3>Team</h3>
    <label class="fld">Team name<input data-cfg="team" data-f="name" value="${esc(c.name)}"></label>
    <div class="grid2"><label class="fld">Short name for the scoreboard<input data-cfg="team" data-f="short" value="${esc(c.short||'')}"></label><label class="fld">Subtitle<input data-cfg="team" data-f="sub" value="${esc(c.sub||'')}" placeholder="e.g. Girls 2014/15"></label></div>
    ${teamInfoFieldsHTML(c)}
    <div class="fld">Logo<div class="logorow">${c.logo?`<img src="${esc(c.logo)}" alt="">`:'<span class="muted">No logo yet</span>'}<label class="btn small filebtn">Upload<input type="file" accept="image/*" data-cfg="logo" hidden></label>${c.logo?'<button class="btn small" data-act="logodel">Remove</button>':''}</div></div>
    <div class="set"><span>Rotation plan<small class="fine" style="display:block">Plan who plays when, block by block. Adds a Plan tab and planned subs. When off, sub alerts still sound and you tap bench players to line up who goes in.</small></span><button class="tog ${c.usePlan?'on':''}" data-act="cfgplan" aria-pressed="${!!c.usePlan}">${c.usePlan?'On':'Off'}</button></div>
    <div class="set"><span>Goal song (the Cottontown chant)</span><button class="tog ${c.song?'on':''}" data-act="cfgsong" aria-pressed="${!!c.song}">${c.song?'On':'Off'}</button></div></div>`;
  h+=formationsCardHTML(c);
  out.setup+=h;h='';
  h+=`<div class="card"><h3>Roster (${c.players.length})</h3><p class="fine" style="margin-top:-4px">Tap GK, D, M and F for the positions each player can play. The automatic rotation uses these, and keepers marked only GK stay in goal.</p>`;
  const rosterRow=p=>{
    h+=`<div class="prow2"><div><div class="pnrow"><input class="pnum" data-cfg="pl" data-f="num" data-id="${p.id}" value="${esc(p.num||'')}" inputmode="numeric" placeholder="#" aria-label="Jersey number"><input class="pname" id="pl-${p.id}" data-cfg="pl" data-f="name" data-id="${p.id}" value="${esc(p.name)}" aria-label="Player name"></div>
      <div class="grp">${GROUPS.map(([g2,ab])=>`<button class="${p.gr.includes(g2)?'on':''}" data-act="grp" data-id="${p.id}" data-g="${g2}" aria-pressed="${p.gr.includes(g2)}">${ab}</button>`).join('')}<button class="${p.guest?'on':''}" data-act="guest" data-id="${p.id}" aria-pressed="${!!p.guest}">Guest</button></div>${showGrades()?gradeSelectHTML(p):''}</div>
      <button class="btn small ${armed('pldel'+p.id)?'danger-s armed':''}" data-act="pldel" data-id="${p.id}">${armed('pldel'+p.id)?'Tap again':'Remove'}</button></div>`;};
  c.players.filter(p=>!p.guest).forEach(rosterRow);
  const gl=c.players.filter(p=>p.guest);
  if(gl.length){h+=guestsWrap('roster',`Guest players (${gl.length})`,'Tap Guest on a player to move them back');gl.forEach(rosterRow);h+='</details>';}
  h+=`<button class="btn small" data-act="pladd" style="margin-top:10px">+ Add player</button></div>`;
  out.roster+=h;h='';
  h+=`<div class="card"><h3>Games</h3><p class="fine" style="margin-top:-4px">Parents see the kickoff time, field and a map link.</p>`;
  const gcard=gc=>{const st=TS().games[gc.id];const ol=oppLogoOf(gc);let h='';
    h+=`<div class="gcard"><div class="grid2"><label class="fld">Name<input data-cfg="gm" data-f="title" data-gid="${gc.id}" value="${esc(gc.title)}"></label><label class="fld">Opponent<input data-cfg="gm" data-f="opp" data-gid="${gc.id}" value="${esc(gc.opp||'')}"></label>
      <label class="fld">Date<input type="date" data-cfg="gm" data-f="dtdate" data-gid="${gc.id}" value="${esc(String(gc.dt||'').slice(0,10))}"></label><label class="fld">Kickoff time <small class="fine">(blank = TBD)</small><input type="time" data-cfg="gm" data-f="dttime" data-gid="${gc.id}" value="${esc(String(gc.dt||'').slice(11,16))}"></label></div>
      <label class="fld">Field<input data-cfg="gm" data-f="field" data-gid="${gc.id}" value="${esc(gc.field||'')}" placeholder="e.g. Field 12A"></label>
      <label class="fld">Address or park name (for the map link)<input data-cfg="gm" data-f="place" data-gid="${gc.id}" value="${esc(gc.place||'')}"></label>
      <div class="grid2"><label class="fld">Half length (min)<input type="number" inputmode="numeric" min="5" max="60" data-cfg="gm" data-f="half" data-gid="${gc.id}" value="${gc.half||30}"></label><label class="fld">Sub every (min)<input type="number" inputmode="numeric" min="2" max="30" data-cfg="gm" data-f="sub" data-gid="${gc.id}" value="${gc.sub||10}"></label></div>
      <div class="gacts"><button class="btn small" data-act="gmplan" data-gid="${gc.id}">${armed('gmplan'+gc.id)?'Tap again to rebuild':'Rebuild rotation'}</button><button class="btn small ${armed('gmdel'+gc.id)?'danger-s armed':''}" data-act="gmdel" data-gid="${gc.id}">${armed('gmdel'+gc.id)?'Tap again to remove':'Remove game'}</button>${st&&st.started?'<span class="fine">'+(gc.imported?'Final '+scoreOf(st).us+'–'+scoreOf(st).them:'Started')+'</span>':''}</div>
      ${gameExtrasHTML(gc)}
      <div class="fld">Opponent logo<div class="logorow">${ol?`<img src="${esc(ol)}" alt="">`:'<span class="muted">None</span>'}<label class="btn small filebtn">Upload<input type="file" accept="image/*" data-cfg="opplogo" data-gid="${gc.id}" hidden></label>${gc.oppLogo?`<button class="btn small" data-act="opplogodel" data-gid="${gc.id}">Use default</button>`:''}</div></div></div>`;return h;};
  const cur=c.games.filter(gc=>!gc.imported),past=c.games.filter(gc=>gc.imported).sort((a,b)=>String(b.dt).localeCompare(String(a.dt)));
  cur.forEach(gc=>{h+=gcard(gc);});
  h+=`<button class="btn small" data-act="gmadd">+ Add game</button>`;
  if(past.length)h+=`<details class="past"><summary>Past results (${past.length})</summary>${past.map(gcard).join('')}</details>`;
  h+='</div>';
  out.schedule+=tournamentsCardHTML()+h;h='';
  h+=authSetupHTML();
  h+=`<div class="card"><h3>Sharing</h3><p class="fine" style="margin-top:-4px">Parent link for ${esc(c.name)}. Anyone with it can follow along but can’t change anything.</p>
    <div class="codebox"><input readonly value="${esc(parentLink())}" aria-label="Parent link"><button class="btn small" data-act="copylink">Copy</button></div>
    <p class="fine">Club scoreboard: every team’s live scores, schedule and results on one page.</p><div class="codebox"><input readonly value="${esc(location.origin+clubLink())}" aria-label="Club link"><button class="btn small" data-act="copyclub">Copy</button><a class="btn small" href="${clubLink()}">Open</a></div>`;
  if(SY.on)h+=`<p class="fine">Team coach code: lets another coach run this team’s games without your main code. The main code from Netlify works for every team.</p>
    <div class="codebox"><input id="newcode" type="password" autocomplete="off" placeholder="New team code (4+ characters)"><button class="btn small" data-act="setcode">Set code</button></div>`;
  h+='</div>';
  h+=testTeamHTML();
  h+=`<div class="card"><h3>Teams</h3>${SY.on&&S.master?`<button class="btn small primary-s" data-act="puball" ${UI.pubBusy?'disabled':''} style="margin-bottom:8px">${UI.pubBusy?'Loading teams…':'Load all teams to the live site'}</button><p class="fine" style="margin-top:0">Adds every team on this iPad to the club page in one step. Teams already on the live site aren’t changed.</p>`:''}${teamsList().map(t=>`<div class="set"><span>${esc(t.name)}${t.id===S.team?' <span class="tag">Open now</span>':''}</span>${t.id===S.team?'':`<button class="btn small" data-act="teamgo" data-id="${t.id}">Open</button>`}</div>`).join('')}
    ${UI.newTeam?`<div class="newteam"><label class="fld">New team name<input id="nt-name" placeholder="e.g. U10 Boys Blue" value="${esc(UI.ntName||'')}"></label><div class="seg">${FORMATS.map(f=>`<button data-act="ntfmt" data-f="${f}" aria-pressed="${UI.ntFmt===f}">${f}</button>`).join('')}</div>
      <div class="gacts"><button class="btn small primary-s" data-act="teamcreate">Create team</button><button class="btn small" data-act="teamnewcancel">Cancel</button></div></div>`
      :`<button class="btn small" data-act="teamnew" style="margin-top:8px">+ New team</button>`}</div>`;
  out.setup+=h;
  return note+out[part];
}
/* Parent views */
/* Parents don't see the lineup or bench until kickoff. */
const hideLineup=()=>isParent()&&!G().started;
function renderParentBench(d){
  const g=G();if(!g.started)return '<div class="empty">The lineup and bench show here at kickoff.</div>';const bench=PLAYERS.filter(p=>av(g,p.id)&&!d.on.has(p.id));
  return bench.length?'<div class="bgrid">'+bench.map(p=>`<div class="bp"><span class="n">${esc(p.name)}${jn(p)}${p.guest?'<span class="tag">Guest</span>':''}</span><span class="r">On the bench</span></div>`).join('')+'</div>'
    :'<div class="empty">Everyone who’s here is on the field.</div>';
}
/* Guest players sit in their own collapsed list; whether it's open is remembered while the page is open. */
function guestsWrap(where,title,note){const open=UI.guestsOpen&&UI.guestsOpen[where];
  return `<details class="guests" data-guests="${where}"${open?' open':''}><summary><b>${esc(title)}</b>${note?`<span class="fine">${esc(note)}</span>`:''}</summary>`;}
document.addEventListener('toggle',e=>{const w=e.target&&e.target.dataset&&e.target.dataset.guests;if(!w)return;UI.guestsOpen=UI.guestsOpen||{};UI.guestsOpen[w]=e.target.open;},true);
/* Parents: Game (score, clock and goals first; stats and great plays one tap away), Schedule and Team. */
EXT.pview=ds=>{UI.pview=ds.v||'';};
EXT.opengame=ds=>{act('game',ds);S.tab=isParent()?'game':'bench';if(!isParent())S.mode='game';saveLocal();try{window.scrollTo(0,0);}catch(e){}renderAll();return false;};
['pview','opengame'].forEach(a=>VIEW_OK.add(a));
function goalsListHTML(g){
  const gl=g.goals.slice().sort((a,b)=>b.t-a.t);
  return gl.length?'<ul class="log">'+gl.map(x=>`<li class="${x.side==='us'?'goal':''}"><div class="lt">${tmin(g,x.t)}</div><div class="ll"><div>${x.side==='us'?'Goal '+esc(shortName())+(x.by?': '+esc(nm(x.by)):'')+(x.ast?', assist '+esc(nm(x.ast)):''):'Goal '+esc(oppName())}</div></div></li>`).join('')+'</ul>'
    :`<p class="muted">${g.fullDone?'No goals.':g.started?'No goals yet.':'Goals show here once the game starts.'}</p>`;
}
function renderParentGame(d){
  const g=G(),gc=GC(),v=UI.pview||'',back='<div class="subhead"><button class="btn small" data-act="pview" data-v="">‹ Back to the game</button></div>';
  if(v==='plays')return back+renderParentStats(d);
  if(v==='stats')return back+(g.started?teamStatsHTML(g):'')+'<h3>Great plays</h3>'+positiveHTML(g,pstatsOf(gc.id))+keeperHTML(keeperStats([{g,rep:g.started?d:null}]),'Keepers');
  let h='';
  if(g.pk){const ps=pkScore(g);h+=`<div class="ctx">Penalty kicks ${ps.us}–${ps.them}</div>`;}
  h+='<h3>Goals</h3>'+goalsListHTML(g);
  const live=['live','halftime'].includes(gStatus(gc));
  h+=`<div class="gacts subacts">${live?'<button class="btn small" data-act="pview" data-v="plays"><span aria-hidden="true">⭐</span> Add a great play</button>':''}<button class="btn small" data-act="pview" data-v="stats">Game stats</button></div>`;
  if(live)h+='<h3>On the bench</h3>'+renderParentBench(d);
  return h;
}
/* One schedule row; tapping it opens that game. */
function schedRowHTML(x){
  const st=stateOf(x),sc=scoreOf(st),k=gStatus(x);
  const r=st.fullDone?(sc.us>sc.them?'W':sc.us<sc.them?'L':(st.pk?(pkScore(st).us>pkScore(st).them?'W':'L'):'D')):'';
  const pks=st.pk?` <span class="fine">PKs ${pkScore(st).us}–${pkScore(st).them}</span>`:'';
  const right=k==='final'?`<span class="res r${r}" aria-label="${r==='W'?'Win':r==='L'?'Loss':'Draw'}">${r}</span> <b>${sc.us}–${sc.them}</b>${pks}`
    :k==='live'||k==='halftime'?`<span class="livepill">${k==='halftime'?'Halftime':'Live'}</span> <b>${sc.us}–${sc.them}</b>`
    :k==='awaiting'||k==='postponed'?`<span class="stpill">${esc(statusLabel(k,st))}</span>`:'';
  const i=CFG().games.indexOf(x);
  return `<div class="sched ${i===curIdx()?'cur':''}"><button class="schbtn" data-act="opengame" data-i="${i}">${logoImg(oppLogoOf(x),'cls')}<span class="sgrow"><b>${x.opp?esc(x.opp):esc(x.title)}</b><span class="fine">${esc(whenText(x))}${x.field?' · '+esc(x.field):''}</span></span><span class="sres">${right}</span></button>${!st.fullDone&&x.place&&!['awaiting','postponed'].includes(k)?`<a class="maplink" href="${mapUrl(x.place)}" target="_blank" rel="noopener">Directions</a>`:''}</div>`;
}
/* Games in order, with a heading wherever a run of games belongs to a tournament. */
function schedListHTML(list){
  let h='',prev=null;
  list.forEach(x=>{const t=typeof tourOf==='function'?tourOf(x):null;const id=t?t.id:null;
    if(id&&id!==prev)h+=tourHeadHTML(t);prev=id;h+=schedRowHTML(x);});
  return h;
}
function renderParentSchedule(){
  const tsd=x=>{const v=kickoffMs(x);return Number.isFinite(v)?v:Infinity;};const bk=gBucket,gs=CFG().games;
  const up=gs.filter(x=>['live','today','upcoming'].includes(bk(x))).sort((a,b)=>tsd(a)-tsd(b));
  const undated=gs.filter(x=>bk(x)==='undated'),waiting=gs.filter(x=>bk(x)==='needs-result').sort((a,b)=>tsd(b)-tsd(a)),post=gs.filter(x=>bk(x)==='postponed');
  const done=gs.filter(x=>bk(x)==='final').sort((a,b)=>tsd(b)-tsd(a));
  const waitingEvents=pendingEntries(CFG(),T());
  let h=`<h3>Coming up</h3>`+(up.length?schedListHTML(up):waitingEvents.length?'':'<p class="muted">No upcoming games scheduled.</p>')+waitingEvents.map(entryHTML).join('');
  if(undated.length)h+='<h3>Date to be set</h3>'+schedListHTML(undated);
  if(post.length)h+='<h3>Postponed</h3>'+schedListHTML(post);
  if(waiting.length)h+='<h3>Awaiting result</h3>'+schedListHTML(waiting);
  if(done.length)h+='<h3>Results</h3>'+schedListHTML(done);
  return h;
}
/* Season record from this season's finished games (August on). */
function seasonRecord(){const now=new Date(T());const from=new Date(now.getMonth()>=7?now.getFullYear():now.getFullYear()-1,7,1).getTime();
  let w=0,l=0,dr=0;CFG().games.forEach(gc=>{const st=TS().games[gc.id];const t=kickoffMs(gc);if(!st||!st.fullDone||!(t>=from))return;const sc=scoreOf(st);
    const r=sc.us>sc.them?'W':sc.us<sc.them?'L':(st.pk?(pkScore(st).us>pkScore(st).them?'W':'L'):'D');if(r==='W')w++;else if(r==='L')l++;else dr++;});
  return w+l+dr?`${w}-${dr}-${l}`:'';}
function renderParentTeam(){
  const c=CFG(),rec=seasonRecord();
  let h=`<div class="teamhead"><b>${esc(c.name)}</b>${c.sub?`<span class="fine">${esc(c.sub)}</span>`:''}</div>`;
  if(c.placing||rec)h+=`<p class="teamrec">${c.placing?`<span class="cplace">${esc(placeText(c.placing))}</span>`:''}${c.placing&&rec?' · ':''}${rec?`${rec} this season <span class="muted">(W-D-L)</span>`:''}</p>`;
  h+=`<h3>Players (${PLAYERS.filter(p=>!p.guest).length})</h3>`;
  const rrow=p=>`<div class="rrow"><span class="rnum">${p.num?'#'+esc(p.num):''}</span><b>${esc(p.name)}</b>${gradeHTML(p)}</div>`;
  const reg=PLAYERS.filter(p=>!p.guest),gst=PLAYERS.filter(p=>p.guest);
  h+=reg.length?'<div class="rosterl">'+reg.map(rrow).join('')+'</div>':gst.length?'':'<p class="muted">No players listed yet.</p>';
  if(gst.length)h+=guestsWrap('team',`Guest players (${gst.length})`,'')+'<div class="rosterl">'+gst.map(rrow).join('')+'</div></details>';
  h+=`<p class="fine teamfoot"><a class="maplink" href="${clubLink()}">All teams</a> · Coaches sign in from the ⋯ menu.</p>`;
  return h;
}
function teamStatsHTML(g){const t=teamShots(g);
  return `<div class="tstats"><div><b>${t.shots}</b><span>Shots</span></div><div><b>${t.onT}</b><span>On target</span></div><div><b>${t.goals}</b><span>Goals</span></div><div><b>${t.saves}</b><span>Saves</span></div><div><b>${t.saves+t.ga}</b><span>Their shots on target</span></div></div>`;}
function renderStats(d){
  const g=G();const pl=pstatsOf(GC().id);const c=statCounts(g,pl);let h=teamStatsHTML(g);
  h+=`<p class="fine">Switch the field to <b>Track stats</b>, then tap a player to log a stat. Her position’s most common stats come first.</p>`;
  const cols=[['Shots',x=>(x.sot||0)+(x.soff||0)+(x.g||0)],['On tgt',x=>(x.sot||0)+(x.g||0)],['G',x=>x.g||0],['A',x=>x.a||0],['KP',x=>x.kp||0],['Pass',x=>x.pass||0],['Bad',x=>x.bpass||0],['Won',x=>x.tackle||0],['Int',x=>x.int||0],['Clr',x=>x.clr||0],['Thr',x=>x.thr||0],['Sv',x=>x.save||0]];
  if(slideOK())cols.splice(cols.findIndex(([l])=>l==='Won')+1,0,['Slide',x=>x.slide||0]);
  const rows=PLAYERS.filter(p=>av(g,p.id)).map(p=>{const x=Object.assign({},c[p.id]||{});x.g=g.goals.filter(q=>q.side==='us'&&q.by===p.id).length;x.a=g.goals.filter(q=>q.side==='us'&&q.ast===p.id).length;return {p,x};});
  h+=`<div class="rwrap"><table class="rtable"><thead><tr><th>Player</th>${cols.map(([l])=>`<th>${l}</th>`).join('')}</tr></thead><tbody>${rows.map(({p,x})=>`<tr><td class="pn">${esc(p.name)}${jn(p)}</td>${cols.map(([,f])=>{const v=f(x);return `<td class="${v?'':'z'}">${v||'·'}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
  const recent=(g.stats||[]).map((s,i)=>({s,i})).slice(-12).reverse();
  if(pl.length)h+=`<h3>From parents (${pl.length})</h3><p class="fine" style="margin-top:-4px">Positive stats parents added. They’re in the table above. Remove any that don’t look right.</p><ul class="log">${pl.slice(-12).reverse().map(x=>`<li><div class="lt">${tfmt(g,x.t)}</div><div class="ll"><div>${esc(nm(x.id))}: ${esc(STATS[x.k]||x.k)}<button class="del ${armed('pst'+x.u)?'armed':''}" data-act="pstatdel" data-u="${x.u}">${armed('pst'+x.u)?'Tap to remove':'Remove'}</button></div></div></li>`).join('')}</ul>`;
  if(recent.length)h+=`<h3>Recent stats</h3><ul class="log">${recent.map(({s,i})=>`<li><div class="lt">${tfmt(g,s.t)}</div><div class="ll"><div><i>${s.pos||''}</i>${esc(nm(s.id))}: ${esc(STATS[s.k]||s.k)}<button class="del ${armed('stat'+i)?'armed':''}" data-act="statdel" data-i="${i}">${armed('stat'+i)?'Tap to remove':'Remove'}</button></div></div></li>`).join('')}</ul>`;
  return h;
}
function renderGoals(d){
  const g=G();const gl=g.goals.slice().sort((a,b)=>b.t-a.t);let h='';
  if(g.pk){const ps=pkScore(g);h+=`<div class="ctx">Penalty kicks ${ps.us}–${ps.them}</div>`;}
  if(g.started)h+=teamStatsHTML(g);
  h+=gl.length?'<ul class="log">'+gl.map(x=>`<li class="${x.side==='us'?'goal':''}"><div class="lt">${tmin(g,x.t)}</div><div class="ll"><div>${x.side==='us'?'Goal '+esc(shortName())+(x.by?': '+esc(nm(x.by)):'')+(x.ast?', assist '+esc(nm(x.ast)):''):'Goal '+esc(oppName())}</div></div></li>`).join('')+'</ul>'
    :'<div class="empty">No goals yet.</div>';
  h+=keeperHTML(keeperStats([{g,rep:g.started?d:null}]),'Keepers');
  return h;
}
function renderPanel(){
  renderTabs();const d=replay(G());const b=$('tbody');
  if(isParent())b.innerHTML=S.tab==='schedule'?renderParentSchedule():S.tab==='team'?renderParentTeam():renderParentGame(d);
  else b.innerHTML=S.tab==='plan'&&usePlan()?renderPlan(d):S.tab==='players'?renderPlayers(d):S.tab==='log'?renderLog(d):S.tab==='stats'?renderStats(d):S.tab==='minutes'?renderMinutes():S.tab==='season'?renderSeason():S.tab==='practice'?renderPractice():['setup','roster','schedule'].includes(S.tab)?renderSetup(S.tab):renderBench(d);
  if(UI.focus){const el=$(UI.focus);UI.focus=null;if(el){el.focus();try{el.select();}catch(e){}}}
}
function renderSync(){
  const el=$('sync');if(!el)return;
  if(!SY.on){el.hidden=!SY.localAt;el.className='sync local';el.textContent='✓ Saved on this device';return;}
  el.hidden=false;
  // Connection, not game status: "Live" is only ever used for a game being played.
  const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
  if(!canEdit()){el.className='sync '+(offline?'lost':SY.ok?'view':'lost');el.textContent=offline?'Offline':SY.ok?'Connected':'Reconnecting…';return;}
  if(offline){el.className='sync lost';el.textContent='Offline · saved on this device';return;}
  const busy=Object.values(SY.inflight).some(n=>n>0);
  const unsent=CFG()&&(JSON.stringify(CFG())!==SY.lastSent.cfg||CFG().games.some(gc=>{const st=TS().games[gc.id];return st&&JSON.stringify(st)!==SY.lastSent[gc.id];}));
  if(!SY.ok){el.className='sync lost';el.textContent='Reconnecting… changes are kept';}
  else if(busy){el.className='sync saving';el.textContent='Saving…';}
  else if(unsent&&!SY.first){el.className='sync saving';el.textContent='Saving…';}
  else if(Date.now()-SY.savedAt<3000){el.className='sync saved';el.textContent='✓ Saved';}
  else{el.className='sync run';el.textContent='✓ All changes saved';}
}
function renderLive(){
  if(!CFG())return;const g=G();const d=replay(g);
  document.querySelectorAll('[data-lv="played"]').forEach(el=>{const s=d.st[el.dataset.id];if(s)el.textContent=fmt(s.played);});
  document.querySelectorAll('[data-lv="sattot"]').forEach(el=>{const s=d.st[el.dataset.id];if(s)el.textContent=fmt(d.now-s.played);});
  document.querySelectorAll('[data-lv="sit"]').forEach(el=>{const s=d.st[el.dataset.id];if(s)el.textContent=fmt(d.now-s.offAt);});
  document.querySelectorAll('[data-lv="kick"]').forEach(el=>{el.textContent=countdown(GC());});
}
function renderFmode(){
  const el=$('fmode');if(!el)return;
  if(!canEdit()){el.innerHTML='';UI.fieldMode='sub';return;}
  if(planEditing()){el.innerHTML='';return;}
  const m=UI.fieldMode||'sub';
  el.innerHTML=`<div class="fmode"><span>Tap a player to:</span><button data-act="fmode" data-m="sub" aria-pressed="${m==='sub'}">Sub</button><button data-act="fmode" data-m="stat" aria-pressed="${m==='stat'}">Track stats</button>${m==='stat'&&(G().stats||[]).length?`<button class="undo" data-act="statundo">Undo last</button>`:''}</div>`;
}
function renderSheet(){
  const el=$('sheet');if(!el)return;const s=UI.sheet;
  if(!s||!CFG()){el.innerHTML='';return;}
  if(s.parent){const o=statOrder(s.grp||'MID');const ks=o.top.concat(o.rest).filter(k=>POS_STATS.includes(k));
    el.innerHTML=`<div class="sheetbg" data-act="sheetclose"></div><div class="sheetp" role="dialog" aria-label="Great play by ${esc(nm(s.id))}">
      <div class="sh"><div><b>${esc(nm(s.id))}</b>${jn(P[s.id])}<div class="fine">What did she do? ${fmt(regOf(G(),clock(G())))}</div></div><button class="btn small" data-act="sheetclose">Close</button></div>
      <div class="sgrid">${ks.map(k=>`<button class="sbtn" data-act="pstat" data-k="${k}">${STATS[k]}</button>`).join('')}</div></div>`;return;}
  const grp=(PI[s.pos]&&PI[s.pos].g)||'MID';const o=statOrder(grp);
  const c=statCounts(G())[s.id]||{};const cnt=k=>c[k]?`<i>${c[k]}</i>`:'';
  el.innerHTML=`<div class="sheetbg" data-act="sheetclose"></div><div class="sheetp" role="dialog" aria-label="Stats for ${esc(nm(s.id))}">
    <div class="sh"><div><b>${esc(nm(s.id))}</b>${jn(P[s.id])}<div class="fine">${esc(PI[s.pos]?PI[s.pos].name:s.pos)} at ${fmt(clock(G()))}</div></div><button class="btn small" data-act="sheetclose">Close</button></div>
    <div class="sgrid">${o.top.map(k=>`<button class="sbtn" data-act="stat" data-k="${k}">${STATS[k]}${cnt(k)}</button>`).join('')}${grp!=='GK'?`<button class="sbtn goal" data-act="statgoal">⚽ Goal</button>`:''}</div>
    <button class="btn small more" data-act="sheetmore">${s.more?'Fewer':'More stats'}</button>
    ${s.more?`<div class="sgrid sm">${o.rest.map(k=>`<button class="sbtn" data-act="stat" data-k="${k}">${STATS[k]}${cnt(k)}</button>`).join('')}</div>`:''}</div>`;
}
function renderAll(){
  renderSync();
  if(!CFG()){$('bname').textContent='Loading…';$('bsub').textContent='';$('tbody').innerHTML='<div class="empty">Loading the team…</div>';return;}
  useTeam();renderBrand();renderGames();renderCtrl();renderClock();renderScore();renderBanner();renderFmode();renderField();renderHint();renderSheet();
  const ae=document.activeElement;const typing=ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)&&$('tbody').contains(ae)&&ae.type!=='file';
  if(!typing)renderPanel();else renderTabs();
}

/* ---------- Clock loop ---------- */
let lastSec=-1;
function tick(){
  if(!CFG())return;
  const g=G();let changed=false;
  // A stats helper's device follows the clock but doesn't change it (the server only lets them add goals and stats).
  const statsOnly=myRole()==='stats'&&!myCode()&&!S.master;
  if(g.running&&!statsOnly){
    const E=ends(g);let c=clock(g);
    for(const e of E){if(c>=e&&!g.stops.includes(e)){g.acc=e;g.running=false;g.stops.push(e);if(e===E[0])g.halfDone=true;if(e===E[E.length-1]){g.fullDone=true;g.pending=null;}changed=true;alarm();break;}}
    c=clock(g);const H=HMS(g),SUB=SMS(g);const r=regOf(g,c),e0=ends(g)[0];
    if(!g.fullDone)for(let i=1;i*SUB<2*H;i++){if(i*SUB<=r&&(i*SUB!==H||c>=e0)&&!g.alerted.includes(i)){g.alerted.push(i);if(pOff(g)||i<PL().length)g.pending=i;changed=true;alarm();}}
  }
  if(UI.msg&&Date.now()>UI.msgT){UI.msg='';renderHint();}
  if(changed){save();renderAll();return;}
  const wk=winK(g,clock(g));
  if(wk!==UI.win){const was=UI.win;UI.win=wk;if(wk!=null&&g.pending==null&&g.running&&was!==undefined)alarm();renderAll();return;}
  renderClock();
  const sec=Math.floor(clock(g)/1000);
  if(sec!==lastSec){lastSec=sec;renderLive();}
}

/* ---------- Club page ---------- */
const CLUB={data:null,on:false,ok:false,edit:false};
// A school program's teams link back to their own program page.
const clubLink=()=>{const c=CFG();const p=c&&c.program?programKey(c.program):'';return location.pathname+'?club=1'+(p?'&program='+encodeURIComponent(p):'');};
const teamLink=id=>location.pathname+'?team='+encodeURIComponent(id);
const gameLink=(id,gid)=>teamLink(id)+'&game='+encodeURIComponent(gid);
function summarizeGame(g,pname){
  const goals=g.goals||[];
  return {started:!!g.started,running:!!g.running,acc:g.acc||0,runStart:g.runStart||0,half:g.half||30,ot:g.ot||null,fullDone:!!g.fullDone,stops:g.stops||[],
    us:goals.filter(x=>x.side==='us').length,them:goals.filter(x=>x.side==='them').length,
    pk:g.pk?{us:(g.pk.us||[]).filter(k=>k.made).length,them:(g.pk.them||[]).filter(Boolean).length}:null,
    scorers:goals.filter(x=>x.side==='us').map(x=>({t:x.t,by:x.by?(pname[x.by]||''):''}))};
}
function localClub(){
  const teams=Object.keys(S.T).filter(id=>S.T[id].cfg).map(id=>{const c=S.T[id].cfg;const pname={};c.players.forEach(p=>pname[p.id]=p.name);
    return {id,name:c.name,short:c.short||'',sub:c.sub||'',logo:c.logo||null,format:c.format,entries:c.entries||[],
      games:c.games.map(gc=>{const st=S.T[id].games[gc.id];return {id:gc.id,title:gc.title,oppLogo:gc.oppLogo||'',opp:gc.opp||'',dt:gc.dt||'',when:gc.when||'',field:gc.field||'',place:gc.place||'',half:gc.half||30,tid:gc.tid||'',status:gc.status||'',s:st?summarizeGame(st,pname):null};})};});
  return {club:S.club||null,teams};
}
async function clubFetch(){
  try{const t0=Date.now();const r=await fetch(API+'?club=1',{cache:'no-store'});if(!r.ok)throw 0;const j=await r.json();if(!j||!Array.isArray(j.teams))throw 0;
    const off=j.now-Math.round((t0+Date.now())/2);OFF=CLUB.on?Math.round(OFF*0.8+off*0.2):off;
    CLUB.on=true;CLUB.ok=true;CLUB.data=j;}
  catch(e){if(!CLUB.on)CLUB.data=localClub();else CLUB.ok=false;}
  renderClub();
}
const clubName=()=>(CLUB.data&&CLUB.data.club&&CLUB.data.club.name)||(S.club&&S.club.name)||'Cottontown United';
const clubLogo=()=>(CLUB.data&&CLUB.data.club&&CLUB.data.club.logo)||(S.club&&S.club.logo)||LOGO;
function sClock(s){const tot=2*s.half*60000+(s.ot?s.ot.n*s.ot.len*60000:0);return Math.min(tot,s.acc+(s.running?T()-s.runStart:0));}
function sPeriod(s){
  if(s.fullDone)return s.pk?'Final after PKs':'Final';
  const c=sClock(s),H=s.half*60000;
  if(!s.running&&s.stops.includes(c)){if(c===H)return 'Halftime';if(c===2*H)return s.ot?'End of regulation':'Full time';return 'Overtime break';}
  if(c<H)return '1st half';if(c<2*H||!s.ot)return '2nd half';return 'Overtime';
}
function sResult(s){if(!s||!s.fullDone)return null;if(s.us>s.them)return 'W';if(s.us<s.them)return 'L';
  if(s.pk){if(s.pk.us>s.pk.them)return 'W';if(s.pk.us<s.pk.them)return 'L';}return 'D';}
const scoreStr=s=>s.us+'–'+s.them+(s.pk?` (PKs ${s.pk.us}–${s.pk.them})`:'');
function teamBadge(t,cls){const ini=(t.name||'?').split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();return t.logo?`<img class="${cls}" src="${esc(t.logo)}" alt="">`:`<span class="${cls} badge">${esc(ini)}</span>`;}
function renderClub(){
  const el=$('club');const d=CLUB.data;if(!d){el.innerHTML='<div class="empty">Loading the club…</div>';return;}
  const all=[];d.teams.forEach(t=>t.games.forEach(g=>{if(g.s&&g.s.scorers)g.s.scorers=g.s.scorers.filter(x=>x.by||x.t>0);all.push({t,g});}));
  const live=all.filter(x=>x.g.s&&x.g.s.started&&!x.g.s.fullDone);
  const tsOf=x=>{const v=x.g.dt?new Date(x.g.dt).getTime():NaN;return isNaN(v)?Infinity:v;};
  const upcoming=all.filter(x=>!x.g.s||!x.g.s.started).sort((a,b)=>tsOf(a)-tsOf(b)).slice(0,10);
  const now=new Date();const season=new Date(now.getMonth()>=7?now.getFullYear():now.getFullYear()-1,7,1).getTime();
  const inSeason=x=>tsOf(x)!==Infinity&&tsOf(x)>=season;
  const results=all.filter(x=>x.g.s&&x.g.s.fullDone&&inSeason(x)).sort((a,b)=>tsOf(b)-tsOf(a)).slice(0,15);
  const canClubEdit=!CLUB.on||!!S.master;
  let h=`<header class="clubtop"><img src="${esc(clubLogo())}" alt=""><div><h1>${esc(clubName())}</h1><p>Club scoreboard${CLUB.on?(CLUB.ok?' <span class="sync view">Connected</span>':' <span class="sync lost">Reconnecting…</span>'):''}</p></div></header><main class="clubmain">`;
  // weekend window: Friday 00:00 through Sunday 23:59 of this week (or the coming one, Mon-Thu)
  const wd=now.getDay();const sun=new Date(now.getFullYear(),now.getMonth(),now.getDate()+((7-wd)%7));
  const wkStart=new Date(sun.getFullYear(),sun.getMonth(),sun.getDate()-2).getTime(),wkEnd=new Date(sun.getFullYear(),sun.getMonth(),sun.getDate(),23,59,59).getTime();
  const inWk=g=>{const v=tsOf({g});return v!==Infinity&&v>=wkStart&&v<=wkEnd;};
  const recOf=t=>{let w=0,l=0,dr=0;t.games.forEach(g=>{if(!inSeason({g}))return;const r=sResult(g.s);if(r==='W')w++;else if(r==='L')l++;else if(r==='D')dr++;});return `${w}-${dr}-${l}`;};
  const gameLine=(t,g)=>{const s=g.s;let st;
    if(s&&s.started&&!s.fullDone)st=`<span class="gl-live"><b>${s.us}–${s.them}</b> <span data-ck="${t.id}/${g.id}">${fmtClock(sClock(s))}</span> <span class="per" data-cp="${t.id}/${g.id}">${sPeriod(s)}</span></span>`;
    else if(s&&s.fullDone){const r=sResult(s);st=`<span class="res r${r}">${r}</span> <b class="glsc">${scoreStr(s)}</b>`;}
    else{const cd=countdown(g);st=cd?`<span class="cd" data-kick="${esc(g.dt)}">${cd}</span>`:'';}
    return `<div class="gl ${s&&s.started&&!s.fullDone?'on':''}">${logoImg(oppLogoOf(g),'cls')}<div class="cinfo"><b>vs ${esc(g.opp||g.title||'Opponent')}</b><div class="fine">${esc(whenText(g))}${g.field?', '+esc(g.field):''}</div></div><div class="glst">${st}</div></div>`;};
  const wkTeams=d.teams.filter(t=>t.games.some(inWk)).map(t=>({t,first:Math.min(...t.games.filter(inWk).map(g=>tsOf({g}))),live:t.games.some(g=>g.s&&g.s.started&&!g.s.fullDone)}))
    .sort((a,b)=>(b.live-a.live)||(a.first-b.first));
  const others=d.teams.filter(t=>!t.games.some(inWk)).sort((a,b)=>a.name.localeCompare(b.name));
  const wkLabel=new Date(wkStart+864e5).toLocaleDateString('en-US',{month:'short',day:'numeric'})+'–'+new Date(wkEnd).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  h+=`<section class="cs"><h2>Playing this weekend <span class="wk">${wkLabel}</span></h2>`+(wkTeams.length?'<div class="cgrid wkgrid">'+wkTeams.map(({t,live})=>{
      const gs=t.games.filter(inWk).sort((a,b)=>tsOf({g:a})-tsOf({g:b}));
      return `<div class="ccard ${live?'live':''}"><a class="cta" href="${teamLink(t.id)}"><div class="ct">${teamBadge(t,'cl')}<div><b>${esc(t.name)}</b>${t.placing?`<div class="cplace">${esc(placeText(t.placing))}</div>`:''}<div class="fine">${esc([t.sub,t.format].filter(Boolean).join(', '))}${t.games.some(g=>inSeason({g})&&g.s&&g.s.fullDone)?', '+recOf(t)+' this season':''}</div></div>${live?'<span class="livepill">Live</span>':''}</div></a>
        <div class="gls">${gs.map(g=>`<a class="gla" href="${gameLink(t.id,g.id)}">${gameLine(t,g)}</a>`).join('')}</div><a class="open" href="${teamLink(t.id)}">Open team ›</a></div>`;}).join('')+'</div>':'<p class="muted">No games scheduled this weekend.</p>')+'</section>';
  if(others.length)h+=`<section class="cs"><h2>Other teams</h2><div class="cgrid">`+others.map(t=>{
      const nx=t.games.filter(g=>!g.s||!g.s.started).sort((a,b)=>tsOf({g:a})-tsOf({g:b}))[0];
      return `<a class="ccard" href="${teamLink(t.id)}"><div class="ct">${teamBadge(t,'cl')}<div><b>${esc(t.name)}</b>${t.placing?`<div class="cplace">${esc(placeText(t.placing))}</div>`:''}<div class="fine">${esc([t.sub,t.format].filter(Boolean).join(', '))}</div></div></div>
        <div class="fine">${recOf(t)} this season${nx?`. Next: ${nx.opp?'vs '+esc(nx.opp)+', ':''}${esc(whenText(nx))}`:''}</div></a>`;}).join('')+'</div></section>';
  h+=`<section class="cs"><h2>Recent results</h2>`+(results.length?'<div class="clist">'+results.map(({t,g})=>{const s=g.s;const r=sResult(s);
    return `<a class="crow" href="${gameLink(t.id,g.id)}">${teamBadge(t,'cls')}<div class="cinfo"><b>${esc(t.name)}</b> vs ${esc(g.opp||'Opponent')}${logoImg(oppLogoOf(g),'ilg')}<div class="fine">${esc(whenText(g))}${s.scorers.length?': '+s.scorers.map(x=>esc(x.by||'Goal')).join(', '):''}</div></div><span class="res r${r}">${r}</span><span class="cfinal">${scoreStr(s)}</span></a>`;}).join('')+'</div>':'<p class="muted">No finished games yet this season.</p>')+'</section>';
  if(CLUB.on&&S.master){h+=`<section class="cs"><h2>Coach tools</h2><button class="btn small primary-s" data-cact="puball" ${UI.pubBusy?'disabled':''}>${UI.pubBusy?'Loading teams…':'Load all teams'}</button>${CLUB.msg?`<p class="fine">${esc(CLUB.msg)}</p>`:'<p class="fine">Adds every team saved on this iPad to the club page. Teams already here aren’t changed.</p>'}</section>`;}
  if(canClubEdit){
    h+=`<section class="cs"><h2>Club settings</h2>${CLUB.edit?`<div class="card"><label class="fld">Club name<input id="club-name" value="${esc(clubName())}"></label>
      <div class="fld">Club logo<div class="logorow"><img src="${esc(clubLogo())}" alt=""><label class="btn small filebtn">Upload<input type="file" accept="image/*" id="club-logo" hidden></label></div></div>
      <div class="gacts"><button class="btn small primary-s" data-cact="save">Save</button><button class="btn small" data-cact="cancel">Cancel</button></div></div>`
      :`<button class="btn small" data-cact="edit">Edit club name and logo</button>`}</section>`;
  }
  h+=`<p class="fine cfoot">Tap a team or game to follow it live. ${CLUB.on?'Scores update every few seconds.':''}</p></main>`;
  el.innerHTML=h;
}
function clubTick(){
  if(!CLUB.data)return;
  document.querySelectorAll('[data-ck]').forEach(el=>{const [tid,gid]=el.dataset.ck.split('/');const t=CLUB.data.teams.find(x=>x.id===tid);const g=t&&t.games.find(x=>x.id===gid);if(g&&g.s){el.textContent=fmtClock(sClock(g.s));const p=document.querySelector(`[data-cp="${tid}/${gid}"]`);if(p)p.textContent=sPeriod(g.s);}});
  document.querySelectorAll('[data-kick]').forEach(el=>{el.textContent=countdown({dt:el.dataset.kick});});
}
let clubLogoData=null;
document.addEventListener('change',e=>{if(e.target&&e.target.id==='club-logo'){const f=e.target.files&&e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=()=>{const img=new Image();img.onload=()=>{const s=200,sc=Math.min(1,s/Math.max(img.width,img.height));const cv=document.createElement('canvas');cv.width=Math.round(img.width*sc);cv.height=Math.round(img.height*sc);
    const cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(img,0,0,cv.width,cv.height);clubLogoData=cv.toDataURL('image/jpeg',0.85);
    const pv=document.querySelector('#club .logorow img');if(pv)pv.src=clubLogoData;};img.src=r.result;};r.readAsDataURL(f);}});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-cact]');if(!b)return;const a=b.dataset.cact;
  if(a==='puball'){publishAll();return;}
  if(a==='edit'){CLUB.edit=true;clubLogoData=null;renderClub();return;}
  if(a==='cancel'){CLUB.edit=false;renderClub();return;}
  if(a==='save'){const nmv=($('club-name')||{}).value||clubName();const club={name:nmv.trim()||clubName(),logo:clubLogoData||clubLogo()};
    S.club=club;saveLocal();
    if(CLUB.on){try{await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'club',team:'cottontown',club,code:S.master||''})});}catch(err){}}
    if(CLUB.data)CLUB.data.club=club;CLUB.edit=false;renderClub();clubFetch();}
});
function clubInit(){
  document.querySelector('.app').style.display='none';$('club').hidden=false;document.title=document.documentElement.classList.contains('beta')?'Cottontown Beta':'Club scoreboard';
  renderClub();clubFetch();setInterval(()=>{if(document.visibilityState==='visible'&&!CLUB.edit)clubFetch();},5000);setInterval(clubTick,1000);
}

function init(){
  S=load();if(!S.dv){S.dv=uid('d');saveLocal();}
  const QP=new URLSearchParams(location.search);
  if(QP.has('club')||!QP.has('team')){clubInit();return;}
  const qp=new URLSearchParams(location.search).get('team');
  if(qp&&/^[a-z0-9-]{1,40}$/.test(qp)){S.team=qp;if(!S.T[qp])S.T[qp]={cfg:null,games:{}};}
  UI.wantGame=QP.get('game');openWanted();
  if(!S.T[S.team])S.team='cottontown';
  SY.team=S.team;
  if(CFG())useTeam();
  renderAll();setInterval(tick,250);syncInit();
}
