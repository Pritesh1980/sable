# Backlog

The backlog lives in [GitHub Issues](https://github.com/Pritesh1980/sable/issues)
(label: `backlog`; deployment-blocked items also carry `deployment`; items another agent
is actively working on carry `in-progress` — skip those). Agents looking
for more work should inspect the open `backlog` issues first:

```bash
gh issue list --repo Pritesh1980/sable --state open --label backlog
```

Open issues (as of 2026-09-24):

- [#5 AWS backend adapter (Cognito + API store + S3 blobs)](https://github.com/Pritesh1980/sable/issues/5)
- [#6 Deploy to S3 + CloudFront](https://github.com/Pritesh1980/sable/issues/6)
- [#104 Accessibility findings from SonarQube Cloud](https://github.com/Pritesh1980/sable/issues/104)
- [#88 Upgrade demo images to agy-generated ones](https://github.com/Pritesh1980/sable/issues/88) — **in progress (Codex)**, leave it alone

This list goes stale; the issue tracker is the source of truth.

Capture new items as issues (the GitHub mobile app works well for this); keep this
file as a pointer only.
