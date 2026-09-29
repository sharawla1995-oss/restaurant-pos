const fs=require('fs'),path=require('path'),assert=require('assert'),root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');
assert(!css.includes('-webkit-overflow-scrolling:touch;touch-action:pan-y'),'touch-action must not be unconditional on Win7 mouse sidebar');
assert(css.includes('@media (pointer:coarse){.sidebar nav{touch-action:pan-y}}'),'touch scrolling must remain available for coarse pointers');
assert(app.includes("$('#nav').addEventListener('pointerup'"),'mouse-safe pointer activation missing');
assert(app.includes("e.pointerType!=='mouse'||e.button!==0"),'pointer fallback must accept primary mouse only');
assert(app.includes("Date.now()-sidebarPointerActivationAt<500"),'pointer/click duplicate activation guard missing');
assert(app.includes("$('#nav').onclick=e=>activateSidebarRoute(e.target,'click')"),'normal click path must remain supported');
console.log('Sidebar Win7 local mouse + touch-scroll compatibility gate PASS');
