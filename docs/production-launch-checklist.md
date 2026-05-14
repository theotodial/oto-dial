# Production launch checklist (manual)

Use this after `npm run production:verify` passes in staging, before promoting the same artifact to production traffic.

## Preconditions

1. `DEPLOYMENT_MODE` set appropriately (`staging`, `production`, or `safe` for conservative caps and extra telemetry persistence).
2. `REDIS_URL` set for distributed webhook dedup and worker heartbeats (recommended for multi-worker PM2).
3. Stripe live keys and webhook signing secret match the live endpoint URL.
4. Telnyx voice + messaging webhooks point at the deployment `BACKEND_URL` routes you verified in Mission Control.

## Billing and credits

1. **Subscribe a test user** on a real plan and confirm the subscription row and invoice land in Mongo.
2. **Verify Stripe grant**: confirm a `subscription_credit_grant` (or equivalent) appears on the user’s credit ledger and remaining credits increase as expected.
3. **Place an outbound call** from the test user; confirm call document creation and Telnyx leg progression without duplicate POST /api/calls.
4. **Verify reservation**: while ringing/answered, confirm user `reservedCredits` and call `creditReservationHeld` align with expectations for the plan’s reservation multiplier.
5. **Verify interval billing**: during an answered session, confirm periodic `connected_duration_charge` ledger rows and matching journal events without duplicate interval indices on the economic timeline.
6. **Verify release**: on hangup, confirm reservation release timestamps and that `creditReservationHeld` returns to zero for terminal states.
7. **Verify projected balance**: attempt a second concurrent outbound where projected liquidity should block; confirm HTTP 403 with `INSUFFICIENT_PROJECTED_CREDITS` (or plan-specific guard) and no silent failure.
8. **Verify journal replay**: use admin chaos/replay tooling on the call id after completion; confirm no replay divergence snapshots for that call under normal operation.

## Admin and observability

9. **Admin dashboards**: open `/adminbobby/launch-health` and `/adminbobby/system-health`; confirm Mongo/Redis/Stripe/Telnyx/agent pills match reality.
10. **Duplicate webhooks**: replay the same Telnyx `event_id` in a controlled test; confirm the second delivery is deduped and duplicate telemetry is visible when safe mode or pressure allows persistence.
11. **Recovery after worker restart**: restart a single PM2 worker during a synthetic answered call in staging; confirm economic recovery pass resumes interval billing without double-charging (interval indices remain deduped).
12. **WebSocket convergence**: with browser connected, confirm call state updates after hangup and that stale heartbeat paths eventually fail the call server-side if the client disappears.

## Rollback

- Revert to the previous release tag or container image; keep Mongo/Stripe/Telnyx webhooks unchanged unless the incident was webhook routing.
- If ledger anomalies appear, stop outbound traffic (`DEPLOYMENT_MODE=safe` or feature flags), preserve raw webhooks and journals, and use existing forensic routes before any manual ledger edits.

## Sign-off

Record verifier name, time (UTC), environment, and `npm run production:verify` exit code in your change ticket.
