const fs=require('fs'),path=require('path'),assert=require('assert');const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
assert(app.includes("let activePageRoute='home'"),'active route state missing');
assert(app.includes('activePageRoute=p;'),'showPage does not retain active route');
assert(app.includes("if(activePageRoute!=='businessSummary')return;"),'connectivity refresh is not isolated to Business Summary');
assert(app.includes("window.addEventListener('online',()=>{showOfflineStatus();syncOfflineQueue();refreshActiveDashboardForConnectivity()})"),'online transition does not refresh active Dashboard');
assert(app.includes("window.addEventListener('offline',()=>{showOfflineStatus();refreshActiveDashboardForConnectivity()})"),'offline transition does not refresh active Dashboard');
assert(!app.includes("window.addEventListener('online',()=>{showOfflineStatus();syncOfflineQueue()});window.addEventListener('offline',showOfflineStatus)"),'legacy connectivity handler still owns transition');
console.log('Universal Dashboard connectivity persistence gate PASS');
