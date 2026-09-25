Top Burger POS V10.4.4 — Printing Update

Changes:
- Windows direct/silent printing (no Windows Print dialog).
- Separate local printer selection for customer receipt and prep receipt per branch.
- Customer and prep auto-print still controlled by the existing branch toggles.
- Manual reprints are marked "نسخة" after the first successful print of that receipt type.
- Reprints are written to audit_logs when online.
- Prep receipt always shows item prices and item subtotal, without delivery/service fees.
- 80mm receipt layout is wider, clearer, and more compact to reduce paper length.
- Same shared app source remains usable by GitHub/PWA and Windows; direct printer routing is Windows-only.

Windows compatibility target remains Electron 22.3.27 / Windows 7 x64 through Windows 11 x64.
