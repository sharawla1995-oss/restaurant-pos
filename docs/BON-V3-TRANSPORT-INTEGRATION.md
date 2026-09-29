# Bon V3 Transport Integration Boundary

Status: SOURCE INTEGRATION / ACQUISITION DORMANT
Deployment: 0

The renderer transport may consume only an opaque `verified_device_context_id` and expiry from `topBurgerDesktop.trustedDevice.bonContext()`.

The native API is intentionally not exposed yet because current `main.js` has no established server-network client for the Trusted Device flow. Implementing one by reusing renderer license/bootstrap credentials would cross the Activation / Business Connection boundary.

When no native trusted context API exists, throws, returns malformed data, or returns an expired context, `trustedBonContext()` returns null. Existing local-first sales and OFF-* fallback remain available. No caller-supplied fingerprint becomes proof.

Future server replay of an official reserved Bon must route through Bon V3 using the opaque context id; Bon V2 remains historical/source dependency and must not be presented as trusted-device complete.

This commit does not activate acquisition, deploy Edge Functions, or change Production/SH-0007.
