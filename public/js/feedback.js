"use strict";
/* Feedback from anyone, on any page: the "Feedback" button on the club pages and "Send feedback" in a team page's
   ⋯ menu open the same form. Notes go to the club admin (Club admin › Feedback); nothing else sees them.
   The form keeps what was typed if sending fails, so nothing is lost. */
const FBK={open:false,sent:false,busy:false,err:'',d:{type:'',text:'',name:'',contact:''},back:null};
const FBK_TYPES=[['idea','Idea'],['problem','Problem'],['question','Question'],['praise','Praise']];

function fbkContext(){
  const club=new URLSearchParams(location.search).has('club')||!new URLSearchParams(location.search).has('team');
  const c=!club&&typeof CFG==='function'&&S?CFG():null;
  let role='';try{role=club?(S&&S.master?'coach':'parent'):(typeof isParent==='function'&&isParent()?'parent':'coach');}catch(e){}
  return {page:(location.pathname+location.search).slice(0,200),team:c?S.team:'',game:c&&typeof GC==='function'&&GC()?GC().id:'',tab:club?'':String(S&&S.tab||''),
    role,ver:typeof APP_VER!=='undefined'?APP_VER:'',screen:innerWidth+'x'+innerHeight};
}
function fbkHTML(){
  if(!FBK.open)return '';
  const d=FBK.d;
  if(FBK.sent)return `<div class="ovbg" data-fbk="close"></div><div class="ovp fbkp" role="dialog" aria-modal="true" aria-labelledby="fbk-h">
    <div class="sh"><b id="fbk-h">Thanks!</b><button class="btn small" data-fbk="close">Close</button></div>
    <p>Your feedback was sent to the club admin.</p><div class="gacts"><button class="btn primary-s" data-fbk="close">Done</button><button class="btn small" data-fbk="again">Send another</button></div></div>`;
  return `<div class="ovbg" data-fbk="close"></div><form class="ovp fbkp" role="dialog" aria-modal="true" aria-labelledby="fbk-h" data-fbkform>
    <div class="sh"><div><b id="fbk-h">Send feedback</b><div class="fine">Goes to the club admin. Thank you!</div></div><button type="button" class="btn small" data-fbk="close">Close</button></div>
    <fieldset class="fbktypes"><legend class="sr">What kind of feedback?</legend>${FBK_TYPES.map(([k,l])=>`<label class="fbkt"><input type="radio" name="fbk-type" value="${k}" ${d.type===k?'checked':''}><span>${l}</span></label>`).join('')}</fieldset>
    <label class="fld">What’s on your mind?<textarea id="fbk-text" data-fbkf="text" rows="5" maxlength="2000" required placeholder="What worked, what didn’t, what you’d like to see…">${esc(d.text)}</textarea></label>
    <div class="grid2"><label class="fld">Your name (optional)<input data-fbkf="name" maxlength="60" autocomplete="name" value="${esc(d.name)}"></label>
      <label class="fld">Email or phone, if you’d like a reply (optional)<input data-fbkf="contact" maxlength="120" autocomplete="email" value="${esc(d.contact)}"></label></div>
    <label class="fbkhp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
    <p class="fine">We also note which page you were on, so we can find what you mean.</p>
    ${FBK.err?`<p class="formmsg" role="alert">${esc(FBK.err)}</p>`:''}
    <div class="gacts"><button type="submit" class="btn primary-s" ${FBK.busy?'disabled':''}>${FBK.busy?'Sending…':'Send feedback'}</button><button type="button" class="btn small" data-fbk="close">Cancel</button></div></form>`;
}
function fbkRender(){
  let el=document.getElementById('fbk');if(!el){el=document.createElement('div');el.id='fbk';document.body.appendChild(el);}
  const ae=document.activeElement;if(ae&&el.contains(ae)&&/^(INPUT|TEXTAREA)$/.test(ae.tagName)&&FBK.open&&!FBK.sent&&!FBK.err&&!FBK.busy)return;
  const h=fbkHTML();if(el.innerHTML!==h)el.innerHTML=h;
}
function fbkOpen(from){FBK.open=true;FBK.sent=false;FBK.err='';FBK.back=from||document.activeElement;fbkRender();
  const t=document.getElementById('fbk-text');if(t)t.focus();}
function fbkClose(){FBK.open=false;FBK.err='';fbkRender();const b=FBK.back;FBK.back=null;if(b&&document.contains(b))b.focus();}
async function fbkSend(form){
  const d=FBK.d;if(d.text.trim().length<3){FBK.err='Write a little more so we know what you mean.';fbkRender();return;}
  FBK.busy=true;FBK.err='';fbkRender();
  try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'feedback',feedback:Object.assign({},d,fbkContext(),{website:form&&form.website?form.website.value:''})})});
    const j=await r.json().catch(()=>({}));FBK.busy=false;
    if(r.ok){FBK.sent=true;FBK.d={type:'',text:'',name:d.name,contact:d.contact};}
    else FBK.err=j.error||'Couldn’t send it. Your note is still here; try again.';}
  catch(e){FBK.busy=false;FBK.err='Couldn’t reach the server. Check your connection; your note is still here.';}
  fbkRender();if(FBK.sent){const b=document.querySelector('#fbk .btn.primary-s');if(b)b.focus();}
}
document.addEventListener('click',e=>{
  const open=e.target.closest&&e.target.closest('[data-feedback]');
  if(open){e.preventDefault();e.stopPropagation();if(typeof NAV!=='undefined'&&NAV.open){NAV.open='';if(typeof renderAll==='function'&&CFG&&CFG())renderAll();}fbkOpen(open.closest('.ovp')?document.getElementById('menubtn'):open);return;}
  const a=e.target.closest&&e.target.closest('[data-fbk]');if(!a)return;
  if(a.dataset.fbk==='close')fbkClose();else if(a.dataset.fbk==='again'){FBK.sent=false;fbkRender();const t=document.getElementById('fbk-text');if(t)t.focus();}
},true);
document.addEventListener('input',e=>{const k=e.target&&e.target.dataset&&e.target.dataset.fbkf;if(k)FBK.d[k]=e.target.value;});
document.addEventListener('change',e=>{if(e.target&&e.target.name==='fbk-type')FBK.d.type=e.target.value;});
document.addEventListener('submit',e=>{if(e.target&&e.target.hasAttribute&&e.target.hasAttribute('data-fbkform')){e.preventDefault();fbkSend(e.target);}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&FBK.open){e.stopPropagation();fbkClose();}},true);
