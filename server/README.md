# Sable Image Relay

Private, single-owner image refinement service. **Not activated or deployed.**
Read [the activation gates](../docs/RELAY-ACTIVATION.md) before any live operation.
Tests use fake providers, synthetic PNGs and newly created temporary directories.

## Local Verification

```sh
npm --prefix server ci
npm run test:relay
```

Requires Node `>=26.8.1 <27`; `node:sqlite` is release-candidate stability.
Pinned service dependencies are `jose` and `sharp`. No provider credential is needed
for tests. Never put the OpenAI key or relay environment in `VITE_*` variables.

## Approved Operation Only

`.env.example` lists the fail-closed settings. The process does not automatically
load `.env`; an approved operator must supply environment variables or use Node's
`--env-file=/absolute/private/env` option when invoking `src/main.js` from `server/`.
Keep the file outside public/build directories and readable only by the service.
Default binding is loopback; an approved TLS reverse proxy owns external ingress.
Run only one service/worker against its persistent SQLite database and spool.

Endpoints: `GET /v1/image-capabilities`; `POST/GET /v1/image-jobs`;
`GET/DELETE /v1/image-jobs/:id`; `GET .../:id/result`; `POST .../:id/ack`.
Every endpoint verifies the configured owner. Paid-disabled mode keeps recovery
endpoints available. Submissions are refine-only, fixed-profile multipart PNG input,
bounded to 8 MiB total and 30 seconds. Arbitrary URLs, model parameters and generation
operations are rejected.

Acceptance is durable and idempotent. SQLite reserves replay/quota before dispatch;
the spool commits normalized input and a digest-checked output manifest with fsync
barriers. Restart reconciliation can finish a durable result without another paid
call. An ambiguous dispatched attempt becomes `outcome_unknown`, never an automatic
retry. One active job and ten UTC-day admissions are enforced atomically.

Input and unacknowledged results expire after 24 hours; request tombstones remain
seven days. Ack/discard/expiry remove private bytes, with restart sweeps retrying
interrupted cleanup. Backups and the provider's own retention need separate policies.
Logs carry safe events only. Do not add body, token, raw provider-error or URL logging.

`SIGTERM` closes ingress and waits for the worker before closing SQLite. It cannot
guarantee cancellation of an already dispatched provider call. To disable payment
but retain recovery, stop and restart with `RELAY_PAID_ENABLED=false`; follow the
activation runbook's token and retention procedures.
