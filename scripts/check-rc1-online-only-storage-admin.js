'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const attachments=fs.readFileSync('purchasing-attachments-v1.js','utf8');
const must=(v,m)=>{if(!v)throw new Error(m)};

must(app.includes("async function rc1RequireCloudOnline(action='العملية')"),'shared online-only cloud preflight missing');
must(app.includes("fetch(`${cfg.url}/auth/v1/user`"),'shared preflight must probe authenticated cloud session');
must(app.includes("e.code='ONLINE_ONLY_INTERNET_REQUIRED'"),'preflight must expose explicit internet-required code');
must(app.includes("await rc1RequireCloudOnline('رفع صورة الصنف')"),'product image must preflight before storage upload');
must(app.includes("await rc1RequireCloudOnline('رفع لوجو النشاط')"),'business logo must preflight before storage upload');
must(app.includes("async function rc1RemoveStorageObject(bucket,path)"),'storage compensation helper missing');
must(app.includes("await rc1RemoveStorageObject('product-images',path)"),'product image orphan cleanup missing');
must(app.includes("await rc1RemoveStorageObject('business-assets',path)"),'business logo orphan cleanup missing');
must(app.includes("await rc1RequireCloudOnline('حفظ طرق دفع الموقع')"),'website payment save preflight missing');
must(app.includes("body:JSON.stringify(rows)"),'website payment methods must use one bulk request');
must(!app.includes("for(const m of state.paymentMethods){const existing=state.branchPaymentMethods.find(x=>Number(x.branch_id)===activeBranch"),'website payment settings still save row-by-row');

must(attachments.includes("async function requireCloud(action)"),'attachment shared/local online preflight missing');
must(attachments.includes("await requireCloud('رفع مرفقات المشتريات')"),'attachment upload preflight missing');
must(attachments.includes("await requireCloud('فتح أرشيف مرفقات المشتريات')"),'attachment archive live-read preflight missing');
must(!attachments.includes("retail_supplier_invoices',`select=id,supplier_id,invoice_number,invoice_date,total_amount,status&branch_id=eq.${b}&order=invoice_date.desc,id.desc&limit=500`).catch(()=>[])"),'attachment invoice loader still collapses network failure to empty');
must(attachments.includes("await removeObject(prep.bucket,prep.path)"),'attachment failed finalize must clean storage object');
must(attachments.includes("purchase_attachment_abort_v1"),'attachment failed finalize must abort metadata record');

console.log('RC1 Online-only storage/admin fail-closed gate PASS');
