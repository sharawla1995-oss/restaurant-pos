const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function readJson(file) { return JSON.parse(read(file)); }
const pkg = readJson('package.json');
const versionFile = readJson('version.json');
const packageVersion = String(pkg.version || '').trim();
const appVersion = String(versionFile.version || '').trim();
const expectedChannel = packageVersion.includes('-') ? 'beta' : 'stable';
if (!packageVersion) throw new Error('package.json has no version.');
if (packageVersion !== appVersion) throw new Error(`Version mismatch: package.json=${packageVersion}, version.json=${appVersion}`);
if (String(versionFile.channel || '').trim() !== expectedChannel) throw new Error(`Channel mismatch: expected ${expectedChannel}, got ${versionFile.channel}`);
const index = read('index.html');
const sw = read('sw.js');
const app = read('app.js');
if (!/id="appVersionBadge">V—<\/small>/.test(index)) throw new Error('Version badge must be runtime-driven and contain no hardcoded app version.');
for (const asset of ['styles.css','version-ui.js','sharawla-runtime-core.js','restaurant-engine.js','app.js']) {
  if (!index.includes(`${asset}?v=${packageVersion}`)) throw new Error(`index.html cache reference mismatch for ${asset}`);
  if (!sw.includes(`./${asset}?v=${packageVersion}`)) throw new Error(`sw.js cache reference mismatch for ${asset}`);
}
if (!sw.includes(`const CACHE='sharawla-pos-v${packageVersion}';`)) throw new Error('sw.js cache name is not synchronized.');
if (/serviceWorker\.register\('\.\/sw\.js\?v=/.test(app)) throw new Error('app.js still hardcodes a service-worker version.');
console.log(`Version check OK: ${packageVersion} (${expectedChannel})`);
