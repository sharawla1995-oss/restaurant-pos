# Sharawla — Trusted Device Assertion V1

Status: DESIGN / SOURCE GATE ONLY
Runtime activation: BLOCKED
Deployment: 0

## Purpose
Bon Reservation requires the Restaurant backend to know which canonical device is calling. A request-supplied device_fingerprint is identity data, not proof of device identity.

## Existing authority
Sharawla Cloud remains the canonical device registry. It already derives business ownership from the immutable device_id + canonical device_fingerprint pair. Restaurant auth independently proves the employee/user and branch access. Neither authority may be substituted for the other.

## V1 boundary
Do not change Activation, verify_sharawla_device, get_sharawla_business_connection, license_hash, automatic rebind policy, or canonical fingerprint generation.

Do not copy the Cloud devices registry into each Restaurant database as a second writable authority.
Do not embed a new long-lived shared secret in renderer JavaScript, localStorage, SQLite, preload-exposed values, or request JSON.
Do not treat a fingerprint hash as a secret; a hash is still replayable identity material.
Do not activate Bon acquisition/renewal until the assertion verifier exists.

## Assertion flow
1. The native/main-process bootstrap reads the existing canonical device_id + device_fingerprint from the protected license state after normal license verification.
2. While Online, it asks Sharawla Cloud for a short-lived opaque device assertion.
3. Cloud verifies the canonical device record and derives business_id itself. The POS does not choose business_id.
4. The assertion is high-entropy, short-lived, single-purpose and bound server-side to device_id, canonical fingerprint, business_id, issued_at, expires_at and a unique assertion id.
5. The POS presents only the opaque assertion to a trusted Restaurant verification bridge. It MUST NOT present assertion fields as self-asserted proof.
6. The trusted bridge validates/consumes the assertion against Cloud authority and establishes the verified tuple for the Restaurant request: business_id + device_id + canonical device_fingerprint.
7. Bon allocation/consumption/close compare reservation ownership against that verified tuple, not against a caller-supplied fingerprint alone.

## Replay and expiry
- Assertions expire quickly and are purpose-bound to Restaurant device verification.
- Consumption is one-time or otherwise replay-protected by assertion id and server state.
- Expired, unknown, already-consumed, wrong-business or wrong-purpose assertions fail closed.
- Offline mode never creates or refreshes an assertion.
- Losing assertion connectivity never blocks ordinary OFF-* sales; it only prevents obtaining/renewing official Bon capacity.

## Service boundary
The current repository contains no established Restaurant-to-Sharawla-Cloud trusted verification channel and no established server-side HMAC/JWT secret-management pattern. Therefore V1 implementation MUST NOT invent a client-held shared secret or claim that SQL alone verifies Cloud authority.

The implementation phase requires an explicit trusted service bridge (for example a server-side Edge Function/service with credentials unavailable to the POS renderer) or an equivalent independently verifiable server mechanism. Its credentials and verification logic remain server-side.

## Activation gate
Bon Reservation acquisition/renewal remains dormant until executable evidence proves:
- forged opaque assertion rejected;
- expired assertion rejected;
- replay rejected;
- assertion for another business/device rejected;
- valid assertion resolves the exact Cloud canonical device tuple;
- Restaurant employee branch authorization is still independently enforced;
- no secret is exposed to renderer/preload/local operational payloads;
- OFF-* fallback remains available when assertion service is unavailable.

This contract authorizes no deployment and no change to Production, SH-0007, Supabase, Activation or licensing.
