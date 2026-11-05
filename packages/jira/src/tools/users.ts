import { z } from 'zod';
import { formatToolResponse, handleApiOperation, type PolicyRegistrar, type ToolCatalog } from '@atlassian-dc-mcp/common';
import { MyselfService, UserService } from '../jira-client/index.js';
import { asArray, asRecord, type JiraToolContext } from './context.js';

/*
 * Reference module for tools ported from sooperset/mcp-atlassian. Each module exports a catalog
 * fragment and a register function, keeps its API calls and response shaping local, and has a
 * matching test file under __tests__/tools/.
 */

export const USERS_CATALOG: ToolCatalog = {
  toolsets: {
    jira_users: { description: 'Look up user profiles and assignable users', default: false },
  },
  tools: {
    jira_getUserProfile: { toolset: 'jira_users', access: 'read' },
    jira_searchAssignableUsers: { toolset: 'jira_users', access: 'read' },
  },
};

const CURRENT_USER_ALIASES = new Set(['me', 'currentuser', 'myself']);

/** Keep the fields a model needs to identify a user; drop avatars, self links and expands. */
export function shapeUser(value: unknown) {
  const user = asRecord(value);
  return {
    name: user.name,
    key: user.key,
    displayName: user.displayName,
    emailAddress: user.emailAddress,
    active: user.active,
    timeZone: user.timeZone,
  };
}

const isNotFound = (error: unknown) => asRecord(error).status === 404;

async function findUserProfile(identifier: string) {
  if (CURRENT_USER_ALIASES.has(identifier.toLowerCase())) {
    return MyselfService.getUser();
  }
  try {
    return await UserService.getUser1(false, undefined, identifier);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  try {
    return await UserService.getUser1(false, identifier);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const matches = asArray(await UserService.findUsers(false, 10, true, 0, identifier));
  const exact = matches.find((user) => String(asRecord(user).emailAddress).toLowerCase() === identifier.toLowerCase());
  if (!exact) throw new Error(`No Jira user matches "${identifier}" by username, key or email address.`);
  return exact;
}

export const userToolSchemas = {
  getUserProfile: {
    userIdentifier: z.string().min(1).describe("Username, user key, email address, or 'me' for the authenticated user"),
  },
  searchAssignableUsers: {
    query: z.string().min(1).describe("Display name, username or email fragment to search for (case-insensitive, partial match)"),
    projectKey: z.string().optional().describe("Project key to scope the search to. Required if issueKey is not given"),
    issueKey: z.string().optional().describe("Issue key to scope the search to (preferred when assigning an existing issue)"),
    maxResults: z.number().int().min(1).max(1000).optional().describe("Maximum number of users to return (default 20)"),
  },
};

export function registerUserTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getUserProfile',
    {
      description: `Get a user's profile (username, key, display name, email, active state) from the ${context.instanceType}. Accepts a username, user key, email address, or 'me'.`,
      inputSchema: z.object(userToolSchemas.getUserProfile),
    },
    async ({ userIdentifier }) => formatToolResponse(
      await handleApiOperation(async () => shapeUser(await findUserProfile(userIdentifier)), 'Error fetching user profile'),
    ),
  );

  tools.registerTool(
    'jira_searchAssignableUsers',
    {
      description: `Find users who can be assigned issues in a project or on an issue in the ${context.instanceType}. Use it to turn a name or email fragment into the username that assignee, reporter and watcher fields expect.`,
      inputSchema: z.object(userToolSchemas.searchAssignableUsers),
    },
    async ({ query, projectKey, issueKey, maxResults }) => {
      if (!projectKey && !issueKey) {
        return formatToolResponse({ success: false, error: 'Provide projectKey or issueKey to scope the search.' });
      }
      return formatToolResponse(await handleApiOperation(async () => {
        const users = await UserService.findAssignableUsers1(issueKey, maxResults ?? 20, projectKey, undefined, query);
        return asArray(users).map(shapeUser);
      }, 'Error searching assignable users'));
    },
  );
}
