'use strict';
const fs=require('fs');const app=fs.readFileSync('app.js','utf8');const fail=[];const need=(x,m)=>{if(!x)fail.push(m)};
const boundary=(app.match(/async function rejectOnlineOrderFromChannel\([\s\S]*?\n}\n\nasync function renderOnlineOrders/)||[])[0]||'';
const inbox=(app.match(/async function renderOnlineOrders\([\s\S]*?\n}\n\nasync function renderDeliveryOrders/)||[])[0]||'';
need(!!boundary,'generic reject boundary missing');
need(/source=String\(opts\.source\|\|'website'\)/.test(boundary),'source adapter boundary missing');
need(/source!=='website'/.test(boundary),'unknown channel must fail closed');
need(/openWebsiteOrderReview\(websiteOrderId,'reject'\)/.test(boundary),'existing reject confirmation missing');
need(/rpc\('reject_website_order'/.test(boundary),'website reject adapter RPC missing');
need(/data-online-reject/.test(inbox),'Online Inbox Reject action missing');
need(/rejectOnlineOrderFromChannel/.test(inbox),'Online Inbox must call generic reject boundary');
need(!/rpc\('reject_website_order'/.test(inbox),'Online Inbox must not call reject RPC directly');
need(/data-web-reject/.test(app),'legacy Delivery compatibility Reject must remain during migration');
need((app.match(/rpc\('reject_website_order'/g)||[]).length===1,'website Reject RPC must have one runtime owner');
need((app.match(/rpc\('accept_website_order'/g)||[]).length===1,'Accept RPC ownership regressed');
if(fail.length){console.error('Online Orders Batch 4 Reject Boundary: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Batch 4 Reject Boundary: PASS');
console.log('action=reject; boundary=core-channel-adapter; website_rpc_owner=single; legacy_compat=true; accept=preserved');
