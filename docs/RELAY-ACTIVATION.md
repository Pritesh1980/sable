# Private Relay Activation

**Unactivated.** This is an approval checklist, not permission to provision, upgrade,
keep a service awake, deploy, or make a paid request. Browser proofs use fictional
auth and intercepted responses. No live paid call has been performed.

## Approval Gates

- [ ] Record the named host, account, region, operator, recurring cost and spending
  ceiling. Obtain separate approval for infrastructure and paid activation.
- [ ] Approve TLS, the exact private web origin and relay origin, and restricted
  ingress. Set `VITE_BACKEND=local`, `VITE_AUTH_BACKEND=supabase`, the exact
  `VITE_PRIVATE_OWNER_ID` and HTTPS `VITE_AI_RELAY_URL` for the private build.
  Public Pages builds retain local auth and an empty relay URL.
- [ ] Use a persistent private disk, restrictive service-account permissions and
  encrypted storage/backups. The data directory and spool contain private image
  and instruction bytes. Verify durability barriers and a restore procedure; do
  not deploy on ephemeral or shared writable storage. Approve backup retention
  separately: a filesystem backup can retain data beyond application cleanup.
- [ ] Approve Node `>=26.8.1 <27` and explicit production acceptance of
  [Node SQLite's release-candidate stability](https://nodejs.org/api/sqlite.html).
  Run the relay tests on the actual host/runtime before enabling payment.
- [ ] Configure ingress for **8 MiB** total request bodies and a **30-second**
  upload bound. Retain decoder/pixel limits and the fixed PNG output profile.
  Verify proxy limits, TLS, allowed origins and no credential-bearing redirects.
- [ ] Configure asymmetric Supabase signing, the exact issuer, audience, one
  `ES256` or `RS256` algorithm, fixed issuer-derived JWKS endpoint, and the owner's
  exact auth `sub`. No caller-provided keys/JWKS or email-based authorization.
  Disable public signups and anonymous sign-in. Verify the owner library gate,
  foreign-owner rejection and logout fencing on the private build.
- [ ] Configure **15-minute** access tokens and verify actual issued `iat`/`exp`
  with `exp - iat <= 900` seconds. Server enforcement is fail-closed. SDK refresh
  is used; Sable never stores a separate long-lived relay bearer token.
  [Supabase session guidance](https://supabase.com/docs/guides/auth/sessions)
  explains why sign-out is not instant invalidation of an issued access token.
- [ ] Decide how auth availability is maintained. On a pausing Free project,
  document manual project restoration and reauthentication. A non-pausing plan
  needs separate approval for its account and cost. Do not create keep-awake
  requests, cron jobs, automations, or an unapproved upgrade.
- [ ] Confirm provider account access, billing, the server-only OpenAI key and
  current model/profile/pricing. `gpt-image-2.5-sunburst` is the checked-in candidate,
  not proof of availability for this account. Approve one fixed `1024x1024`,
  medium-quality PNG result, spend controls and an operator alert procedure.
  App limits are one active job and ten admissions per UTC day, not a currency
  budget. Read [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
  and [privacy policy](https://openai.com/policies/privacy-policy/); do not promise
  zero retention or infer API coverage from a consumer subscription.
- [ ] Verify 24-hour input/result retention, early byte deletion after checked
  save/ack or discard, and seven-day request tombstones. Reconcile on restart;
  never retry a possibly dispatched provider attempt automatically. Check logs
  contain safe event codes, not tokens, prompts, image bytes or provider errors.
- [ ] Confirm `no-store` responses, private endpoint service-worker exclusion and
  no tokens/private results in caches, URLs or browser production assets.
- [ ] On the owner's real iPhone, test private installed PWA **Safari/home-screen**
  storage, denied/unavailable persistence, reload recovery and sign-out. Chromium
  phone emulation is not this check. Browser persistence is not an off-device backup.
- [ ] Download the full portable library backup, confirm the file was saved, close
  or clear the source context, import in a fresh browser context and verify the
  paid image plus lineage/provenance offline. External images remain references.
- [ ] Obtain explicit approval for **one live paid request** with the stated profile
  and budget. Check exact outgoing image/prompt, canonical bytes and record before
  ack, recovery after reload, and portable backup. Record its result before wider use.

## Disable And Recover

1. Stop the service to stop new submissions and undispatched jobs. Graceful shutdown
   waits for an in-flight attempt; stopping is not a promise to cancel work already
   dispatched to the provider or reverse a charge.
2. Optionally restart with `RELAY_PAID_ENABLED=false` to expose authenticated recovery,
   result, acknowledgement and discard endpoints without new paid dispatch. Keep
   owner verification, origin checks, private disk and cleanup intact.
3. Revoke refresh sessions as appropriate and wait out the access-token TTL.
   Existing JWTs can remain usable until expiry; JWKS rotation/caching is not an
   instant logout switch. Do not describe refresh revocation as cancellation of
   already dispatched work.
4. Recover verified results, export the full library, confirm the file, and then
   follow the approved retention/decommissioning procedure. Never delete the only
   service copy to work around a failed local save.

See [server operations](../server/README.md), [architecture](ARCHITECTURE.md) and
[the refinement guide](06-concepts.md#refine-an-image).
