# Deploying Sable to S3 + CloudFront

**Contributor note, not part of the user guide.**

This covers **hosting only** (#6): a private S3 bucket behind CloudFront, serving
the built app. Accounts and sync are a separate concern handled by whatever
`VITE_BACKEND` selects — this stack knows nothing about them.

## Why this exists alongside GitHub Pages

The Pages deployment (`.github/workflows/deploy-pages.yml`) is the **public,
backend-free demo**, and it has to stay that way: `maybeSeedDemo()` returns early
unless `backend.kind === 'local'`, so a build that talks to a real backend cannot
also be the demo. The real app therefore needs a second origin.

It also needs one for a more practical reason. The curated reference images under
`public/images/artists/` are gitignored third-party work, so **CI has never seen
them** — a Pages build 404s on all 30 of them. A local `vite build` copies them
into `dist/` because they exist on the owner's Mac, which is why the deploy runs
from there rather than from Actions.

## What it costs

Nothing, in practice. There is deliberately **no hourly-billed resource** in the
stack — no NAT gateway, no load balancer, no always-on compute — so an idle month
is genuinely £0 and the only variables are storage and requests.

| | |
|---|---|
| S3 storage (~83MB build incl. images) | ~£0.002/month |
| CloudFront | Free plan: 1M requests + 100GB/month |
| Requests, invalidations | Well inside free allowances |

`terraform apply -var 'alert_email=…'` also creates an AWS Budget that alerts on
**forecast** as well as actual spend, so a warning arrives before a bill does.
The £1 threshold is a smoke alarm, not a ceiling — it should never fire.

## Prerequisites

A working `aws` CLI with credentials, and Terraform.

> **Do not install the AWS CLI with Homebrew on this Mac.** Use the official
> installer from AWS:
>
> ```
> curl -fsSL "https://awscliv2.amazonaws.com/AWSCLIV2.pkg" -o /tmp/AWSCLIV2.pkg
> sudo installer -pkg /tmp/AWSCLIV2.pkg -target /
> ```
>
> **Why.** This machine is Intel x86_64 (macOS 15.7.9) and **Homebrew has dropped
> Intel support** — there is no bottle, and a source build is refused outright:
> *"You are using macOS on Intel x86_64 … This build failure was expected, as this
> is not a Tier 1 configuration."* So `brew reinstall awscli` cannot fix anything;
> it exits 0 having built nothing.
>
> The symptom is a dynamic-loader failure, not a Python one:
> `ImportError: … Library not loaded: …/libaws-c-common.1.dylib`. Exactly one of
> `_awscrt`'s nine linked libraries is missing — `aws-c-common` upgraded its
> soname from `libaws-c-common.1.dylib` to `libaws-c-common.1.0.dylib`, and the
> compiled extension that links against the old name can no longer be rebuilt on
> this platform. A `libaws-c-common.1.dylib` symlink appears to fix it, but
> `_awscrt` was built against 0.14.5 while 1.0.1 is installed — a major-version
> ABI gap — so it may load and then misbehave. Not worth the risk for a tool that
> uploads files and creates infrastructure.
>
> The official package bundles its own copies of these libraries and is unaffected
> by any of it. Expect the same class of breakage from Homebrew for other
> compiled formulae on this machine.

Credentials are interactive, so set them up yourself rather than through an agent:

```
aws configure          # or: aws sso login --profile <name>
aws sts get-caller-identity
```

## One-time setup

```
cd infra
terraform init
terraform apply -var 'alert_email=you@example.com'
```

Creating the CloudFront distribution takes a few minutes. The apply prints:

```
app_url         = "https://d1234abcd5678.cloudfront.net"
bucket_name     = "sable-20260922...."
distribution_id = "E1234ABCD5678"
```

State is **local** (`infra/terraform.tfstate`, gitignored). That is fine for a
solo single-machine project, but the Mac is then the only record of what exists.
If it is lost, either `terraform import` the resources back or just delete them in
the console and re-apply — nothing here is precious.

## Deploying

```
npm run deploy:aws -- --dry-run   # print every command, upload nothing
npm run deploy:aws                # build, upload, invalidate
```

The script builds with base `/` (no `VITE_BASE` — that is a Pages-only concern),
then uploads in four passes, longest-lived cache first, so a half-finished deploy
never leaves the shell pointing at assets that do not exist yet:

1. `assets/*` — immutable, one year (safe only because Vite content-hashes them)
2. `images/`, `guide/`, `icons/` — one day
3. everything else — five minutes
4. `index.html` and `sw.js` — `no-cache`, last, then a CloudFront invalidation

**The service worker is the fragile part.** `dist/sw.js` changes every build (the
precache manifest is injected into it), but `CACHE_NAME` inside `public/sw.js` is
hand-bumped — so a browser only picks up a new worker when it sees *different
bytes* at `/sw.js`. If that file is ever cached at the edge, deploys silently stop
landing with nothing in the console to explain it. Three things guard against it:
a dedicated CachingDisabled behaviour in `infra/main.tf`, a `no-cache` header on
the object, and a per-deploy invalidation. The rules themselves live in
`src/deploy/cacheControl.js` and are unit-tested; `src/test/infraHosting.test.js`
guards the Terraform side.

## About the URL

The distribution uses the default `*.cloudfront.net` certificate, so the URL is
unguessable but **not private** — anyone given it can load the app, and anyone
with it can fetch the reference images directly. That was a deliberate call: the
images are unlisted rather than protected. If that ever stops being acceptable,
the options are CloudFront signed URLs/cookies, or moving those 30 static paths
into the backend's private blob storage, where the adapter already serves them as
short-lived signed URLs.

Adding a custom domain would need an ACM certificate in `us-east-1` — and would
make the URL guessable, so revisit the above first.

## Tearing it down

```
aws s3 rm s3://<bucket_name> --recursive
cd infra && terraform destroy
```

`force_destroy` is deliberately left off, so `terraform destroy` refuses while the
bucket still has objects in it. Emptying it is a separate, conscious step.
