import type { PolicyRegistrar } from './policy-registrar.js';
import { isGatewayTool, isToolAllowed, splitList, type ToolCatalog, type ToolPolicy } from './tool-policy.js';

/*
 * Marketplace apps whose REST APIs a server can use. Each app's tools are registered only when the
 * app is on the instance: a setting such as JIRA_APPS names the apps to offer, or, unset or `auto`,
 * the server asks the instance at startup. App toolsets are off by default, so their tools are
 * reached through the tool search unless TOOLSETS names them.
 */

export const APP_CHECK_TIMEOUT_MS = 5000;

type Env = Record<string, string | undefined>;
type Warn = (message: string) => void;

export interface ProductApp<Context> {
  /** Name used in the apps setting. */
  id: string;
  name: string;
  catalog: ToolCatalog;
  /** One cheap request that succeeds only when the app is installed and enabled. */
  probe: (timeoutMs: number) => Promise<unknown>;
  register: (tools: PolicyRegistrar, context: Context) => void;
}

export interface AppDetectionOptions {
  env?: Env;
  warn?: Warn;
  timeoutMs?: number;
}

/** Cancels the request and rejects when it takes longer than `ms`. */
export function withTimeout<T>(request: PromiseLike<T> & { cancel: () => void }, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      request.cancel();
      reject(new Error(`no answer within ${ms} ms`));
    }, ms);
  });
  return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
}

/** True when the policy would offer at least one of the app's tools, before the permission check. */
function couldOfferApp<C>(app: ProductApp<C>, policy: ToolPolicy): boolean {
  const unfiltered = { ...policy, permissionCheck: undefined };
  return Object.entries(app.catalog.tools)
    .some(([name, entry]) => isToolAllowed(name, entry, unfiltered) || isGatewayTool(name, entry, unfiltered));
}

const describeError = (error: unknown): string => {
  const { status, statusText } = (error ?? {}) as { status?: unknown; statusText?: unknown };
  if (typeof status === 'number') return `${status} ${String(statusText ?? '')}`.trim();
  return error instanceof Error ? error.message : String(error);
};

async function isInstalled<C>(app: ProductApp<C>, envVar: string, warn: Warn, timeoutMs: number): Promise<boolean> {
  try {
    await app.probe(timeoutMs);
    return true;
  } catch (error) {
    if ((error as { status?: unknown })?.status !== 404) {
      warn(`Could not check whether ${app.name} is installed (${describeError(error)}), so its tools are left out. ` +
        `Set ${envVar}=${app.id} to offer them without checking.`);
    }
    return false;
  }
}

function namedApps<C>(apps: ProductApp<C>[], envVar: string, value: string, warn: Warn): ProductApp<C>[] {
  const names = splitList(value).map((name) => name.toLowerCase());
  for (const name of names.filter((wanted) => !apps.some((app) => app.id === wanted))) {
    warn(`Ignoring unknown app "${name}" in ${envVar}. Known apps: ${apps.map((app) => app.id).join(', ')}.`);
  }
  return apps.filter((app) => names.includes(app.id));
}

/** The apps whose tools to register: named in `envVar`, or found on the instance when it is unset or `auto`. */
export async function detectApps<C>(
  apps: ProductApp<C>[],
  envVar: string,
  policy: ToolPolicy,
  options: AppDetectionOptions = {},
): Promise<ProductApp<C>[]> {
  const { env = process.env, warn = console.error, timeoutMs = APP_CHECK_TIMEOUT_MS } = options;
  const setting = (env[envVar] ?? '').trim().toLowerCase();
  if (['off', 'none', 'false'].includes(setting)) return [];
  if (setting !== '' && setting !== 'auto') return namedApps(apps, envVar, setting, warn);
  const candidates = apps.filter((app) => couldOfferApp(app, policy));
  const installed = await Promise.all(candidates.map((app) => isInstalled(app, envVar, warn, timeoutMs)));
  return candidates.filter((_, index) => installed[index]);
}

export function registerApps<C>(tools: PolicyRegistrar, context: C, apps: ProductApp<C>[]): void {
  for (const app of apps) app.register(tools, context);
}
