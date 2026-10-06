const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8')}
const app=read('app.js'),attendance=read('hr-attendance-admin-v1.js'),core=read('hr-core-admin-v1.js');
function ok(cond,msg){if(!cond)throw new Error(msg)}
ok(app.includes("window.dispatchEvent(new Event('sharawla:auth-ready'))"),'app must signal auth-ready after session hydration');
ok((app.match(/sharawla:auth-ready/g)||[]).length>=2,'online and offline bootstrap must both signal auth-ready');
for(const [name,src] of [['attendance',attendance],['core',core]]){
 ok(src.includes("addEventListener('sharawla:auth-ready',refreshPermissions)"),name+' must refresh on auth-ready');
 ok(src.includes("global.hasFeaturePermission"),name+' must reuse loaded POS permissions');
 ok(src.includes("global.isAdmin"),name+' must show admin HR permissions immediately');
}
ok(attendance.includes('syncNav()'),'attendance refresh must update HR navigation');
console.log('V10.5.15_HR_NAV_IMMEDIATE_PASS');
