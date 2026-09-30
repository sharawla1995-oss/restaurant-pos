'use strict';
const fs=require('fs'),assert=require('assert');

const hr=fs.readFileSync('hr-attendance-admin-v1.js','utf8');
const parity=fs.readFileSync('beta55-navigation-parity.js','utf8');
const productMap=fs.readFileSync('product-map-navigation-v1.js','utf8');

for(const legacy of ['employees','advances','adjustments','payroll']){
  assert(
    !new RegExp('data-beta54-page=["\\\']'+legacy+'["\\\'][^}]*display\\s*:\\s*none','i').test(hr),
    'HR must not hide legacy Beta54 route: '+legacy
  );
}
assert(
  hr.includes("const HR_NAV_KEYS=Object.freeze(['attendance','schedules','leaves','rules','reports','settings']);"),
  'HR new-navigation keys must be explicit and exclude legacy routes'
);
assert(
  hr.includes('for(const key of HR_NAV_KEYS)'),
  'HR dynamic group must render only HR_NAV_KEYS'
);
assert(
  hr.includes("group.classList.toggle('hidden',!HR_NAV_KEYS.some(key=>has(PAGE_DEF[key][1])))"),
  'HR group visibility must depend only on new HR pages'
);

assert(
  parity.includes("node.querySelectorAll('button[data-hr-page]')"),
  'Navigation parity must read current HR data-hr-page children'
);
assert(
  !parity.includes("node.querySelectorAll('button[data-beta54-page]')"),
  'Navigation parity must not treat legacy Beta54 buttons as children of the new HR group'
);
assert(
  parity.includes("'group:hr':{icon:'👨‍💼',label:'Sharawla HR'"),
  'HR parity card must be labeled Sharawla HR, not الموظفون'
);

assert(
  productMap.includes("'employees','advances','adjustments','payroll','__hr_group__'"),
  'Legacy employee routes must stay before the new HR group'
);
assert(
  !productMap.includes("'__hr_group__','employees','advances','adjustments','payroll'"),
  'New HR group must not replace the legacy employee position'
);

console.log('RC1 HR navigation restore PASS — legacy=4 visible; new_hr_pages=6; parity=data-hr-page; order=legacy-before-hr');
