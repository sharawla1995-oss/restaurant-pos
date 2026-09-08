const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

const pkg = readJson('package.json');
const versionFile = readJson('version.json');

const packageVersion = String(pkg.version || '').trim();
const appVersion = String(versionFile.version || '').trim();

if (!packageVersion) {
  console.error('ERROR: package.json has no version.');
  process.exit(1);
}

if (!appVersion) {
  console.error('ERROR: version.json has no version.');
  process.exit(1);
}

if (packageVersion !== appVersion) {
  console.error(
    `ERROR: Version mismatch: package.json=${packageVersion}, version.json=${appVersion}`
  );
  process.exit(1);
}

console.log(`Version check OK: ${packageVersion}`);
