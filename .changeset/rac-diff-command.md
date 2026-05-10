---
"@raniejade/rac": minor
---

Add `rac diff` command that shows content-level unified diffs for files
`install` would create, update, or delete, plus a drift section flagging
managed files that have been hand-edited since the last install.
`install --dry-run` is rerouted through the same renderer; pass
`--summary` for the legacy path/count output.
