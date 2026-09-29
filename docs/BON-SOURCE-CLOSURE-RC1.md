# Bon Source Closure — RC1

**Source status: CLOSED, subject to CI.**
**Runtime activation/deployment status: BLOCKED / 0.**

Closed source contract:
- Invoice numbering is unchanged.
- Bon mode is configurable as SHIFT or BRANCH.
- SHIFT numbering remains per shift.
- BRANCH numbering is shared by the branch for one business date and restarts at 1 on the next business date.
- Online numbering remains server-authoritative.
- Offline official Bon capacity is pre-reserved and bound to branch, device, numbering scope and (for BRANCH) business_date.
- Native V2.5 selection, consumption, durable order evidence and replay carry the frozen business date.
- Previous-day BRANCH capacity is rejected; no valid capacity means OFF-* rather than guessed official numbering.
- Direct V2/V3 consumption bypasses remain closed.
- The final sale owner persists the frozen Bon number, scope and business date atomically with the sale.

Not part of Source Closure:
- No SQL has been deployed.
- No SH-0007 runtime/data has been changed.
- Production SH-0005/SH-0006 remain untouched.
- Official Offline Bon activation remains blocked by Trusted Device acquisition/possession proof. That security boundary is a separate activation prerequisite and must not be weakened to close this source track.

Next phase after green CI: leave Bon source closed and work the Trusted Device activation design separately, then Beta acceptance only with explicit authorization.
