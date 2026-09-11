const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const versionPath = path.join(root, 'version.json');
const indexPath = path.join(root, 'index.html');
const swPath = path.join(root, 'sw.js');
const retailEnginePath = path.join(root, 'retail-engine.js');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = String(pkg.version || '').trim();
if (!version) throw new Error('package.json has no version');
const channel = version.includes('-') ? 'beta' : 'stable';

const versionJson = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
versionJson.version = version;
versionJson.channel = channel;
fs.writeFileSync(versionPath, JSON.stringify(versionJson, null, 2) + '\n', 'utf8');

function escapeRe(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const beta33Assets=['sharawla-capabilities-beta33.js','sharawla-capability-runtime-bridge.js','sharawla-cloud-runtime-v2.js'];
const directAssets=['styles.css','update-indicators.css','version-ui.js','update-ui.js','sharawla-runtime-core.js','sharawla-capabilities.js',...beta33Assets,'restaurant-engine.js','retail-engine.js','pharmacy-engine.js','app.js','profile-parity-ui.js','beta28-runtime-fixes.js','owner-diagnostics.js','beta29-retail-functional-finalization.js','pharmacy-ui.js'];
const dynamicRetailAssets=['retail-website-pos.js','beta22-runtime-fixes.js','beta23-full-retail.js','retail-finalization-ui.js'];

let index = fs.readFileSync(indexPath, 'utf8');
if(!index.includes('sharawla-capabilities-beta33.js?v=')){
  const anchor='<script src="restaurant-engine.js';
  const injected=beta33Assets.map(asset=>`<script src="${asset}?v=${version}"></script>`).join('\n')+'\n';
  if(!index.includes(anchor))throw new Error('Could not find Restaurant Engine script anchor for Beta33 assets');
  index=index.replace(anchor,injected+anchor);
}
for (const asset of directAssets) index = index.replace(new RegExp(escapeRe(asset) + '\\?v=[^\"]+', 'g'), `${asset}?v=${version}`);
fs.writeFileSync(indexPath, index, 'utf8');

let retailEngine = fs.readFileSync(retailEnginePath, 'utf8');
for(const asset of dynamicRetailAssets) retailEngine=retailEngine.replace(new RegExp(escapeRe(asset)+'\\?v=[^\']+','g'),`${asset}?v=${version}`);
fs.writeFileSync(retailEnginePath, retailEngine, 'utf8');

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE='sharawla-pos-v[^']+';/, `const CACHE='sharawla-pos-v${version}';`);
if(!sw.includes("'./sharawla-capabilities-beta33.js?v=")){
  const shellAnchor="'./restaurant-engine.js?v=";
  const injected=beta33Assets.map(asset=>`'./${asset}?v=${version}'`).join(',')+',';
  if(!sw.includes(shellAnchor))throw new Error('Could not find Restaurant Engine SW shell anchor for Beta33 assets');
  sw=sw.replace(shellAnchor,injected+shellAnchor);
}
if(!sw.includes("url.pathname.endsWith('/sharawla-capabilities-beta33.js')")){
  const fetchAnchor="||url.pathname.endsWith('/restaurant-engine.js')";
  const injected=beta33Assets.map(asset=>`||url.pathname.endsWith('/${asset}')`).join('');
  if(!sw.includes(fetchAnchor))throw new Error('Could not find Restaurant Engine SW fetch anchor for Beta33 assets');
  sw=sw.replace(fetchAnchor,injected+fetchAnchor);
}
for (const asset of [...directAssets,...dynamicRetailAssets]) sw = sw.replace(new RegExp('\\./' + escapeRe(asset) + '\\?v=[^\']+', 'g'), `./${asset}?v=${version}`);
fs.writeFileSync(swPath, sw, 'utf8');
console.log(`Version sync OK: ${version} (${channel})`);
