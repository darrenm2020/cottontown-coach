"use strict";
/* Add to Home Screen: the site installs like an app (full screen, club icon). On iPhone and iPad, Safari has no
   install button a page can press, so "Add to Home Screen" shows the two taps it takes. On Android and desktop
   Chrome it opens the browser's own install prompt. Hidden once the app is already open from the Home Screen. */
const INST={prompt:null,open:false,back:null};
const isIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandalone=()=>navigator.standalone===true||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches);
const canOfferInstall=()=>!isStandalone()&&(isIOS()||!!INST.prompt);
/* The name under the Home Screen icon follows the page (a team's short name, or the club or school). */
function setAppTitle(t){const m=document.getElementById('apptitle');const v=String(t||'Cottontown').slice(0,24);if(m&&m.getAttribute('content')!==v)m.setAttribute('content',v);}

function installButtons(){document.querySelectorAll('[data-install]').forEach(b=>{b.hidden=!canOfferInstall();});}
if(typeof window.addEventListener==='function'){
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();INST.prompt=e;installButtons();});
  window.addEventListener('appinstalled',()=>{INST.prompt=null;installButtons();});
}
// Footers and menus are drawn after load; show or hide each new Add to Home Screen button as it appears.
if(typeof MutationObserver==='function')new MutationObserver(()=>{if(document.querySelector('[data-install]:not([data-inst-seen])')){document.querySelectorAll('[data-install]').forEach(b=>b.setAttribute('data-inst-seen',''));installButtons();}})
  .observe(document.documentElement,{childList:true,subtree:true});

function instHTML(){
  if(!INST.open)return '';
  const ipad=/iPad/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  return `<div class="ovbg" data-inst="close"></div><div class="ovp fbkp" role="dialog" aria-modal="true" aria-labelledby="inst-h">
    <div class="sh"><b id="inst-h">Add to your Home Screen</b><button class="btn small" data-inst="close">Close</button></div>
    <ol class="inststeps">
      <li>In <b>Safari</b>, tap the <b>Share</b> button <span class="shareico" aria-hidden="true">⬆︎</span> ${ipad?'at the top of the screen':'at the bottom of the screen'}.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
      <li>Tap <b>Add</b>.</li></ol>
    <p class="fine">The icon opens this page, so add it from your team’s page to go straight to your team. It opens full screen, like an app.</p>
    <div class="gacts"><button class="btn primary-s" data-inst="close">Got it</button></div></div>`;
}
function instRender(){let el=document.getElementById('inst');if(!el){el=document.createElement('div');el.id='inst';document.body.appendChild(el);}const h=instHTML();if(el.innerHTML!==h)el.innerHTML=h;}
document.addEventListener('click',async e=>{
  const b=e.target.closest&&e.target.closest('[data-install]');
  if(b){e.preventDefault();e.stopPropagation();
    if(typeof NAV!=='undefined'&&NAV.open){NAV.open='';if(typeof CFG==='function'&&CFG())renderAll();}
    if(INST.prompt){const p=INST.prompt;INST.prompt=null;p.prompt();try{await p.userChoice;}catch(err){}installButtons();return;}
    INST.open=true;INST.back=b.closest('.ovp')?document.getElementById('menubtn'):b;instRender();const c=document.querySelector('#inst .btn.primary-s');if(c)c.focus();return;}
  const a=e.target.closest&&e.target.closest('[data-inst]');
  if(a&&a.dataset.inst==='close'){INST.open=false;instRender();const bk=INST.back;INST.back=null;if(bk&&document.contains(bk))bk.focus();}
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&INST.open){e.stopPropagation();INST.open=false;instRender();if(INST.back&&document.contains(INST.back))INST.back.focus();}},true);
