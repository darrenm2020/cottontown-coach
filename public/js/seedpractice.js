"use strict";
/* Tue 10/27: tonight's Development practice, planned with Coach Todd and Coach Jenna. It's saved to the team's
   practices the first time a Development coach opens the app, once, and never again after tonight. */
const SEED_PRACTICE={id:'p-dev-1027',team:'cottontown',until:'2026-10-28',practice:{id:'p-dev-1027',date:'2026-10-27T17:30',
  title:'Build-out, balls into space, finishing through balls',
  focus:'Todd: center mid in the build-out and the center back’s job; playing balls into space. Jenna: finishing through balls.',
  place:'',attendance:{},
  notes:'Equipment: cones in 2 colors, pinnies, balls, 2 full goals (or 1 goal + 3 small gates), a keeper.\nAbout 98 min. Only have 90? Cut the scrimmage to 30 min, or take 3 min out of the build-out.',
  blocks:[
    {id:'b1',drill:'',min:10,title:'Warm-up: movement + passing in 3s',
      notes:'Dynamic movement (4 min): jog, high knees, butt kicks, side shuffles, carioca, short sprints.\nPassing in 3s (6 min): lines of three, 10–12 yds apart. Middle player checks toward the ball, glances over her shoulder before it arrives, receives on the back foot facing the other end, plays it out. Passer follows her pass.\nSay: "Look before it gets to you." "Open your hips." "First touch away from pressure."'},
    {id:'b2',drill:'',min:18,title:'Building out: center back + center mid (Todd)',
      notes:'Half field. Keeper + LB, CB, RB + center mid build out vs 3 pressers. 3 small cone gates on the halfway line.\nKeeper starts every ball. Builders score through a gate; pressers win it and shoot on the big goal.\nFirst 8 min: center mid must touch it before it goes through a gate. Then add a 4th presser who marks the center mid.\n\nCENTER MID: show in the space ahead of the CB, not next to her. Stay in a passing lane (defender in between? move). Check shoulder, turn forward when you can; if not, play back or wide and show again.\n\nCENTER BACK: split wide of the keeper, fullbacks spread out. No pressure? Dribble forward into midfield to pull a defender and free a teammate. Looks in order: (1) CM’s feet, (2) wide back, (3) ball into space for a forward. Ball goes wide: stay central and slightly behind. Talk: direct the fullbacks, tell the CM "turn!" or "man on!". Lose it: get goal-side and delay, don’t dive in.'},
    {id:'b3',drill:'',min:15,title:'Playing balls into space (Todd)',
      notes:'40×30 grid, 5-yd end zone at each end. 4v4 + 2 neutrals who play for the team with the ball.\nGoal only when a teammate runs onto a pass into the end zone (not a pass to someone already standing there).\nPasser plays where she’s going, not where she is. Runner goes before the pass, at an angle, and points. Pass firm enough that the defender can’t cut it out.\nProgression: goal within 3 passes counts double.'},
    {id:'b4',drill:'',min:3,title:'Water break',notes:''},
    {id:'b5',drill:'',min:15,title:'Finishing through balls (Jenna)',
      notes:'Keeper in a full goal. Passers at the center circle (center mids get extra turns), forwards near the sideline about 30 yds out. Cone gate ~22 yds out stands in for the defense.\nPasser plays it through the gate; forward times a curved run to stay onside, one touch toward goal, shoot. Swap lines.\nRun so the ball comes to you moving forward; first touch out in front toward goal; shoot early before the keeper sets; low and across the keeper to the far post.\nLast 6 min: a defender chases from 3 yds behind.'},
    {id:'b6',drill:'',min:35,title:'Scrimmage vs the other team (30–45 min)',
      notes:'First 15 min: every goal kick played short to the CB or a fullback (no long kicks); a goal from a through ball counts double. Then play normally.\nTodd watches: does the CM show and turn? Does the CB dribble forward when no one presses her?\nJenna watches: forwards’ run timing and shooting early.\nCoach with quick sideline comments; don’t stop play.'},
    {id:'b7',drill:'',min:2,title:'Wrap-up',
      notes:'One question per theme: "Center mid, where do you stand when the keeper has the ball?" "Where do you pass a through ball?" "What’s your first touch on a through ball?"'}]}};
let seedTried=false; // once per app load, so a phone that can't save it doesn't keep retrying
async function seedPractice(){
  const s=SEED_PRACTICE,d=new Date(T());
  const today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  if(seedTried||S.team!==s.team||!SY.on||!canEdit()||(typeof TEST!=='undefined'&&TEST.on)||today>=s.until||(S.seeded&&S.seeded[s.id]))return;
  seedTried=true;
  try{let list=PR.team===s.team&&PR.list?PR.list:null;
    if(!list){const r=await apiGet('practices='+encodeURIComponent(s.team));if(!r.ok)return;list=r.j.practices||[];}
    const mark=()=>{S.seeded=S.seeded||{};S.seeded[s.id]=true;saveLocal();};
    if(list.some(x=>x.id===s.id)){mark();return;}
    const r=await apiPost(Object.assign({kind:'practice',team:s.team,practice:s.practice},creds()));
    if(!r.ok)return;mark();
    if(PR.team===s.team&&PR.list&&!PR.list.some(x=>x.id===s.id))PR.list.push(JSON.parse(JSON.stringify(s.practice)));
    say('Tonight’s practice plan is on the Practice tab');renderAll();
  }catch(e){}
}
loadPractices=(base=>async function(){await base();seedPractice();})(loadPractices);
