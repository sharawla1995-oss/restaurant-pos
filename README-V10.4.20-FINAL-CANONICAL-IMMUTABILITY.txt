Sharawla POS V10.4.20 FINAL - Canonical Fingerprint Safety

- If license state already contains device_fingerprint, that exact value is the only device identity used.
- No MachineGuid/fallback retry is allowed after a canonical fingerprint has been pinned.
- Legacy migration runs only when device_fingerprint is absent. It keeps the existing device_id, tries historical fingerprint candidates, and permanently pins the first one accepted by Sharawla Cloud.
- Business Connection requires and uses the pinned canonical fingerprint for online Cloud requests.
- No automatic Reset/Rebind flow is included.
- Website order details are shown before accept/reject.
- Developer contact remains available.
- package.json and version.json are unified at 10.4.20.
