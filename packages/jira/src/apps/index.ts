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
import type { JiraToolContext } from '../tools/context.js';
import { DRAWIO_CATALOG } from './drawio/catalog.js';
import { startDrawioRequest } from './drawio/client.js';
import { registerDrawioReadTools } from './drawio/read-tools.js';
import { SCRIPTRUNNER_CATALOG } from './scriptrunner/catalog.js';
import { startScriptRunnerRequest } from './scriptrunner/client.js';
import { registerScriptRunnerReadTools } from './scriptrunner/read-tools.js';
import { registerScriptRunnerOptInTools } from './scriptrunner/opt-in-tools.js';
import { XRAY_CATALOG } from './xray/catalog.js';
import { startXrayRequest } from './xray/client.js';
import { registerXrayReadTools } from './xray/read-tools.js';
import { registerXrayWriteTools } from './xray/write-tools.js';

/** Jira apps (Marketplace plugins) whose REST APIs this server can use; see detectApps in common. */

export const JIRA_APPS_ENV_VAR = 'JIRA_APPS';

export type JiraApp = ProductApp<JiraToolContext>;

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
  {
    id: 'scriptrunner',
    name: 'ScriptRunner',
    catalog: SCRIPTRUNNER_CATALOG,
    // Any signed-in user may read the JQL function docs, unlike most ScriptRunner routes.
    probe: (timeoutMs) => withTimeout(startScriptRunnerRequest('scriptrunner-jira', { method: 'GET', url: '/jqlfunctions/docs' }), timeoutMs),
    register: (tools, context) => {
      registerScriptRunnerReadTools(tools, context);
      registerScriptRunnerOptInTools(tools, context);
    },
  },
  {
    id: 'drawio',
    name: 'draw.io',
    catalog: DRAWIO_CATALOG,
    // Every signed-in user has a list of shape libraries, often empty.
    probe: (timeoutMs) => withTimeout(startDrawioRequest({ method: 'GET', url: '/library/list' }), timeoutMs),
    register: registerDrawioReadTools,
  },
];

export const JIRA_APPS_CATALOG = mergeToolCatalogs(...JIRA_APPS.map((app) => app.catalog));

/** The Jira apps whose tools to register: named in JIRA_APPS, or found on the instance when it is unset or `auto`. */
export function detectJiraApps(policy: ToolPolicy, options: AppDetectionOptions = {}): Promise<JiraApp[]> {
  return detectApps(JIRA_APPS, JIRA_APPS_ENV_VAR, policy, options);
}

export function registerJiraAppTools(tools: PolicyRegistrar, context: JiraToolContext, apps: JiraApp[]): void {
  registerApps(tools, context, apps);
}
