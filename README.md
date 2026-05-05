# airc

Install `.airc` agent/skill/MCP definitions into Claude, Codex, and OpenCode config surfaces.

## Run with npx

```bash
npx airc@latest init --scope project
npx airc@latest doctor --scope project
npx airc@latest install --scope project --dry-run
npx airc@latest install --scope project
```

`airc install` supports:

- `--target claude,codex,opencode`
- `--kind agent,skill,mcp`
- `--scope project|user`
