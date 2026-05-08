# Install Scopes

`init`, `doctor`, and `install` accept `--scope project|user`. The default is `project`.

## Project Scope

Project scope reads source definitions from the current working directory:

```text
<cwd>/.rac/
```

It writes generated outputs under the same project:

```text
<cwd>/.claude/
<cwd>/.codex/
<cwd>/.agents/
<cwd>/.opencode/
<cwd>/.mcp.json
```

Use project scope when a repository should carry its own agent, skill, MCP, rule, or vendor-wide config definitions.

```bash
rac init
rac doctor
rac install --dry-run
rac install
```

## User Scope

User scope reads source definitions from:

```text
~/.rac/
```

It writes generated outputs to home/global vendor locations:

```text
~/.claude/
~/.codex/
~/.agents/
~/.claude.json
~/.claude/settings.json
$XDG_CONFIG_HOME/opencode/
```

If `XDG_CONFIG_HOME` is not set, RAC uses `~/.config`.

Use user scope when the generated config should apply globally across projects.

```bash
rac init --scope user
rac doctor --scope user
rac install --scope user --dry-run
rac install --scope user
```

## Dotfiles Workflow

For dotfiles, manage the `.rac` source tree directly and deploy it to `~/.rac`.

One common flow:

```bash
# In your dotfiles repo, commit/manage the source tree.
git add .rac

# Deploy or symlink that tree so RAC sees it at ~/.rac.
ln -sfn "$PWD/.rac" ~/.rac

# Validate global source definitions.
rac doctor --scope user

# Preview global generated outputs.
rac install --scope user --dry-run

# Apply global generated outputs.
rac install --scope user
```

`RAC_HOME` is not the normal dotfiles source pointer. In user scope, it replaces the home directory RAC uses for the source tree and for Claude/Codex/agents targets, so it is best reserved for testing and relocated sandboxes. OpenCode user outputs still use `XDG_CONFIG_HOME`.

## User-Scope Output Paths

The paths below are relative to the user target home unless noted.

### Claude

- Agents: `~/.claude/agents/<id>.md`
- Skills: `~/.claude/skills/<id>/SKILL.md` plus skill assets
- MCPs: `~/.claude.json`
- Rules and vendor-wide config: `~/.claude/settings.json`
- Install manifest: `~/.claude/.rac-install-manifest.json`

### Codex

- Agents: `~/.codex/agents/<id>.toml`
- Skills: `~/.agents/skills/<id>/SKILL.md` plus skill assets
- MCPs and vendor-wide config: `~/.codex/config.toml`
- Rules: `~/.codex/rules/<source-file-stem>.rules`
- Install manifests:
  - agents, MCPs, rules, and config: `~/.codex/.rac-install-manifest.json`
  - skills: `~/.agents/.rac-install-manifest.json`

### OpenCode

- Agents: `$XDG_CONFIG_HOME/opencode/agents/<id>.md`
- Skills: `$XDG_CONFIG_HOME/opencode/skills/<id>/SKILL.md` plus skill assets
- MCPs, rules, and vendor-wide config: `$XDG_CONFIG_HOME/opencode/opencode.jsonc`
- Install manifest: `$XDG_CONFIG_HOME/opencode/.rac-install-manifest.json`

With default XDG settings, replace `$XDG_CONFIG_HOME` with `~/.config`.

## Environment Overrides

- `RAC_HOME`: user-scope source and Claude/Codex/agents target home override. `rac init --scope user`, `rac doctor --scope user`, and `rac install --scope user` use `$RAC_HOME/.rac` as the source and `$RAC_HOME` as the Claude/Codex/agents target home.
- `XDG_CONFIG_HOME`: OpenCode user-scope target root. Defaults to `~/.config`.
