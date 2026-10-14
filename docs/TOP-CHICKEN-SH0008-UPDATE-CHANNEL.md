# Top Chicken — SH-0008-only update channel

Status: **bootstrap Windows installer candidate, not a live approved restaurant release**.

## Current problem and solution

The original installed 10.5.15 contains a generic `/releases/latest` updater and always sees Sharawla POS 10.5.18, regardless of which licensed restaurant runs it. There is **no server-side redirect that can retroactively change those shipped Electron bytes**. Publishing a Top Chicken build as the repo's latest normal stable release would expose it to Top Burger's SH-0005 and SH-0006 and is forbidden.

The **one-time manual** `Top-Chicken-SH0008-Primary-10.5.19-rc.2.exe` installer retains the same main Electron appId (`com.topburger.pos`) and data namespace (`sharawla-pos-windows`) as existing 10.5.15, and adds an isolated `top-chicken-sh0008` updater. The operator must install it on SH-0008 to stop seeing the generic 10.5.18 offer.

The new updater verifies **both** an exact active Central Cloud license and local canonical device fingerprint, with fixed business ID `5358328c-9724-49aa-affc-1bce8be90f92` and exact device ID `44162475-3ca2-4a2b-8bd5-aee1c7bb1c73`. It reads only the dedicated HTTPS GitHub raw manifest `top-chicken-updates/sh0008.json`, and never calls `/releases/latest` for that channel.

A future update becomes visible only when a **separately approved** Top Chicken prerelease is uploaded with a versioned Windows installer and actual SHA256, then the SH-0008 feed is updated with an explicit version, URL, and digest. The loader is fail-closed for foreign business/device, revoked license, missing installer/digest, malformed URL, unsupported architecture, or pending local transactions. It validates the file checksum after download and creates a local pre-update SQLite backup before launch.

The current feed intentionally offers **no upgrade** beyond the bootstrap version, so on SH-0008 the dialog should show `أنت على أحدث إصدار مخصص لتوب تشيكن` after the one-time manual installation. Future changes to the feed require independent validation and release approval.

## Scope and caveats

- Production latest stable release remains `v10.5.18` and no Top Chicken build has been uploaded there.
- No change to Top Burger Production, SH-0005/SH-0006/SH-0007, Central Cloud database, Beta SQL/Edge, or business entitlement grants.
- This change only fixes **release visibility/routing**. It does not activate the 30-feature commercial package (still draft) and does not make the website-to-POS hosted operations go live.
- Installing this EXE **manually on the wrong Sharawla device would still replace its installed application**, because it is an in-place installer. Do **not** copy or execute it on Top Burger. The internal automatic updater rejects all non-SH-0008 devices.
- This is a Windows **x64** candidate. End-to-end hosted orders and actual SH-0008 device installation have not been proven.
- Keep public website intake closed until separately approved operations end-to-end PASS.
