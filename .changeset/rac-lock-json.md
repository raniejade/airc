---
"@raniejade/rac": minor
---

Pin shared packs to resolved commit SHAs via `.rac/rac-lock.json`. The lockfile is committed alongside `config.toml`; future installs check out the locked SHA instead of re-resolving the floating `ref`. Two machines installing the same project now produce identical outputs, and CI can gate on lockfile drift.

- New flag `--frozen-lockfile` for `rac install`, `rac diff`, and `rac doctor`: errors (exit code 2) if the lockfile would change.
- Existing `--refresh-packs` now also re-resolves and rewrites the lockfile.
- `rac pack add` / `rac pack remove` keep the lockfile in sync.
- Pack overrides skip the lockfile entirely.
- `rac doctor` reports malformed lockfiles, stale entries, and (with `--frozen-lockfile`) missing entries.
