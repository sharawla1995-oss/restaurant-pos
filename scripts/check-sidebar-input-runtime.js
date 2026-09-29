const fs=require('fs'),path=require('path'),assert=require('assert'),root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');
assert(css.includes('.sidebar nav{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding-bottom:8px;scrollbar-width:thin}'),'sidebar scroll contract missing');
assert(!css.includes('-webkit-overflow-scrolling:touch'),'legacy forced touch scrolling still active');
assert(css.includes('@media (pointer:coarse){.sidebar nav{touch-action:pan-y}}'),'touch scrolling must remain available for coarse pointers');
assert(css.includes('.sidebar nav button{touch-action:manipulation;'),'buttons must remain activation targets');
assert(app.includes("$('#nav').onclick=e=>{const b=e.target.closest('button[data-page]');if(b)showPage(b.dataset.page)}"),'delegated click navigation changed');
assert(!/mousedown[^\n]*showPage|pointerdown[^\n]*showPage|touchstart[^\n]*showPage/.test(app),'navigation must not fire early on press');
console.log('Sidebar local mouse/touch activation gate PASS');
