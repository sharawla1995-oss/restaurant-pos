V9.4.0 - Numbering + Payments + Discount + Tax + Service

- Invoice number: internal, continuous independently per branch.
- Bon number: starts at 1 for each shift and is the number shown to customer/prep.
- Dynamic payment methods per branch, default method, and mixed payments.
- Branch discount controls + separate discount permission.
- Tax and service settings per branch.
- Customer/prep receipts use bon number, while Orders admin shows invoice + bon.
- Website order acceptance requires an open shift so it receives a bon number.

Run supabase-v9-4-0-numbering-payments-finance.sql before using V9.4.0.
