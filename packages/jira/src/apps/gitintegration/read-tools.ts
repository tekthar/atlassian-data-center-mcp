import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as git from './operations.js';
import { gitIntegrationToolSchemas as schemas } from './schemas.js';

export function registerGitIntegrationReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('gitintegration_getIssueCommits', {
    description: `Get the commits linked to a Jira issue by Git Integration for Jira in the ${context.instanceType}: each commit's message, author, date, repository and branches, and optionally its changed files with lines added and deleted.`,
    inputSchema: z.object(schemas.getIssueCommits),
  }, async ({ issueKey, withFiles, offset, limit }) =>
    respond(() => git.getIssueCommits(issueKey, withFiles, offset, limit), 'Error fetching Git Integration commits'));

  tools.registerTool('gitintegration_getIssueBranches', {
    description: `Get a Jira issue's Git branches from Git Integration for Jira in the ${context.instanceType}, by repository, with how many commits each is ahead of and behind the main branch and a link to it.`,
    inputSchema: z.object(schemas.getIssueBranches),
  }, async ({ issueKey }) => respond(() => git.getIssueBranches(issueKey), 'Error fetching Git Integration branches'));

  tools.registerTool('gitintegration_getIssuePullRequests', {
    description: `Get a Jira issue's pull requests and merge requests from Git Integration for Jira in the ${context.instanceType}: title, state, source and target branches, author, reviewers and link.`,
    inputSchema: z.object(schemas.getIssuePullRequests),
  }, async ({ issueKey }) => respond(() => git.getIssuePullRequests(issueKey), 'Error fetching Git Integration pull requests'));

  tools.registerTool('gitintegration_getRepositories', {
    description: `List the Git repositories connected to Jira by Git Integration for Jira in the ${context.instanceType}, or to one project: name, origin, main branch, hosting service and when each was last indexed.`,
    inputSchema: z.object(schemas.getRepositories),
  }, async ({ projectKey, offset, limit }) => respond(() => git.getRepositories(projectKey, offset, limit), 'Error fetching Git Integration repositories'));
}
