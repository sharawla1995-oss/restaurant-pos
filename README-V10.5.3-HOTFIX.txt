Sharawla POS V10.5.3 — Runtime Core Load Hotfix

Purpose:
Fix the V10.5.2 screen:
"تعذر تحميل Sharawla Runtime Core. أعد تشغيل البرنامج."

Cause handled by this hotfix:
The renderer can load the new app.js while the nested core/ or engines/ files are absent
from the uploaded repository/release package. V10.5.3 places both runtime files at the
project root and loads them from there.

Upload ALL files in this ZIP to the ROOT of the same Sharawla POS repository:
- sharawla-runtime-core.js
- restaurant-engine.js
- index.html
- package.json
- version.json
- sw.js

Do NOT delete existing data folders or reinstall licensing.
Do NOT enter a new License Key.
No SQL or Admin changes are required.
Create a new release/version 10.5.3 so devices already on 10.5.2 can update forward.
