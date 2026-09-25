Sharawla POS V10.4.16 — Dual Windows Architecture Build

This package keeps application version 10.4.16 and all POS business behavior unchanged.
Build/release changes only:
- GitHub Actions builds Windows x64 and ia32 (32-bit) NSIS installers.
- Installer names include architecture: x64 / ia32.
- Existing v10.4.16 release is updated with both installers using gh release upload --clobber.
- Auto updater selects the installer matching the running app architecture.
- x64 updater keeps backward compatibility with older generic EXE release assets.
- ia32 updater will never intentionally fall back to an unlabelled x64 installer.

Expected artifacts:
Sharawla-POS-Setup-10.4.16-x64.exe
Sharawla-POS-Setup-10.4.16-ia32.exe
