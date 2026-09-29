# Trusted Device Acquisition Boundary

Status: SOURCE SECURITY GATE / ACTIVATION BLOCKED / DEPLOYMENT 0

Current application evidence shows that device verification sends device id, canonical fingerprint, and application version. Application version is not a device possession credential. Therefore the canonical device pair remains identity data, not sufficient possession proof by itself.

Official Offline Bon capacity acquisition and renewal must remain disabled until a separately reviewed device-bound possession mechanism exists. The existing Cloud assertion, server bridge, Restaurant trusted context, and Bon V3 code remain downstream source components only.

Do not make the Cloud assertion issuer available to normal POS client roles. Do not add a native acquisition path that merely forwards the canonical device pair and labels the result trusted.

A future root-of-trust design must cover enrollment, protected native storage, rotation, revocation and rebind without exposing private proof material to renderer code or normal request payloads. That design touches the protected Activation boundary and is not implemented here.

Until then ordinary local-first sales remain available with the existing OFF-* fallback. No Production, SH-0007, Cloud database or Restaurant database deployment is authorized.
