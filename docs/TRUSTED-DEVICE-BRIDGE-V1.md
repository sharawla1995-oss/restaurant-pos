# Sharawla — Trusted Device Bridge V1

Status: SOURCE CONTRACT / SECURITY SIMULATION
Runtime activation: BLOCKED
Deployment: 0

## Boundary
This repository currently has no established server-only bridge runtime. This contract MUST NOT be represented as a deployed Edge Function or live service.

The bridge is a server-only component between the Restaurant backend and Sharawla Cloud. Credentials that can consume Cloud assertions or mint Restaurant trusted contexts MUST NOT be available to renderer, preload, localStorage, SQLite, normal request JSON, or authenticated POS client roles.

## Exact transaction
1. POS native/main process obtains an opaque short-lived assertion from Sharawla Cloud after Cloud verifies canonical device_id + device_fingerprint and derives business_id.
2. POS sends the opaque assertion token to the Restaurant bridge together with its normal authenticated employee session context. It does not send assertion fields as proof.
3. Bridge consumes the opaque assertion using server-only Cloud authority. Unknown, expired, replayed or wrong-purpose tokens fail closed.
4. Cloud returns the canonical tuple: business_id + device_id + canonical device_fingerprint + assertion_id.
5. Bridge verifies the returned business belongs to the Restaurant backend it is serving. Wrong-business assertions fail closed.
6. Bridge registers a short-lived Restaurant trusted-device context using server-only authority. POS clients cannot call the mint function.
7. Bridge returns only the opaque Restaurant context_id to the POS.
8. Bon V3 uses context_id to derive canonical device_fingerprint server-side. Employee branch authorization remains independently enforced by the existing Restaurant auth path.

## Failure semantics
Bridge unavailable, Cloud unavailable, assertion issue failure, consume failure, context registration failure, expiry, replay, wrong business, wrong device ownership or wrong purpose MUST NOT authorize official Offline Bon capacity.

These failures MUST NOT block ordinary sales. The existing no-capacity behavior remains: sale continues with OFF-* pending identity and syncs through the normal idempotent Offline path.

## Replay / scope
A Cloud assertion is short-lived and consumed once. cloud_assertion_id is unique in Restaurant contexts. A context expires no later than the assertion window. The context is only for restaurant_bon_device_verification and is not a general authentication token.

## Activation prerequisites
Runtime remains BLOCKED until all are true:
- an actual server-only bridge runtime is selected and reviewed;
- its Cloud and Restaurant credentials are unavailable to POS client code;
- valid assertion resolves exact canonical tuple;
- forged/unknown assertion rejected;
- expired assertion rejected;
- replay rejected;
- wrong business rejected;
- wrong purpose rejected;
- POS cannot mint Restaurant trusted context;
- Bon V3 receives only opaque context_id for device proof;
- employee/branch authorization remains independent;
- bridge outage preserves OFF-* sales;
- end-to-end tests pass against isolated Beta infrastructure.

No Production, SH-0007, Supabase deployment, Activation, licensing, fingerprint or Business Connection change is authorized by this contract.
