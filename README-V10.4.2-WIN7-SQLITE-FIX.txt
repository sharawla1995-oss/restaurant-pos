Top Burger POS Windows V10.4.2 - Windows 7 x64 SQLite Fix

This build removes the native better-sqlite3 dependency that failed to install on Windows 7 / Node 12.
It uses sql.js (SQLite compiled to WebAssembly) and still persists a real SQLite database file locally.

Windows 7 x64 test environment:
- Node.js 12.22.12 portable
- Electron 22.3.27

Install from the project folder:
  npm install
Then run:
  npm start

No new Supabase SQL is required after V10.3.
