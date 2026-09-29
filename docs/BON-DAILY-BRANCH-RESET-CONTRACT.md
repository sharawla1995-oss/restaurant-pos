# Bon Daily Branch Reset Contract

Decision: BRANCH Bon numbering is an operational daily sequence, not an invoice sequence.

- SHIFT mode: starts from 1 for each shift.
- BRANCH mode: one shared sequence per branch per business date; a new business date starts again at 1.
- Invoice numbering is unchanged and never reset by this contract.
- The business date is server-derived using the branch Bon-day timezone. The source default is Africa/Cairo until a branch-specific timezone is configured.
- BRANCH reservations carry their frozen business_date. A reservation from one business date must never become capacity for a different business date.
- Activation remains blocked until the Native/transport layer carries and enforces the frozen business_date and Trusted Device acquisition is authorized.

SOURCE + CI ONLY. Deployment 0.
