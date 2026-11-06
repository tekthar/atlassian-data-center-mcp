import {
  isGatewayTool,
  isToolAllowed,
  mergeToolCatalogs,
  splitList,
  type PolicyRegistrar,
  type ToolCatalog,
  type ToolPolicy,
} from '@atlassian-dc-mcp/common';
import { withTimeout } from '../permissions.js';
import type { JiraToolContext } from '../tools/context.js';
import { XRAY_CATALOG } from './xray/catalog.js';
import { startXrayRequest } from './xray/client.js';
import { registerXrayReadTools } from './xray/read-tools.js';
import { registerXrayWriteTools } from './xray/write-tools.js';

/*
 * Jira apps (Marketplace plugins) whose REST APIs this server can use. Each app's tools are
 * registered only when the app is on the instance: JIRA_APPS names the apps to offer, or, unset
 * or `auto`, the server asks Jira at startup. App toolsets are off by default, so their tools
 * are reached through the tool search unless TOOLSETS names them.
 */

export const JIRA_APPS_ENV_VAR = 'JIRA_APPS';
export const APP_CHECK_TIMEOUT_MS = 5000;

type Env = Record<string, string | undefined>;
type Warn = (message: string) => void;

export interface JiraApp {
  /** Name used in JIRA_APPS. */
  id: string;
  name: string;
  catalog: ToolCatalog;
  /** One cheap request that succeeds only when the app is installed and enabled. */
  probe: (timeoutMs: number) => Promise<unknown>;
  register: (tools: PolicyRegistrar, context: JiraToolContext) => void;
}

export const JIRA_APPS: JiraApp[] = [
  {
    id: 'xray',
    name: 'Xray',
    catalog: XRAY_CATALOG,
    probe: (timeoutMs) => withTimeout(startXrayRequest('1.0', { method: 'GET', url: '/api/settings/teststatuses' }), timeoutMs),
    register: (tools, context) => {
      registerXrayReadTools(tools, context);
      registerXrayWriteTools(tools, context);
    },
  },
];

export const JIRA_APPS_CATALOG = mergeToolCatalogs(...JIRA_APPS.map((app) => app.catalog));

/** True when the policy would offer at least one of the app's tools, before the permission check. */
function couldOfferApp(app: JiraApp, policy: ToolPolicy): boolean {
  const unfiltered = { ...policy, permissionCheck: undefined };
  return Object.entries(app.catalog.tools)
    .some(([name, entry]) => isToolAllowed(name, entry, unfiltered) || isGatewayTool(name, entry, unfiltered));
}

const describeError = (error: unknown): string => {
  const { status, statusText } = (error ?? {}) as { status?: unknown; statusText?: unknown };
  if (typeof status === 'number') return `${status} ${String(statusText ?? '')}`.trim();
  return error instanceof Error ? error.message : String(error);
};

async function isInstalled(app: JiraApp, warn: Warn, timeoutMs: number): Promise<boolean> {
  try {
    await app.probe(timeoutMs);
    return true;
  } catch (error) {
    if ((error as { status?: unknown })?.status !== 404) {
      warn(`Could not check whether ${app.name} is installed (${describeError(error)}), so its tools are left out. ` +
        `Set ${JIRA_APPS_ENV_VAR}=${app.id} to offer them without checking.`);
    }
    return false;
  }
}

function namedApps(value: string, warn: Warn): JiraApp[] {
  const names = splitList(value).map((name) => name.toLowerCase());
  for (const name of names.filter((wanted) => !JIRA_APPS.some((app) => app.id === wanted))) {
    warn(`Ignoring unknown app "${name}" in ${JIRA_APPS_ENV_VAR}. Known apps: ${JIRA_APPS.map((app) => app.id).join(', ')}.`);
  }
  return JIRA_APPS.filter((app) => names.includes(app.id));
}

export interface AppDetectionOptions {
  env?: Env;
  warn?: Warn;
  timeoutMs?: number;
}

/** The apps whose tools to register: named in JIRA_APPS, or found on the instance when it is unset or `auto`. */
export async function detectJiraApps(policy: ToolPolicy, options: AppDetectionOptions = {}): Promise<JiraApp[]> {
  const { env = process.env, warn = console.error, timeoutMs = APP_CHECK_TIMEOUT_MS } = options;
  const setting = (env[JIRA_APPS_ENV_VAR] ?? '').trim().toLowerCase();
  if (['off', 'none', 'false'].includes(setting)) return [];
  if (setting !== '' && setting !== 'auto') return namedApps(setting, warn);
  const candidates = JIRA_APPS.filter((app) => couldOfferApp(app, policy));
  const installed = await Promise.all(candidates.map((app) => isInstalled(app, warn, timeoutMs)));
  return candidates.filter((_, index) => installed[index]);
}

export function registerJiraAppTools(tools: PolicyRegistrar, context: JiraToolContext, apps: JiraApp[]): void {
  for (const app of apps) app.register(tools, context);
}
