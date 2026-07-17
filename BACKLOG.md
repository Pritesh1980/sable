# Backlog

The backlog lives in [GitHub Issues](https://github.com/Pritesh1980/sable/issues)
(label: `backlog`; deployment-blocked items also carry `deployment`). Agents looking
for more work should inspect the open `backlog` issues first:

```bash
gh issue list --repo Pritesh1980/sable --state open --label backlog
```

Recent audit follow-ups:

- [#28 Harden auth transitions and per-user cache isolation](https://github.com/Pritesh1980/sable/issues/28)
- [#29 Refresh expired signed blob URLs](https://github.com/Pritesh1980/sable/issues/29)
- [#30 Make artist cards keyboard-accessible](https://github.com/Pritesh1980/sable/issues/30)
- [#31 Fix local-first sync dirty-state handling](https://github.com/Pritesh1980/sable/issues/31)
- [#32 Restore a clean lint run](https://github.com/Pritesh1980/sable/issues/32)

Long-running roadmap items:

- [#4 Provision Supabase](https://github.com/Pritesh1980/sable/issues/4)
- [#5 AWS backend adapter](https://github.com/Pritesh1980/sable/issues/5)
- [#6 Deploy to S3 + CloudFront](https://github.com/Pritesh1980/sable/issues/6)
- [#7 Read-only share link for the tattoo artist](https://github.com/Pritesh1980/sable/issues/7)

Capture new items as issues (the GitHub mobile app works well for this); keep this
file as a pointer only.
