Sharawla POS V10.4.21 — SUPPORT CODE + SIDEBAR SCROLL SAFE
==========================================================

BASELINE
--------
Source of Truth: the user-provided stable Sharawla POS V10.4.20 ZIP.
V10.4.20 remains the rollback baseline.

CHANGES IN V10.4.21 ONLY
------------------------
1) Login Support Code
   - Shows the permanent device Support Code on the Login screen.
   - Reads it through a NEW additive Cloud RPC:
       get_sharawla_device_support_code(uuid,text)
   - Identity used is exactly:
       existing device_id + pinned Canonical Fingerprint
   - The Support Code is cached in the local license state after the first
     successful read so it can still be displayed later while offline.
   - Failure to read Support Code NEVER blocks POS startup.

2) Right Sidebar Vertical Scroll
   - Touch swipe works on mobile/tablet.
   - Mouse wheel / touchpad works on Windows desktop.
   - Header / X remain fixed.
   - Only navigation items scroll.
   - Scroll chaining to the page behind is contained.

NOT CHANGED
-----------
- Device ID
- Canonical Fingerprint rules / legacy migration
- Automatic Rebind (still NOT present)
- activate_sharawla_device contract
- verify_sharawla_device contract
- get_sharawla_business_connection contract
- license_hash verification model
- Activation flow
- Offline Grace behavior
- Direct Printing
- Website Order review flow
- Auto Update logic
- Windows 7 / x64 / ia32 build targets

INSTALL ORDER
-------------
1) Keep V10.4.20 installed/available as rollback.
2) Run SHARAWLA-CLOUD-V10.4.21-SUPPORT-CODE-READ-SAFE.sql in Sharawla Cloud.
3) Confirm all final SQL verification booleans are TRUE.
4) Build/deploy V10.4.21.
5) Regression-test before calling V10.4.21 Stable.

REQUIRED REGRESSION
-------------------
[ ] package.json = 10.4.21
[ ] version.json = 10.4.21
[ ] npm run check passes
[ ] Existing device starts without new activation
[ ] Canonical Fingerprint remains identical
[ ] Device ID remains identical
[ ] Support Code is correct (e.g. SH-0005 / SH-0006)
[ ] Support Code remains visible on Login after restart
[ ] Offline Login still works inside current Offline Grace
[ ] Sidebar scrolls by touch on phone/tablet
[ ] Sidebar scrolls by mouse wheel/touchpad on Windows
[ ] X/header do not scroll away with menu items
[ ] Direct Printing still works
[ ] Website Order Details still appear before Accept/Reject
[ ] Auto Update behavior unchanged
[ ] x64 build succeeds
[ ] ia32 build succeeds

Do not begin Multi-Industry changes until this baseline passes regression.
