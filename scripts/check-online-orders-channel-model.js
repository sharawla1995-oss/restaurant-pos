'use strict';
const fs=require('fs'),app=fs.readFileSync('app.js','utf8');
const f=[],n=(x,m)=>{if(!x)f.push(m)};
const section=(start,end)=>{const s=app.indexOf(start);if(s<0)return '';const e=app.indexOf(end,s+start.length);return app.slice(s,e>s?e:app.length)};
const m=section('function resolveOnlineOrderChannel(','function onlineOrderNotificationRoute(');
const i=section('async function renderOnlineOrders(','async function renderDeliveryOrders(');
n(/source==='website'.*channel:'web'.*connector:'website'/.test(m)&&/supported:true/.test(m),'website channel mapping missing');
n(/connector:null.*supported:false/.test(m),'unknown channel not fail-closed');
n(/resolveOnlineOrderChannel\(opts\.source\|\|'website'\)/.test(app),'action boundaries not channel-derived');
n(/channel\.label/.test(i),'inbox label not channel-derived');
n((app.match(/rpc\('accept_website_order'/g)||[]).length===1&&(app.match(/rpc\('reject_website_order'/g)||[]).length===1,'RPC ownership regressed');
if(f.length){console.error('Online Orders Channel Final Model: FAIL');f.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Channel Final Model: PASS');
