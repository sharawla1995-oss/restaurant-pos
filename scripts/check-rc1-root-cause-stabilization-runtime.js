'use strict';
const fs=require('fs');
const assert=require('assert');
const read=p=>fs.readFileSync(p,'utf8');

const sync=read('beta45-offline-v2-sync.js');
assert(sync.includes("reason:'backend_contract'"));
assert(sync.includes("OFFLINE_V2_BACKEND_CONTRACT_MISSING"));
assert(sync.includes("c.reason!=='backend_contract'"));

const hard=read('beta55-5-runtime-hardening.js');
assert(hard.includes("deliverySettings:Object.freeze({mode:'partial',read:true,create:true,update:true"));
assert(hard.includes("if(page==='deliverySettings')return '[data-settle]'"));

const recovery=read('beta55-4-runtime-recovery.js');
assert(recovery.includes("['treasury_movements',"));

const beta54=read('beta54-shared-core-ui.js');
assert(beta54.includes('data-treasury-offline="1"'));
assert(beta54.includes("const add=!offline&&has('treasury.post')"));

const parity=read('beta55-navigation-parity.js');
assert(parity.includes('canonicalNavAliasOf'));
assert(parity.includes("__SharawlaBeta54SharedCore?.render('treasury')"));
assert(parity.includes("__SharawlaHrAttendanceAdminV1?.open()"));

const hr=read('hr-attendance-admin-v1.js');
assert(hr.includes("const HR_NAV_KEYS=Object.freeze(['employees','attendance','schedules','leaves','advances','adjustments','rules','payroll','reports','settings']);"));
assert(hr.includes('function renderLanding()'));
assert(hr.includes('renderEmployeeProfile'));

const loader=read('beta36-integration-loader.js');
assert(loader.indexOf("['hr-employee-profile-model-v1'")<loader.indexOf("['hr-attendance-admin-v1'"));

const profile=require('../hr-employee-profile-model-v1.js');
assert.equal(typeof profile.load,'function');
assert.equal(typeof profile.classifyOptionalError,'function');

const pkg=JSON.parse(read('package.json'));
assert(String(pkg.scripts.check).includes('check-beta58-30-offline-practical-rc1.js'));
assert(String(pkg.scripts['check:ci']).includes('check-beta58-30-offline-practical-rc1.js'));

const syntax=read('scripts/check-runtime-syntax.js');
assert(!syntax.includes("require('./check-beta58-30-offline-practical-rc1.js');"));
assert(syntax.includes("'hr-employee-profile-model-v1.js'"));

for(const rel of [
 'beta36-integration-loader.js','beta45-offline-v2-sync.js','beta54-shared-core-ui.js',
 'beta55-4-runtime-recovery.js','beta55-5-runtime-hardening.js','beta55-navigation-parity.js',
 'beta55-ui-workflow-fixes.js','hr-attendance-admin-v1.js','package.json',
 'scripts/check-beta45-offline-v2-transport.js','scripts/check-beta55-5-runtime-hardening.js',
 'scripts/check-runtime-syntax.js','sw.js','hr-employee-profile-model-v1.js',
 'docs/SHARAWLA-RC1-ROOT-CAUSE-STABILIZATION-CONTRACT-2026-09-30.md',
 'docs/SHARAWLA-RC1-ROOT-CAUSE-STABILIZATION-PRACTICAL-MATRIX-2026-09-30.md'
]) assert(fs.existsSync(rel),rel+' missing');

console.log('RC1 Root-Cause stabilization focused runtime gate PASS');
