const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'app.js'),'utf8');

const badPatterns=[
  "function navActive(p){$('#nav button').forEach",
  "$('#settingsSections [data-settings-section]').forEach",
  "$('#settingsHubTabs [data-settings-tab]').forEach"
];
for(const bad of badPatterns){
  if(src.includes(bad)) throw new Error('beta58.28 regression: single-element $ selector used with forEach: '+bad);
}

const goodPatterns=[
  "function navActive(p){$$('#nav button').forEach",
  "$$('#settingsSections [data-settings-section]').forEach",
  "$$('#settingsHubTabs [data-settings-tab]').forEach"
];
for(const good of goodPatterns){
  if(!src.includes(good)) throw new Error('beta58.28 contract missing: '+good);
}

console.log('beta58.28 selector forEach corrective PASS');
