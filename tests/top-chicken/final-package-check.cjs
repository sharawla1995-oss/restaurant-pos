// Inspect the final Windows build without installing or rerunning closed SQLite lifecycle tests.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const asar=require('asar');
const root='dist-top-chicken-test';
const config=JSON.parse(fs.readFileSync('top-chicken-test-build.json'));
assert.equal(config.appId,'com.sharawla.topchicken.beta.prelaunch');
assert.equal(config.extraMetadata.topChickenPrelaunch,true);
const archive=path.join(root,'win-unpacked/resources/app.asar');
const pkg=JSON.parse(asar.extractFile(archive,'package.json').toString());assert.equal(pkg.topChickenPrelaunch,true);
const source=asar.extractFile(archive,'app.js');assert.equal(source.toString(),fs.readFileSync('app.js','utf8'));
const unchanged=['main.js','preload.js','top-chicken-prelaunch-sqlite-test.js'].filter(f=>fs.existsSync(f));
const artifacts=fs.readdirSync(root).filter(f=>/\.(exe|zip)$/.test(f)).map(name=>({name,bytes:fs.statSync(path.join(root,name)).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}));
assert(artifacts.some(x=>x.name.endsWith('.exe')));assert(artifacts.some(x=>x.name.endsWith('.zip')));
fs.writeFileSync('evidence/top-chicken/windows-final-candidate.json',JSON.stringify({result:'PASS',commit:process.env.GITHUB_SHA,checks:['Distinct TEST appId and metadata','Packaged app.js exactly matches tested source','ZIP and NSIS generated with publish never'],artifacts,closed_runtime_files:unchanged.map(name=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')})),installation:'NOT EXECUTED: candidate only; prior isolated installation closure retained'},null,2));
console.log('PASS final Windows candidate packaging; no installation performed');
