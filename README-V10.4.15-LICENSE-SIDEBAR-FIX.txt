Sharawla POS V10.4.15 SAFE

- License activation is now persisted in a dedicated local file in Electron userData, with migration from the legacy local DB state.
- Temporarily stopping a device or license never clears the local activation.
- Re-enabling the device allows verification again without re-entering the key.
- Only the explicit "change license" action clears local activation.
- Added a fixed sidebar restore button so the right navigation can always be reopened after it is hidden.
- Top Burger sales, shifts, printing, offline queue, backups, reports, delivery and website order logic were not intentionally changed.
