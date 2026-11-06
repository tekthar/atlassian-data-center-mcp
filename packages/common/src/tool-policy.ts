import type { ToolAnnotations } from '@modelcontextprotocol/server';

/**
 * Which tools a server exposes, decided once at startup from three environment variables:
 *
 * - `TOOLSETS`: comma-separated toolset names, `default` for the catalog's default toolsets,
 *   or `all`. Unset means the defaults.
 * - `READ_ONLY_MODE`: when true, only tools that never change Jira or Confluence are exposed.
 * - `ENABLED_TOOLS`: comma-separated exact tool names. When set it replaces `TOOLSETS`;
 *   `READ_ONLY_MODE` still applies.
 * - `TOOL_GATEWAY`: on by default. Tools outside the selected toolsets are offered through three
 *   gateway tools (search, run read, run write) instead of being hidden; `off` hides them as before.
 *   The gateway is off while `ENABLED_TOOLS` is set, and never offers destructive tools.
 * - `CODE_EXECUTION`: on by default. Adds a tool that runs JavaScript in a sandbox, where it can call
 *   the read tools the server offers. `off` removes it; it is also off while `ENABLED_TOOLS` is set.
 * - `PERMISSION_FILTER`: on by default. A server that can read the user's permissions at startup
 *   also hides tools the user could never run successfully; `off` turns that check off.
 *
 * Hiding a tool trims what the model sees and pays for in tokens. It is not access control:
 * Jira and Confluence still enforce the token owner's permissions on every call.
 */

export type ToolAccess = 'read' | 'write' | 'destructive';

export interface ToolsetDefinition {
  description: string;
  /** Exposed when `TOOLSETS` is unset or includes `default`. */
  default: boolean;
  /** `false` keeps the toolset out of the tool gateway: its tools are listed directly or not at all. */
  gateway?: boolean;
}

export interface ToolCatalogEntry {
  toolset: string;
  access: ToolAccess;
  /** Product permission keys; with the permission filter on, the user must hold at least one. */
  anyOfPermissions?: readonly string[];
}

export interface ToolCatalog {
  toolsets: Readonly<Record<string, ToolsetDefinition>>;
  tools: Readonly<Record<string, ToolCatalogEntry>>;
}

/** Answers whether the user holds at least one of the given permission keys. */
export type PermissionCheck = (anyOf: readonly string[]) => boolean;

export interface ToolPolicy {
  toolsets: ReadonlySet<string>;
  readOnly: boolean;
  /** Exact tool names to expose; `null` when `ENABLED_TOOLS` is unset. */
  enabledTools: ReadonlySet<string> | null;
  /** Toolsets whose unselected tools are offered through the gateway; absent means no gateway. */
  gatewayToolsets?: ReadonlySet<string>;
  /** Offer the sandboxed code tool; absent means off. */
  codeExecution?: boolean;
  /** Set by servers that read the user's permissions at startup; absent means no permission filtering. */
  permissionCheck?: PermissionCheck;
}

export const TOOLSETS_ENV_VAR = 'TOOLSETS';
export const READ_ONLY_ENV_VAR = 'READ_ONLY_MODE';
export const ENABLED_TOOLS_ENV_VAR = 'ENABLED_TOOLS';
export const PERMISSION_FILTER_ENV_VAR = 'PERMISSION_FILTER';
export const TOOL_GATEWAY_ENV_VAR = 'TOOL_GATEWAY';
export const CODE_EXECUTION_ENV_VAR = 'CODE_EXECUTION';

type Env = Record<string, string | undefined>;
type Warn = (message: string) => void;

const defaultWarn: Warn = (message) => console.error(message);

/** Comma-separated environment value as trimmed, non-empty items. */
export const splitList = (value: string | undefined): string[] =>
  (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);

const isTruthy = (value: string | undefined): boolean =>
  ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());

const isFalsy = (value: string | undefined): boolean =>
  ['0', 'false', 'no', 'off'].includes((value ?? '').trim().toLowerCase());

/** The permission filter is on unless `PERMISSION_FILTER` is explicitly off. */
export function isPermissionFilterEnabled(env: Env = process.env): boolean {
  return !isFalsy(env[PERMISSION_FILTER_ENV_VAR]);
}

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

  const gatewayOn = enabledTools.length === 0 && !isFalsy(env[TOOL_GATEWAY_ENV_VAR]);
  return {
    toolsets: resolveToolsets(catalog, env[TOOLSETS_ENV_VAR], warn),
    readOnly: isTruthy(env[READ_ONLY_ENV_VAR]),
    enabledTools: enabledTools.length > 0 ? new Set(enabledTools) : null,
    gatewayToolsets: new Set(gatewayOn ? gatewayToolsetNames(catalog) : []),
    codeExecution: enabledTools.length === 0 && !isFalsy(env[CODE_EXECUTION_ENV_VAR]),
  };
}

function gatewayToolsetNames(catalog: ToolCatalog): string[] {
  return Object.entries(catalog.toolsets)
    .filter(([, definition]) => definition.gateway !== false)
    .map(([name]) => name);
}

function isSelected(name: string, entry: ToolCatalogEntry, policy: ToolPolicy): boolean {
  if (policy.readOnly && entry.access !== 'read') {
    return false;
  }
  if (policy.enabledTools) {
    return policy.enabledTools.has(name);
  }
  return policy.toolsets.has(entry.toolset);
}

function hasRequiredPermission(entry: ToolCatalogEntry, policy: ToolPolicy): boolean {
  const required = entry.anyOfPermissions ?? [];
  return required.length === 0 || !policy.permissionCheck || policy.permissionCheck(required);
}

function isGatewayEligible(name: string, entry: ToolCatalogEntry, policy: ToolPolicy): boolean {
  if (entry.access === 'destructive' || (policy.readOnly && entry.access !== 'read')) {
    return false;
  }
  return !isSelected(name, entry, policy) && (policy.gatewayToolsets?.has(entry.toolset) ?? false);
}

/** True when the tool is listed directly. */
export function isToolAllowed(name: string, entry: ToolCatalogEntry, policy: ToolPolicy): boolean {
  return isSelected(name, entry, policy) && hasRequiredPermission(entry, policy);
}

/** True when the tool is not listed directly but can be found and run through the tool gateway. */
export function isGatewayTool(name: string, entry: ToolCatalogEntry, policy: ToolPolicy): boolean {
  return isGatewayEligible(name, entry, policy) && hasRequiredPermission(entry, policy);
}

/** True when the other settings would offer the tool, directly or through the gateway, and only the permission check hides it. */
export function isHiddenByPermission(name: string, entry: ToolCatalogEntry, policy: ToolPolicy): boolean {
  const offered = isSelected(name, entry, policy) || isGatewayEligible(name, entry, policy);
  return offered && !hasRequiredPermission(entry, policy);
}

export function toolsHiddenByPermissions(catalog: ToolCatalog, policy: ToolPolicy): string[] {
  return Object.entries(catalog.tools)
    .filter(([name, entry]) => isHiddenByPermission(name, entry, policy))
    .map(([name]) => name);
}

/** Combine per-module catalogs; a toolset or tool defined twice is a wiring mistake. */
export function mergeToolCatalogs(...catalogs: ToolCatalog[]): ToolCatalog {
  const toolsets: Record<string, ToolsetDefinition> = {};
  const tools: Record<string, ToolCatalogEntry> = {};
  for (const catalog of catalogs) {
    for (const [name, definition] of Object.entries(catalog.toolsets)) {
      if (name in toolsets) throw new Error(`Toolset "${name}" is defined by more than one catalog.`);
      toolsets[name] = definition;
    }
    for (const [name, entry] of Object.entries(catalog.tools)) {
      if (name in tools) throw new Error(`Tool "${name}" is defined by more than one catalog.`);
      tools[name] = entry;
    }
  }
  return { toolsets, tools };
}

export function annotationsFor(access: ToolAccess): ToolAnnotations {
  if (access === 'read') {
    return { readOnlyHint: true };
  }
  return { readOnlyHint: false, destructiveHint: access === 'destructive' };
}
