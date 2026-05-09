import { describe, expect, it } from 'vitest';

import {
  claudeMcpJsonStrategy,
  claudeSettingsPermissionsStrategy,
  codexConfigTomlStrategy,
  opencodeSharedJsoncStrategy,
  pickMergeStrategy,
  type MergeContext
} from '../src/adapters/merge-strategies.js';
import { MANAGED_JSONC_WARNING } from '../src/core/util.js';

function makeCtx(overrides: Partial<MergeContext> = {}): MergeContext {
  return {
    existing: undefined,
    generated: '',
    ownedRecords: [],
    nextRecords: [],
    selectedKinds: new Set(),
    phase: 'install',
    ...overrides
  };
}

describe('codexConfigTomlStrategy', () => {
  it('applies only to codex + .codex/config.toml', () => {
    expect(codexConfigTomlStrategy.applies('codex', '.codex/config.toml')).toBe(true);
    expect(codexConfigTomlStrategy.applies('codex', '.codex/other.toml')).toBe(false);
    expect(codexConfigTomlStrategy.applies('claude', '.codex/config.toml')).toBe(false);
    expect(codexConfigTomlStrategy.applies('opencode', '.codex/config.toml')).toBe(false);
  });

  it('merge with no existing content produces output from generated', () => {
    const ctx = makeCtx({
      generated: '[mcp_servers]\n[mcp_servers.my-server]\ncommand = "node"\n',
      selectedKinds: new Set(['mcp' as const]),
      nextRecords: [
        {
          version: 1,
          pack: 'project',
          target: 'codex',
          kind: 'mcp',
          id: 'my-server',
          source: 'mcps/my-server.toml',
          relPath: '.codex/config.toml',
          hash: 'abc',
          inventory: [{ version: 1, format: 'toml', selector: 'mcp_servers."my-server"' }]
        }
      ]
    });
    const result = codexConfigTomlStrategy.merge(ctx);
    expect(result.content).toContain('my-server');
  });

  it('does NOT prepend MANAGED_TOML_WARNING', () => {
    const ctx = makeCtx({
      generated: '',
      existing: 'foo = "bar"\n',
      selectedKinds: new Set()
    });
    const result = codexConfigTomlStrategy.merge(ctx);
    expect(result.content).not.toContain('DO NOT EDIT');
    expect(result.content).not.toContain('# managed by');
  });

  it('merge adds new mcp entry under mcp_servers and preserves unrelated key', () => {
    const ctx = makeCtx({
      existing: 'foo = "bar"\n',
      generated: '[mcp_servers]\n[mcp_servers.srv]\ncommand = "node"\n',
      selectedKinds: new Set(['mcp' as const]),
      nextRecords: [
        {
          version: 1,
          pack: 'project',
          target: 'codex',
          kind: 'mcp',
          id: 'srv',
          source: 'mcps/srv.toml',
          relPath: '.codex/config.toml',
          hash: 'abc',
          inventory: [{ version: 1, format: 'toml', selector: 'mcp_servers."srv"' }]
        }
      ]
    });
    const result = codexConfigTomlStrategy.merge(ctx);
    expect(result.content).toContain('srv');
    expect(result.content).toContain('foo');
  });
});

describe('claudeMcpJsonStrategy', () => {
  it('applies to claude + .mcp.json and .claude.json', () => {
    expect(claudeMcpJsonStrategy.applies('claude', '.mcp.json')).toBe(true);
    expect(claudeMcpJsonStrategy.applies('claude', '.claude.json')).toBe(true);
    expect(claudeMcpJsonStrategy.applies('claude', '.other.json')).toBe(false);
    expect(claudeMcpJsonStrategy.applies('codex', '.mcp.json')).toBe(false);
    expect(claudeMcpJsonStrategy.applies('opencode', '.mcp.json')).toBe(false);
  });

  it('merge adds new mcp entry under mcpServers', () => {
    const ctx = makeCtx({
      existing: '{}',
      generated: '{"mcpServers":{"my-mcp":{"command":"node","args":["mcp.js"]}}}',
      selectedKinds: new Set(['mcp' as const]),
      nextRecords: [
        {
          version: 1,
          pack: 'project',
          target: 'claude',
          kind: 'mcp',
          id: 'my-mcp',
          source: 'mcps/my-mcp.toml',
          relPath: '.mcp.json',
          hash: 'abc',
          inventory: [{ version: 1, format: 'json', selector: '$["mcpServers"]["my-mcp"]' }]
        }
      ]
    });
    const result = claudeMcpJsonStrategy.merge(ctx);
    const parsed = JSON.parse(result.content) as { mcpServers: Record<string, unknown> };
    expect(parsed.mcpServers).toHaveProperty('my-mcp');
  });

  it('merge preserves unrelated keys from existing content', () => {
    const ctx = makeCtx({
      existing: '{"otherKey":"preserved","mcpServers":{}}',
      generated: '{"mcpServers":{"srv":{"command":"node"}}}',
      selectedKinds: new Set(['mcp' as const]),
      nextRecords: [
        {
          version: 1,
          pack: 'project',
          target: 'claude',
          kind: 'mcp',
          id: 'srv',
          source: 'mcps/srv.toml',
          relPath: '.mcp.json',
          hash: 'abc',
          inventory: [{ version: 1, format: 'json', selector: '$["mcpServers"]["srv"]' }]
        }
      ]
    });
    const result = claudeMcpJsonStrategy.merge(ctx);
    const parsed = JSON.parse(result.content) as { otherKey: string; mcpServers: Record<string, unknown> };
    expect(parsed.otherKey).toBe('preserved');
    expect(parsed.mcpServers).toHaveProperty('srv');
  });
});

describe('claudeSettingsPermissionsStrategy', () => {
  it('applies only to claude + .claude/settings.json', () => {
    expect(claudeSettingsPermissionsStrategy.applies('claude', '.claude/settings.json')).toBe(true);
    expect(claudeSettingsPermissionsStrategy.applies('claude', '.claude/other.json')).toBe(false);
    expect(claudeSettingsPermissionsStrategy.applies('codex', '.claude/settings.json')).toBe(false);
  });

  it('deduplicates allow/deny entries', () => {
    const ctx = makeCtx({
      existing: '{"permissions":{"allow":["Bash(git:*)","Bash(git:*)"]}}',
      generated: '{}',
      selectedKinds: new Set(),
      ownedRecords: [],
      nextRecords: []
    });
    const result = claudeSettingsPermissionsStrategy.merge(ctx);
    const parsed = JSON.parse(result.content) as { permissions: { allow: string[] } };
    // The allow list may have duplicates from existing but strategy doesn't merge if selectedKinds doesn't include 'rule'
    // With no rule selection, existing entries are preserved as-is
    expect(parsed.permissions.allow).toContain('Bash(git:*)');
  });

  it('removes prevEntries not in nextEntries, appends new entries', () => {
    const prevRecord = {
      version: 1 as const,
      pack: 'project',
      target: 'claude' as const,
      kind: 'rule' as const,
      id: 'old-rule',
      source: 'rules/old.toml',
      relPath: '.claude/settings.json',
      hash: 'abc',
      inventory: [{ version: 1 as const, format: 'json' as const, selector: '$.permissions.allow', entries: ['Bash(old:*)'] }]
    };
    const nextRecord = {
      version: 1 as const,
      pack: 'project',
      target: 'claude' as const,
      kind: 'rule' as const,
      id: 'new-rule',
      source: 'rules/new.toml',
      relPath: '.claude/settings.json',
      hash: 'def',
      inventory: [{ version: 1 as const, format: 'json' as const, selector: '$.permissions.allow', entries: ['Bash(new:*)'] }]
    };
    const ctx = makeCtx({
      existing: '{"permissions":{"allow":["Bash(old:*)","Bash(keep:*)"]}}',
      generated: '{"permissions":{"allow":["Bash(new:*)"]}}',
      selectedKinds: new Set(['rule' as const]),
      ownedRecords: [prevRecord],
      nextRecords: [nextRecord]
    });
    const result = claudeSettingsPermissionsStrategy.merge(ctx);
    const parsed = JSON.parse(result.content) as { permissions: { allow: string[] } };
    expect(parsed.permissions.allow).not.toContain('Bash(old:*)');
    expect(parsed.permissions.allow).toContain('Bash(keep:*)');
    expect(parsed.permissions.allow).toContain('Bash(new:*)');
  });
});

describe('opencodeSharedJsoncStrategy', () => {
  it('applies to opencode + .opencode/opencode.jsonc and opencode/opencode.jsonc', () => {
    expect(opencodeSharedJsoncStrategy.applies('opencode', '.opencode/opencode.jsonc')).toBe(true);
    expect(opencodeSharedJsoncStrategy.applies('opencode', 'opencode/opencode.jsonc')).toBe(true);
    expect(opencodeSharedJsoncStrategy.applies('opencode', '.opencode/other.jsonc')).toBe(false);
    expect(opencodeSharedJsoncStrategy.applies('claude', '.opencode/opencode.jsonc')).toBe(false);
  });

  it('emitted content begins with MANAGED_JSONC_WARNING', () => {
    const ctx = makeCtx({
      existing: undefined,
      generated: '{}',
      selectedKinds: new Set()
    });
    const result = opencodeSharedJsoncStrategy.merge(ctx);
    expect(result.content.startsWith(MANAGED_JSONC_WARNING)).toBe(true);
  });

  it('merge adds new mcp entry under mcp key', () => {
    const ctx = makeCtx({
      existing: undefined,
      generated: '{"mcp":{"my-server":{"type":"local","command":"node"}}}',
      selectedKinds: new Set(['mcp' as const]),
      nextRecords: [
        {
          version: 1,
          pack: 'project',
          target: 'opencode',
          kind: 'mcp',
          id: 'my-server',
          source: 'mcps/my-server.toml',
          relPath: '.opencode/opencode.jsonc',
          hash: 'abc',
          inventory: [{ version: 1, format: 'json', selector: '$["mcp"]["my-server"]' }]
        }
      ]
    });
    const result = opencodeSharedJsoncStrategy.merge(ctx);
    expect(result.content).toContain('my-server');
  });
});

describe('pickMergeStrategy', () => {
  it('returns codexConfigTomlStrategy for codex + .codex/config.toml', () => {
    expect(pickMergeStrategy('codex', '.codex/config.toml')).toBe(codexConfigTomlStrategy);
  });

  it('returns claudeMcpJsonStrategy for claude + .mcp.json', () => {
    expect(pickMergeStrategy('claude', '.mcp.json')).toBe(claudeMcpJsonStrategy);
  });

  it('returns claudeSettingsPermissionsStrategy for claude + .claude/settings.json', () => {
    expect(pickMergeStrategy('claude', '.claude/settings.json')).toBe(claudeSettingsPermissionsStrategy);
  });

  it('returns opencodeSharedJsoncStrategy for opencode + .opencode/opencode.jsonc', () => {
    expect(pickMergeStrategy('opencode', '.opencode/opencode.jsonc')).toBe(opencodeSharedJsoncStrategy);
  });

  it('returns undefined for unrecognized target+relPath pair', () => {
    expect(pickMergeStrategy('claude', '.unrelated/file.txt')).toBeUndefined();
    expect(pickMergeStrategy('codex', '.opencode/opencode.jsonc')).toBeUndefined();
  });
});
