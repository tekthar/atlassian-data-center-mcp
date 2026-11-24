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
import { BIGPICTURE_CATALOG } from './bigpicture/catalog.js';
import { startBigPictureRequest } from './bigpicture/client.js';
import { registerBigPictureReadTools } from './bigpicture/read-tools.js';
import { registerBigPictureWriteTools } from './bigpicture/write-tools.js';
import { DRAWIO_CATALOG } from './drawio/catalog.js';
import { startDrawioRequest } from './drawio/client.js';
import { registerDrawioReadTools } from './drawio/read-tools.js';
import { JMWE_CATALOG } from './jmwe/catalog.js';
import { startJmweRequest } from './jmwe/client.js';
import { registerJmweOptInTools } from './jmwe/opt-in-tools.js';
import { registerJmweReadTools } from './jmwe/read-tools.js';
import { SCRIPTRUNNER_CATALOG } from './scriptrunner/catalog.js';
import { startScriptRunnerRequest } from './scriptrunner/client.js';
import { registerScriptRunnerReadTools } from './scriptrunner/read-tools.js';
import { registerScriptRunnerOptInTools } from './scriptrunner/opt-in-tools.js';
import { STRUCTURE_CATALOG } from './structure/catalog.js';
import { startStructureRequest } from './structure/client.js';
import { registerStructureReadTools } from './structure/read-tools.js';
import { registerStructureWriteTools } from './structure/write-tools.js';
import { TEMPO_CATALOG } from './tempo/catalog.js';
import { startTempoRequest } from './tempo/client.js';
import { registerTempoReadTools } from './tempo/read-tools.js';
import { registerTempoWriteTools } from './tempo/write-tools.js';
import { TIMESHEET_TRACKING_CATALOG } from './timesheettracking/catalog.js';
import { startTimesheetTrackingRequest } from './timesheettracking/client.js';
import { registerTimesheetTrackingReadTools } from './timesheettracking/read-tools.js';
import { XRAY_CATALOG } from './xray/catalog.js';
import { startXrayRequest } from './xray/client.js';
import { registerXrayReadTools } from './xray/read-tools.js';
import { registerXrayWriteTools } from './xray/write-tools.js';
import { ZEPHYR_CATALOG } from './zephyr/catalog.js';
import { startZephyrRequest } from './zephyr/client.js';
import { registerZephyrReadTools } from './zephyr/read-tools.js';
import { registerZephyrWriteTools } from './zephyr/write-tools.js';
import { ZEPHYR_ESSENTIAL_CATALOG } from './zephyressential/catalog.js';
import { startZephyrEssentialRequest } from './zephyressential/client.js';
import { registerZephyrEssentialReadTools } from './zephyressential/read-tools.js';

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
  {
    id: 'zephyr',
    name: 'Zephyr',
    catalog: ZEPHYR_CATALOG,
    probe: (timeoutMs) => withTimeout(startZephyrRequest({ method: 'GET', url: '/healthcheck' }), timeoutMs),
    register: (tools, context) => {
      registerZephyrReadTools(tools, context);
      registerZephyrWriteTools(tools, context);
    },
  },
  {
    id: 'bigpicture',
    name: 'BigPicture',
    catalog: BIGPICTURE_CATALOG,
    probe: (timeoutMs) => withTimeout(startBigPictureRequest({ method: 'GET', url: '/ppm/box/box-types' }), timeoutMs),
    register: (tools, context) => {
      registerBigPictureReadTools(tools, context);
      registerBigPictureWriteTools(tools, context);
    },
  },
  {
    id: 'tempo',
    name: 'Tempo Timesheets',
    catalog: TEMPO_CATALOG,
    probe: (timeoutMs) => withTimeout(startTempoRequest({ method: 'GET', url: '/period/current' }), timeoutMs),
    register: (tools, context) => {
      registerTempoReadTools(tools, context);
      registerTempoWriteTools(tools, context);
    },
  },
  {
    id: 'jmwe',
    name: 'JMWE',
    catalog: JMWE_CATALOG,
    probe: (timeoutMs) => withTimeout(startJmweRequest({ method: 'GET', url: '/status/picker' }), timeoutMs),
    register: (tools, context) => {
      registerJmweReadTools(tools, context);
      registerJmweOptInTools(tools, context);
    },
  },
  {
    id: 'structure',
    name: 'Structure',
    catalog: STRUCTURE_CATALOG,
    // Structure's documented structure search; a signed-in user who may use Structure gets a page, often empty.
    probe: (timeoutMs) => withTimeout(startStructureRequest({ method: 'GET', url: '/structure', query: { limit: 1 } }), timeoutMs),
    register: (tools, context) => {
      registerStructureReadTools(tools, context);
      registerStructureWriteTools(tools, context);
    },
  },
  {
    id: 'timesheettracking',
    name: 'Timesheet Tracking',
    catalog: TIMESHEET_TRACKING_CATALOG,
    // Jira's time tracking settings as the app reads them, for any signed-in user.
    probe: (timeoutMs) => withTimeout(startTimesheetTrackingRequest({ method: 'GET', url: '/reportrestglobal/get-jira-settings' }), timeoutMs),
    register: registerTimesheetTrackingReadTools,
  },
  {
    id: 'zephyressential',
    name: 'Zephyr Essential',
    catalog: ZEPHYR_ESSENTIAL_CATALOG,
    // The execution statuses, for any signed-in user.
    probe: (timeoutMs) => withTimeout(startZephyrEssentialRequest({ method: 'GET', url: '/util/testExecutionStatus' }), timeoutMs),
    register: registerZephyrEssentialReadTools,
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
