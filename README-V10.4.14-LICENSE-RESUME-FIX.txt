Sharawla POS V10.4.14

SAFE licensing behavior fix on top of V10.4.13.

- Temporary device stop from Sharawla Admin keeps the local activation binding.
- When the device is enabled again, POS re-verifies automatically every 5 seconds while the activation screen is visible.
- No License Key re-entry is required after a temporary stop/resume.
- A manual "Enter new license key" action is available only when intentionally changing/deactivating the local binding.
- Top Burger operational data/workflows were not changed.
- Windows 7 / Electron 22.3.27 compatibility preserved.
