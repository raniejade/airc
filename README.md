# airc

Install `.airc` agent/skill/MCP definitions into Claude, Codex, and OpenCode config surfaces.

## Run with npx

```bash
npx github:raniejade/airc init --scope project
npx github:raniejade/airc doctor --scope project
npx github:raniejade/airc install --scope project --dry-run
npx github:raniejade/airc install --scope project
```

`airc install` supports:

- `--target claude,codex,opencode`
- `--kind agent,skill,mcp`
- `--scope project|user`

Vendor overrides:

- `vendor.<target>.config` pass-through for `agent`, `skill`, and `mcp` target payloads
- `vendor.<target>.frontmatter` for skill markdown frontmatter (`claude`, `codex`, `opencode`)
- for skills, both maps are merged into target markdown frontmatter (`config` first, then `frontmatter`)
- collisions with generated keys fail fast
- for skills, if `vendor.<target>.config` and `vendor.<target>.frontmatter` set the same key, install fails fast
- `vendor.codex.emit = "instruction-only"` is incompatible with `vendor.codex.config`
