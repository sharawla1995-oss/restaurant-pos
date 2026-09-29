# Offline Bon Atomic Local Allocation

Status: SOURCE FIX / DEPLOYMENT 0

The previous renderer flow previewed the next reserved Bon before the Native commit. Two concurrent sales could preview the same free number.

The Native store now owns selection and consumption inside the same serialized `BEGIN IMMEDIATE` transaction that writes the Outbox event. The renderer supplies only scope hints. If no eligible capacity exists, no reservation evidence is attached and the existing OFF-* fallback remains.

This closes same-device concurrent preview reuse without changing server allocation authority or enabling Trusted Device acquisition.
