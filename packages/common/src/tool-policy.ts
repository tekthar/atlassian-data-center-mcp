import type { ToolAnnotations } from '@modelcontextprotocol/server';

/**
 * Which tools a server exposes, decided once at startup from three environment variables:
 *
 * - `TOOLSETS`: comma-separated toolset names, `default` for the catalog's default toolsets,
 *   or `all`. Unset means the defaults.
 * - `READ_ONLY_MODE`: when true, only tools that never change Jira or Confluence are exposed.
 * - `ENABLED_TOOLS`: comma-separated exact tool names. When set it replaces `TOOLSETS`;
 *   `READ_ONLY_MODE` still applies.
 *
 * Hiding a tool trims what the model sees and pays for in tokens. It is not access control:
 * Jira and Confluence still enforce the token owner's permissions on every call.
 */

export type ToolAccess = 'read' | 'write' | 'destructive';

export interface ToolsetDefinition {
  description: string;
  /** Exposed when `TOOLSETS` is unset or includes `default`. */
  default: boolean;
}

export interface ToolCatalogEntry {
  toolset: string;
  access: ToolAccess;
}

export interface ToolCatalog {
  toolsets: Readonly<Record<string, ToolsetDefinition>>;
  tools: Readonly<Record<string, ToolCatalogEntry>>;
}

export interface ToolPolicy {
  toolsets: ReadonlySet<string>;
  readOnly: boolean;
  /** Exact tool names to expose; `null` when `ENABLED_TOOLS` is unset. */
  enabledTools: ReadonlySet<string> | null;
}

export const TOOLSETS_ENV_VAR = 'TOOLSETS';
export const READ_ONLY_ENV_VAR = 'READ_ONLY_MODE';
export const ENABLED_TOOLS_ENV_VAR = 'ENABLED_TOOLS';

type Env = Record<string, string | undefined>;
type Warn = (message: string) => void;

const defaultWarn: Warn = (message) => console.error(message);

const splitList = (value: string | undefined): string[] =>
  (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);

const isTruthy = (value: string | undefined): boolean =>
  ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());

export function resolveToolsets(catalog: ToolCatalog, value: string | undefined, warn: Warn = defaultWarn): Set<string> {
  const known = Object.keys(catalog.toolsets);
  const defaults = known.filter((name) => catalog.toolsets[name].default);
  const tokens = splitList(value).map((token) => token.toLowerCase());
  if (tokens.length === 0) {
    return new Set(defaults);
  }
  if (tokens.includes('all')) {
    return new Set(known);
  }

  const selected = new Set<string>();
  for (const token of tokens) {
    if (token === 'default') {
      defaults.forEach((name) => selected.add(name));
    } else if (known.includes(token)) {
      selected.add(token);
    } else {
      warn(`Ignoring unknown toolset "${token}" in ${TOOLSETS_ENV_VAR}. Known toolsets: ${known.join(', ')}.`);
    }
  }
  return selected;
}

export function resolveToolPolicy(catalog: ToolCatalog, env: Env = process.env, warn: Warn = defaultWarn): ToolPolicy {
  const enabledTools = splitList(env[ENABLED_TOOLS_ENV_VAR]);
  for (const name of enabledTools.filter((tool) => !(tool in catalog.tools))) {
    warn(`Ignoring unknown tool "${name}" in ${ENABLED_TOOLS_ENV_VAR}.`);
  }
  if (enabledTools.length > 0 && splitList(env[TOOLSETS_ENV_VAR]).length > 0) {
    warn(`${ENABLED_TOOLS_ENV_VAR} is set, so ${TOOLSETS_ENV_VAR} is ignored.`);
  }

  return {
    toolsets: resolveToolsets(catalog, env[TOOLSETS_ENV_VAR], warn),
    readOnly: isTruthy(env[READ_ONLY_ENV_VAR]),
    enabledTools: enabledTools.length > 0 ? new Set(enabledTools) : null,
  };
}

export function isToolAllowed(name: string, entry: ToolCatalogEntry, policy: ToolPolicy): boolean {
  if (policy.readOnly && entry.access !== 'read') {
    return false;
  }
  if (policy.enabledTools) {
    return policy.enabledTools.has(name);
  }
  return policy.toolsets.has(entry.toolset);
}

export function annotationsFor(access: ToolAccess): ToolAnnotations {
  if (access === 'read') {
    return { readOnlyHint: true };
  }
  return { readOnlyHint: false, destructiveHint: access === 'destructive' };
}
