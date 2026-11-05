import {
  isPermissionFilterEnabled,
  PERMISSION_FILTER_ENV_VAR,
  splitList,
  toolsHiddenByPermissions,
  type PermissionCheck,
  type ToolCatalog,
  type ToolPolicy,
} from '@atlassian-dc-mcp/common';
import { MypermissionsService, type CancelablePromise } from './jira-client/index.js';
import { asRecord } from './tools/context.js';

/*
 * Hides tools the Jira user could never run, from one `GET /rest/api/2/mypermissions` call at
 * startup. Without a project, Jira reports a project permission as held when the user has it in
 * any project, so the filter is coarse; JIRA_PERMISSION_PROJECTS narrows it to the listed projects.
 */

export const PERMISSION_PROJECTS_ENV_VAR = 'JIRA_PERMISSION_PROJECTS';
export const PERMISSION_CHECK_TIMEOUT_MS = 5000;

/** Project administration, which Jira administrators can also do in every project. */
export const PROJECT_ADMIN_PERMISSIONS = ['ADMINISTER_PROJECTS', 'ADMINISTER'] as const;

/** Keys whose tools change configuration for others; those stay hidden when Jira cannot be asked. */
export const ADMIN_PERMISSION_KEYS: ReadonlySet<string> = new Set(['ADMINISTER', 'SYSTEM_ADMIN', 'ADMINISTER_PROJECTS']);

/** Jira Data Center permission keys a catalog entry may name; the catalog test rejects anything else. */
export const JIRA_PERMISSION_KEYS: ReadonlySet<string> = new Set([
  'ADMINISTER', 'SYSTEM_ADMIN', 'USER_PICKER', 'CREATE_SHARED_OBJECTS', 'MANAGE_GROUP_FILTER_SUBSCRIPTIONS', 'BULK_CHANGE',
  'ADMINISTER_PROJECTS', 'BROWSE_PROJECTS', 'VIEW_DEV_TOOLS', 'VIEW_READONLY_WORKFLOW',
  'CREATE_ISSUES', 'EDIT_ISSUES', 'TRANSITION_ISSUES', 'SCHEDULE_ISSUES', 'MOVE_ISSUES', 'ASSIGN_ISSUES',
  'ASSIGNABLE_USER', 'RESOLVE_ISSUES', 'CLOSE_ISSUES', 'MODIFY_REPORTER', 'DELETE_ISSUES', 'LINK_ISSUES',
  'SET_ISSUE_SECURITY', 'VIEW_VOTERS_AND_WATCHERS', 'MANAGE_WATCHERS',
  'ADD_COMMENTS', 'EDIT_ALL_COMMENTS', 'EDIT_OWN_COMMENTS', 'DELETE_ALL_COMMENTS', 'DELETE_OWN_COMMENTS',
  'CREATE_ATTACHMENTS', 'DELETE_ALL_ATTACHMENTS', 'DELETE_OWN_ATTACHMENTS',
  'WORK_ON_ISSUES', 'EDIT_OWN_WORKLOGS', 'EDIT_ALL_WORKLOGS', 'DELETE_OWN_WORKLOGS', 'DELETE_ALL_WORKLOGS',
  'MANAGE_SPRINTS_PERMISSION',
]);

type Env = Record<string, string | undefined>;
type Warn = (message: string) => void;

export interface PermissionFilterOptions {
  env?: Env;
  warn?: Warn;
  timeoutMs?: number;
}

const describeError = (error: unknown): string => {
  const { status, statusText } = asRecord(error);
  if (typeof status === 'number') return `${status} ${String(statusText ?? '')}`.trim();
  return error instanceof Error ? error.message : String(error);
};

function withTimeout<T>(request: CancelablePromise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      request.cancel();
      reject(new Error(`no answer within ${ms} ms`));
    }, ms);
  });
  return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
}

function addGranted(granted: Set<string>, response: unknown): void {
  for (const [key, permission] of Object.entries(asRecord(asRecord(response).permissions))) {
    if (asRecord(permission).havePermission === true) granted.add(key);
  }
}

async function readGrantedPermissions(projectKeys: string[], warn: Warn, timeoutMs: number): Promise<Set<string>> {
  const contexts = projectKeys.length > 0 ? projectKeys : [undefined];
  const results = await Promise.allSettled(
    contexts.map((projectKey) => withTimeout(MypermissionsService.getPermissions(undefined, projectKey), timeoutMs)),
  );
  if (!results.some((result) => result.status === 'fulfilled')) {
    throw (results[0] as PromiseRejectedResult).reason;
  }

  const granted = new Set<string>();
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      addGranted(granted, result.value);
    } else {
      warn(`Could not read your Jira permissions in project ${contexts[index]} (${describeError(result.reason)}); ignoring it.`);
    }
  });
  return granted;
}

/** `undefined` when the filter is off. If Jira cannot be asked, only admin tools are hidden. */
export async function loadJiraPermissionCheck(options: PermissionFilterOptions = {}): Promise<PermissionCheck | undefined> {
  const { env = process.env, warn = console.error, timeoutMs = PERMISSION_CHECK_TIMEOUT_MS } = options;
  if (!isPermissionFilterEnabled(env)) return undefined;
  try {
    const granted = await readGrantedPermissions(splitList(env[PERMISSION_PROJECTS_ENV_VAR]), warn, timeoutMs);
    return (anyOf) => anyOf.some((key) => granted.has(key));
  } catch (error) {
    warn(
      `Could not read your Jira permissions (${describeError(error)}), so admin tools are hidden and the rest are listed. ` +
      `Set ${PERMISSION_FILTER_ENV_VAR}=off to skip this check.`,
    );
    return (anyOf) => !anyOf.some((key) => ADMIN_PERMISSION_KEYS.has(key));
  }
}

/** Adds the permission check to a resolved policy, skipping the Jira call when no selected tool is gated. */
export async function applyJiraPermissionFilter(
  catalog: ToolCatalog,
  policy: ToolPolicy,
  options: PermissionFilterOptions = {},
): Promise<ToolPolicy> {
  if (toolsHiddenByPermissions(catalog, { ...policy, permissionCheck: () => false }).length === 0) {
    return policy;
  }
  const permissionCheck = await loadJiraPermissionCheck(options);
  return permissionCheck ? { ...policy, permissionCheck } : policy;
}

/** One startup line naming the tools the permission check kept out, from `PolicyRegistrar.hiddenByPermission()`. */
export function reportToolsHiddenByPermission(names: string[], warn: Warn = console.error): void {
  if (names.length === 0) return;
  warn(`Permission filter hid ${names.length} Jira tools: ${names.join(', ')}. Set ${PERMISSION_FILTER_ENV_VAR}=off to list them anyway.`);
}
