import {
  detectApps,
  mergeToolCatalogs,
  registerApps,
  withTimeout,
  type AppDetectionOptions,
  type PolicyRegistrar,
  type ProductApp,
  type ToolPolicy,
} from '@atlassian-dc-mcp/common';
import type { ConfluenceToolContext } from '../tools/context.js';
import { DRAWIO_CATALOG } from './drawio/catalog.js';
import { startDrawioRequest } from './drawio/client.js';
import { registerDrawioReadTools } from './drawio/read-tools.js';

/** Confluence apps (Marketplace plugins) whose REST APIs this server can use; see detectApps in common. */

export const CONFLUENCE_APPS_ENV_VAR = 'CONFLUENCE_APPS';

export type ConfluenceApp = ProductApp<ConfluenceToolContext>;

export const CONFLUENCE_APPS: ConfluenceApp[] = [
  {
    id: 'drawio',
    name: 'draw.io',
    catalog: DRAWIO_CATALOG,
    // The diagram editor reads this for every user; administrators get more of it.
    probe: (timeoutMs) => withTimeout(startDrawioRequest({ method: 'GET', url: '/config' }), timeoutMs),
    register: registerDrawioReadTools,
  },
];

export const CONFLUENCE_APPS_CATALOG = mergeToolCatalogs(...CONFLUENCE_APPS.map((app) => app.catalog));

/** The Confluence apps whose tools to register: named in CONFLUENCE_APPS, or found on the instance when it is unset or `auto`. */
export function detectConfluenceApps(policy: ToolPolicy, options: AppDetectionOptions = {}): Promise<ConfluenceApp[]> {
  return detectApps(CONFLUENCE_APPS, CONFLUENCE_APPS_ENV_VAR, policy, options);
}

export function registerConfluenceAppTools(tools: PolicyRegistrar, context: ConfluenceToolContext, apps: ConfluenceApp[]): void {
  registerApps(tools, context, apps);
}
