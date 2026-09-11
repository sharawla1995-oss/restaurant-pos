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
const directAssets=['styles.css','update-indicators.css','version-ui.js','update-ui.js','sharawla-runtime-core.js','restaurant-engine.js','retail-engine.js','app.js','profile-parity-ui.js','owner-diagnostics.js'];
const dynamicRetailAssets=['retail-website-pos.js','beta22-runtime-fixes.js','beta23-full-retail.js','retail-finalization-ui.js'];

let index = fs.readFileSync(indexPath, 'utf8');
for (const asset of directAssets) index = index.replace(new RegExp(escapeRe(asset) + '\\?v=[^\"]+', 'g'), `${asset}?v=${version}`);
fs.writeFileSync(indexPath, index, 'utf8');

let retailEngine = fs.readFileSync(retailEnginePath, 'utf8');
for(const asset of dynamicRetailAssets) retailEngine=retailEngine.replace(new RegExp(escapeRe(asset)+'\\?v=[^\']+','g'),`${asset}?v=${version}`);
fs.writeFileSync(retailEnginePath, retailEngine, 'utf8');

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const CACHE='sharawla-pos-v[^']+';/, `const CACHE='sharawla-pos-v${version}';`);
for (const asset of [...directAssets,...dynamicRetailAssets]) sw = sw.replace(new RegExp('\\./' + escapeRe(asset) + '\\?v=[^\']+', 'g'), `./${asset}?v=${version}`);
fs.writeFileSync(swPath, sw, 'utf8');
console.log(`Version sync OK: ${version} (${channel})`);
