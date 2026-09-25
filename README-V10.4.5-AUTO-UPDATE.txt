Top Burger POS V10.4.5 — GitHub Auto Update

What changed
- Windows app checks GitHub Releases automatically after startup and every 6 hours.
- When a newer version exists, the app offers to download it.
- The installer is downloaded from the public GitHub Release and launched silently (/S).
- Local SQLite data and backups are not replaced by the installer.
- V10.4.4 direct-printing changes remain included.

How releases are created
- .github/workflows/build-windows-release.yml runs on pushes to the default branch.
- It reads package.json version. If release tag v<version> already exists, it skips.
- If not, it stamps update-config.json with the current repository owner/name, builds the Windows x64 installer, and creates a GitHub Release with the EXE asset.
- This means no repository URL is hard-coded in the source. The workflow knows the repository automatically.

Important
- V10.4.5 must be installed once on each Windows POS PC. After that, future versions can be delivered through GitHub Releases.
- Do not run npm audit fix blindly; Win7 compatibility remains Electron 22.3.27 / electron-builder 22.10.5.
