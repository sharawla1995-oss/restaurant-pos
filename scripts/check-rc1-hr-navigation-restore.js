'use strict';
const fs=require('fs'),assert=require('assert');

const hr=fs.readFileSync('hr-attendance-admin-v1.js','utf8');
const parity=fs.readFileSync('beta55-navigation-parity.js','utf8');
const productMap=fs.readFileSync('product-map-navigation-v1.js','utf8');

const hrKeys=['employees','attendance','schedules','leaves','advances','adjustments','rules','payroll','reports','settings'];
assert(
  hr.includes("const HR_NAV_KEYS=Object.freeze(['employees','attendance','schedules','leaves','advances','adjustments','rules','payroll','reports','settings']);"),
  'Sharawla HR must own all HR navigation entries'
);
for(const legacy of ['employees','advances','adjustments','payroll']){
  assert(
    new RegExp('data-beta54-page=["\\\']'+legacy+'["\\\'][^}]*display\\s*:\\s*none','i').test(hr),
    'Legacy Beta54 top-level HR button must be hidden and rendered through Sharawla HR: '+legacy
  );
}
assert(
  hr.includes('for(const key of HR_NAV_KEYS)'),
  'HR dynamic group must render the canonical HR key list'
);
assert(
  hr.includes("group.classList.toggle('hidden',!HR_NAV_KEYS.some(key=>has(PAGE_DEF[key][1])))"),
  'HR group visibility must depend on all canonical HR pages'
);
assert(
  parity.includes("node.querySelectorAll('button[data-hr-page]')"),
  'Navigation parity must read canonical data-hr-page children'
);
assert(
  !parity.includes("node.querySelectorAll('button[data-beta54-page]')"),
  'Navigation parity must not treat hidden Beta54 renderer buttons as top-level HR children'
);
assert(
  parity.includes("'group:hr':{icon:'👨‍💼',label:'Sharawla HR'"),
  'HR parity card must be labeled Sharawla HR'
);
assert(
  productMap.includes("'__hr_group__','employees','advances','adjustments','payroll'"),
  'Sharawla HR group must occupy the employee/HR product-map slot'
);
for(const key of hrKeys)assert(hr.includes(key),'HR contract missing key '+key);

console.log('RC1 HR navigation PASS — Sharawla HR owns 10 pages; legacy renderers preserved; top-level duplicates hidden');
