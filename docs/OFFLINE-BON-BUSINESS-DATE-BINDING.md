# Offline Bon Business Date Binding

BRANCH Bon capacity is bound to the server-issued business_date.

Native store V2.5 persists business_date on BRANCH reservations, requires it in reservation evidence, selects capacity only from the matching business_date, mirrors it into the durable local order, and restores it during idempotent replay.

The server V2 consumption path rejects a BRANCH reservation whose business_date is not the current server-derived branch Bon business date.

If Offline checkout has no valid current business_date/capacity, it does not guess an official Bon and falls back to OFF-*.

Invoice numbering is unchanged. SOURCE + CI ONLY; deployment 0.
