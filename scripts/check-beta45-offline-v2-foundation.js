'use strict';
const fs=require('fs');

function read(p){return fs.readFileSync(p,'utf8')}
function need(src,token,label=token){if(!src.includes(token))throw new Error(`Beta45 foundation missing: ${label}`)}

const src=read('beta45-offline-v2-foundation.js');
const html=read('index.html');
const pkg=JSON.parse(read('package.json'));

// Syntax gate.
new Function(src);

for(const token of [
  "const PROTOCOL_VERSION=2",
  "const SCHEMA_VERSION=2",
  "PENDING:'pending'",
  "SYNCING:'syncing'",
  "RETRYABLE:'retryable'",
  "BLOCKED:'blocked'",
  "CONFLICT:'conflict'",
  "DEAD_LETTER:'dead_letter'",
  "SYNCED:'synced'",
  "OUTBOX:'offlineV2:outbox'",
  "INBOX:'offlineV2:inbox'",
  "MAPPINGS:'offlineV2:mappings'",
  "SEQUENCE_PREFIX:'offlineV2:sequence:'",
  'device_sequence',
  'depends_on_tx_id',
  'protocol_version:PROTOCOL_VERSION',
  'schema_version:SCHEMA_VERSION',
  "migration_mode:'copy-verify'",
  'legacy_payload:clone(job)',
  'verifyMigrationCopy(legacy,reread)',
  'explicit server_ack',
  'server_event_id',
  'upsertMapping',
  'prepareLegacyMigration',
  'migrateLegacyQueue',
  'validateFoundation',
  'global.SharawlaOfflineV2=api'
])need(src,token);

// Migration must remain copy+verify and non-destructive in Phase 1.
need(src,"destructive:false");
need(src,"legacy_queue_preserved:true");
if(/odbSet\(\s*['\"]queue['\"]\s*,\s*\[\s*\]\s*\)/.test(src))throw new Error('Beta45 migration must not clear legacy queue');
if(src.includes('removeQueuedOperation('))throw new Error('Beta45 foundation must not delete legacy queue operations');

// Marker must be written only after verification.
const verifyAt=src.indexOf('const verification=verifyMigrationCopy(legacy,reread)');
const markerWriteAt=src.indexOf('await global.odbSet(KEYS.MIGRATION,marker)');
if(verifyAt<0||markerWriteAt<0||markerWriteAt<=verifyAt)throw new Error('Beta45 migration marker ordering invalid');

// Synced state requires ACK.
const ackGate=src.indexOf("nextStatus===STATUS.SYNCED&&!outbox[i].server_ack");
if(ackGate<0)throw new Error('Beta45 synced ACK gate missing');

// Foundation must load after Beta44 recovery so odbGet/odbSet are the recovered dual-write versions.
const b44=html.indexOf('beta44-offline-storage-recovery.js');
const v2=html.indexOf('beta45-offline-v2-foundation.js');
if(b44<0||v2<0||v2<=b44)throw new Error('Beta45 foundation must load after Beta44 storage recovery');

// NPM gate must include this acceptance script.
if(!String(pkg.scripts?.check||'').includes('check-beta45-offline-v2-foundation.js'))throw new Error('package.json check pipeline missing Beta45 foundation gate');

console.log('Beta45 Offline Engine V2 foundation gate PASS');
