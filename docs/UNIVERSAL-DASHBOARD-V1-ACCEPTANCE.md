# Sharawla Universal Dashboard V1 — Acceptance

## Automated coverage

Run:

```bash
npm run check:universal-dashboard
npm run check
```

The targeted suite covers:

- all seven active profiles and forbidden cross-profile widgets;
- profile widget resolution;
- capability and permission fail-closed filtering;
- proof that unauthorized financial datasets are absent from the read plan;
- exact Central Warehouse action permission;
- branch selection and all-branch authorization;
- today/yesterday/week/month/custom date boundaries;
- Cloud/local ACK deduplication and cross-field collision prevention;
- sale + return + discount formulas;
- cancelled and uncollected website orders;
- payment-method totals after return payments;
- multi-branch aggregation;
- empty versus unavailable state;
- loading, error, no-permission, and unavailable states;
- offline labeling/availability decisions;
- stale request generation protection;
- independent resource/widget failure;
- read-only source and script load order.

## Manual acceptance matrix

| Scenario | Expected result |
|---|---|
| completed sale then return | gross remains the eligible sale; return is separate; net decreases by return total |
| discounted sale | discount card uses stored order discount; gross uses authoritative order total |
| expense | expense remains separate; no “profit” label is introduced |
| cash/wallet/InstaPay/mixed | detailed payments are used; fallback only for orders without detail rows; return payments subtract by method |
| two branches with report access | selector exposes permitted branches and all-branch; aggregation groups each canonical order once |
| branch-limited employee | inaccessible branches never appear in selector or query |
| two cashiers | employee widget groups eligible totals and counts by `employee_id` |
| offline sale before sync | current-branch local badge is shown and local projection contributes once |
| ACK/replay after sync | local/server identity collapses; Cloud row wins; no duplicate total |
| cancelled order | excluded from collected sales and counted separately in engine output |
| date boundary | device-local start/end are converted to ISO and sent to sources |
| custom range | invalid reverse range fails; no prior response may overwrite the new result |
| no-data range | empty state/real zeros only after successful reads |
| returns source failure | net sales does not render as a plausible value |
| inventory source failure | inventory widget fails independently; sales widgets remain |
| offline all-branch attempt | forced back to current branch |
| restaurant delivery disabled | delivery-dependent restaurant widget is absent unless another restaurant operational capability applies |
| pharmacy | expiry/batch widget can appear; profit/COGS remains absent |
| Central Warehouse | no request before successful `inventory.supply.view` check |

## Performance acceptance

- No polling or MutationObserver is introduced.
- A filter change aborts the previous request and advances a stale-response generation token.
- Resource reads stop at 5,000 rows.
- Detail widgets stop above 300 parent documents rather than fan out indefinitely.
- Short-lived exact-query caching avoids immediate duplicate reads.
- Secondary resources use settled isolation.

## Source-only safety acceptance

- Production writes: 0.
- SH-0007 writes: 0.
- Supabase SQL executions/deployments: 0.
- Offline architecture changes: 0.
- Point 4 accepted contract changes: 0.
- Bon numbering changes: 0.
- Deployment/merge: not performed.

## Known limitations accepted for V1

- Client-side bounded aggregation is appropriate for normal summary ranges, not unlimited historical analytics.
- No previous-period comparison until timezone authority is defined.
- No profit/COGS or universal inventory valuation.
- No kitchen/delivery SLA without an authoritative event/timing contract.
- No lowest-seller metric without a complete sellable-catalog availability join.
- Large-detail periods require a future reviewed server read model; no SQL artifact is deployed or included as executable migration in V1.
