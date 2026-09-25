const fs=require('fs');
const s=fs.readFileSync('app.js','utf8').replace(/\r\n/g,'\n');
const must=['function ordersDateValue(','async function cacheOrderRows(rows)','created_at=gte.${fromIso}&created_at=lte.${toIso}','pageSize=100','id="ordersFrom" type="date"','id="ordersTo" type="date"','await cacheOrderRows(rows.slice(0,pageSize))','.slice(offset,offset+pageSize+1)'];
for(const x of must)if(!s.includes(x))throw new Error('orders performance contract missing: '+x);
const start=s.indexOf('async function renderOrders(opts={})'),end=s.indexOf('\n\nfunction customerImportField',start),body=s.slice(start,end);
if(body.includes('for(const o of rows)')&&body.includes('await cacheOrderBundle'))throw new Error('sequential per-order cache writes returned');
if(body.includes('limit=200'))throw new Error('legacy fixed 200-order query returned');
console.log('Orders performance/date-window contract PASS');
