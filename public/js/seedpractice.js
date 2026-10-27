"use strict";
/* Tue 10/27: tonight's Development practice, planned with Coach Todd and Coach Jenna. Through Wednesday, any
   Development coach's phone saves it to the team's practices if it's missing, and links its blocks to the matching
   drills (with diagrams) in the library. */
const SEED_PRACTICE={id:'p-dev-1027b',old:'p-dev-1027',team:'cottontown',until:'2026-10-28',practice:{id:'p-dev-1027b',date:'2026-10-27T17:30',
  title:'Build-out, balls into space, finishing through balls',
  focus:'Todd: center back pick to free the fullback, center mid in the build-out; playing balls into space. Jenna: finishing through balls.',
  place:'',attendance:{},
  notes:'Equipment: cones in 2 colors, pinnies, balls, 2 full goals (or 1 goal + 3 small gates), a keeper.\nAbout 98 min. Only have 90? Cut the scrimmage to 30 min, or take 3 min out of the build-out.',
  blocks:[
    {id:'b1',drill:'warmup-check-turn-3s',min:10,title:'Warm-up: movement + passing in 3s',
      notes:'Dynamic movement (4 min): jog, high knees, butt kicks, side shuffles, carioca, short sprints.\nPassing in 3s (6 min): lines of three, 10–12 yds apart. Middle player checks toward the ball, glances over her shoulder before it arrives, receives on the back foot facing the other end, plays it out. Passer follows her pass.\nSay: "Look before it gets to you." "Open your hips." "First touch away from pressure."'},
    {id:'b2',drill:'build-out-cb-cm-gates',min:18,title:'Building out: center back pick + center mid (Todd)',
      notes:'Half field. Keeper + LB, CB, RB + center mid build out vs 3 pressers. 3 small cone gates on the halfway line.\nKeeper starts every ball and plays it to the left or right back, NOT the center back. Builders score through a gate; pressers win it and shoot on the big goal.\nFirst 8 min: center mid must touch it before it goes through a gate. Then add a 4th presser who marks the center mid.\n\nCENTER BACK: not an option to receive here. Her job is to set a pick on the forward who would press the fullback, so the fullback has time and space. Read which side the keeper is going and get into that forward’s path early. Stand in her path; don’t step into her, hold or push (foul). Once the fullback is away, drop back central behind the ball as cover.\n\nFULLBACK: first touch forward into the space the pick made, then carry it or find the center mid.\n\nCENTER MID: show in the space ahead of the fullback and CB, not next to them. Stay in a passing lane (defender in between? move). Check shoulder, turn forward when you can; if not, play back or wide and show again.'},
    {id:'b3',drill:'possession-into-space-endzones',min:15,title:'Playing balls into space (Todd)',
      notes:'40×30 grid, 5-yd end zone at each end. 4v4 + 2 neutrals who play for the team with the ball.\nGoal only when a teammate runs onto a pass into the end zone (not a pass to someone already standing there).\nPasser plays where she’s going, not where she is. Runner goes before the pass, at an angle, and points. Pass firm enough that the defender can’t cut it out.\nProgression: goal within 3 passes counts double.'},
    {id:'b4',drill:'',min:3,title:'Water break',notes:''},
    {id:'b5',drill:'finishing-through-ball-runs',min:15,title:'Finishing through balls (Jenna)',
      notes:'Keeper in a full goal. Passers at the center circle (center mids get extra turns), forwards near the sideline about 30 yds out. Cone gate ~22 yds out stands in for the defense.\nPasser plays it through the gate; forward times a curved run to stay onside, one touch toward goal, shoot. Swap lines.\nRun so the ball comes to you moving forward; first touch out in front toward goal; shoot early before the keeper sets; low and across the keeper to the far post.\nLast 6 min: a defender chases from 3 yds behind.'},
    {id:'b6',drill:'small-sided-scrimmage-buildout-rules',min:35,title:'Scrimmage vs the other team (30–45 min)',
      notes:'First 15 min: every goal kick played short to the left or right back (no long kicks), with the CB setting a pick on that side’s forward; a goal from a through ball counts double. Then play normally.\nTodd watches: does the CB set the pick and then drop as cover? Does the CM show and turn?\nJenna watches: forwards’ run timing and shooting early.\nCoach with quick sideline comments; don’t stop play.'},
    {id:'b7',drill:'',min:2,title:'Wrap-up',
      notes:'One question per theme: "Center mid, where do you stand when the keeper has the ball?" "Where do you pass a through ball?" "What’s your first touch on a through ball?"'}]}};
let seedTried=false; // once per app load, so a phone that can't save it doesn't keep retrying
async function seedPractice(){
  const s=SEED_PRACTICE,d=new Date(T());
  const today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  if(seedTried||S.team!==s.team||!SY.on||!canEdit()||(typeof TEST!=='undefined'&&TEST.on)||today>s.until)return;
  seedTried=true;
  try{const r0=await apiGet('practices='+encodeURIComponent(s.team));if(!r0.ok)return;
    const all=r0.j.practices||[],have=all.find(x=>x.id===s.id),prev=all.find(x=>x.id===s.old);let p;
    // Reset (10/27): the first version had the center back receiving in the build-out. Replace it with this one,
    // keeping the time and place if a coach set them.
    if(!have){p=JSON.parse(JSON.stringify(s.practice));if(prev){if(prev.date)p.date=prev.date;if(prev.place)p.place=prev.place;}}
    else{ // keep the coaches' edits; only fill in drill links that are missing
      const want=Object.fromEntries(s.practice.blocks.map(b=>[b.id,b.drill]));let ch=false;
      p=JSON.parse(JSON.stringify(have));(p.blocks||[]).forEach(b=>{if(!b.drill&&want[b.id]){b.drill=want[b.id];ch=true;}});
      if(!ch)return;}
    const r=await apiPost(Object.assign({kind:'practice',team:s.team,practice:p},creds()));if(!r.ok)return;
    if(prev&&!have){await apiPost(Object.assign({kind:'practice-del',team:s.team,id:s.old},creds()));if(PR.list)PR.list=PR.list.filter(x=>x.id!==s.old);
      if(PR.edit&&PR.edit.id===s.old)PR.edit=null;if(PR.run&&PR.run.p.id===s.old)EXT.prstop();}
    if(PR.team===s.team&&PR.list){const i=PR.list.findIndex(x=>x.id===s.id);if(i>=0)PR.list[i]=p;else PR.list.push(p);}
    if(!have)say(prev?'Tonight’s practice was reset to the updated plan':'Tonight’s practice plan is on the Practice tab');renderAll();
  }catch(e){}
}
loadPractices=(base=>async function(){await base();seedPractice();})(loadPractices);
