'use strict';
const sqlite3=require('sqlite3');
const expected=String(process.argv[2]||'').trim();
if(!['x64','ia32'].includes(expected))throw new Error(`Expected architecture argument x64|ia32, got ${expected||'(empty)'}`);
if(process.arch!==expected)throw new Error(`Expected ${expected}, got ${process.arch}`);
const db=new sqlite3.Database(':memory:');
db.serialize(()=>{
  db.run('PRAGMA foreign_keys=ON');
  db.run('CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT NOT NULL)');
  db.run('BEGIN IMMEDIATE');
  db.run('INSERT INTO t(v) VALUES(?)',['ok']);
  db.run('COMMIT');
  db.get('SELECT COUNT(*) c FROM t',(err,row)=>{
    if(err)throw err;
    if(Number(row?.c)!==1)throw new Error('sqlite3 transaction probe failed');
    db.close(e=>{
      if(e)throw e;
      console.log(`sqlite3 native probe PASS on ${process.arch}`);
    });
  });
});
