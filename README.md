# airc

Install `.airc` agent/skill/MCP definitions into Claude, Codex, and OpenCode config surfaces.

## Requirements

- Node.js `>=20`
- npm

## Quick start

```bash
npm install
npm run build

# initialize project-local source tree
node dist/cli.js init --scope project

# validate definitions
node dist/cli.js doctor --scope project

# preview install changes
node dist/cli.js install --scope project --dry-run

# apply install
node dist/cli.js install --scope project
```

## Source layout

- `.airc/agents/`: agent definitions
- `.airc/skills/`: skills and skill assets
- `.airc/mcps/`: MCP server definitions
- `src/`: CLI, parsers, install engine, target adapters

## Targets and outputs

`airc install` supports `--target claude,codex,opencode` and `--kind agent,skill,mcp`.

Project scope writes into the current repo. User scope writes into `$HOME`.

- Claude
- agents: `.claude/agents/*.md`
- skills: `.claude/skills/<id>/...`
- mcp: `.mcp.json` (project) or `.claude.json` (user)

- Codex
- agents: `.codex/agents/*.{toml|md}`
- skills: `.agents/skills/<id>/...`
- mcp: `.codex/config.toml`

- OpenCode
- agents: `.opencode/agents/*.md`
- skills: `.opencode/skills/<id>/...`
- mcp: `.opencode/opencode.json`

Install ownership is tracked in:

- project: `.airc/.install-manifest.json`
- user: `$HOME/.airc/.install-manifest.json`

## Safety flags

- `--dry-run`: show create/update/delete plan only
- `--clean`: delete stale files tracked by manifest for selected kind/target
- `--force`: allow overwriting unmanaged files

Without `--force`, install refuses to overwrite unmanaged files (JSON targets are always protected unless manifest-owned).
