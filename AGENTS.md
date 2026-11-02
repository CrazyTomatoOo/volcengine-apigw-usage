# AGENTS.md — volcengine-apigw-usage

A magpie plugin that queries Volcengine API Gateway usage (token consumption, request counts) per account, surfaced through the magpie `provider` + `auth.usage` hooks.

See `README.md` for install, configuration, and the underlying BlueRegionUsage query model.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, label = role name (`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
