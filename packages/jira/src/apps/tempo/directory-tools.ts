import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as directory from './directory-operations.js';
import { tempoDirectorySchemas as schemas } from './directory-schemas.js';

function registerAccountTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('tempo_getAccounts', {
    description: `List the Tempo accounts time is logged against in the ${context.instanceType}: each one's id, key, name, status, lead, customer, category and whether it is global. Archived accounts are left out unless asked for.`,
    inputSchema: z.object(schemas.getAccounts),
  }, async ({ includeArchived }) => respond(() => directory.getAccounts(includeArchived ?? false), 'Error fetching Tempo accounts'));

  tools.registerTool('tempo_getAccount', {
    description: `Get one Tempo account from the ${context.instanceType} by its key: name, status, lead, contact, customer, category, monthly budget and the projects it is linked to.`,
    inputSchema: z.object(schemas.getAccount),
  }, async ({ accountKey }) => respond(() => directory.getAccount(accountKey), 'Error fetching Tempo account'));

  tools.registerTool('tempo_getIssueAccount', {
    description: `Get the Tempo account a Jira issue's time is logged against in the ${context.instanceType} today.`,
    inputSchema: z.object(schemas.getIssueAccount),
  }, async ({ issueKey }) => respond(() => directory.getIssueAccount(issueKey), 'Error fetching the Tempo account of the issue'));
}

function registerTeamTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('tempo_getTeams', {
    description: `List the Tempo teams you can see in the ${context.instanceType}: each one's id, name, summary, lead and program. Use a team's id with tempo_searchWorklogs or tempo_getTeamTimesheetApprovals.`,
    inputSchema: z.object(schemas.getTeams),
  }, async () => respond(() => directory.getTeams(), 'Error fetching Tempo teams'));

  tools.registerTool('tempo_getTeam', {
    description: `Get one Tempo team from the ${context.instanceType} by id: its name, mission, summary, lead and program.`,
    inputSchema: z.object(schemas.getTeam),
  }, async ({ teamId }) => respond(() => directory.getTeam(teamId), 'Error fetching Tempo team'));

  tools.registerTool('tempo_getTeamMembers', {
    description: `List a Tempo team's members in the ${context.instanceType}, each with their role, availability and membership dates. Only current members unless asked for all.`,
    inputSchema: z.object(schemas.getTeamMembers),
  }, async ({ teamId, includeInactive }) => respond(() => directory.getTeamMembers(teamId, includeInactive ?? false), 'Error fetching Tempo team members'));

  tools.registerTool('tempo_getUserTeams', {
    description: `List the Tempo teams a person belongs to in the ${context.instanceType}, with their role and availability in each, optionally between two dates.`,
    inputSchema: z.object(schemas.getUserTeams),
  }, async ({ userName, from, to }) => respond(() => directory.getUserTeams(userName, from, to), 'Error fetching the Tempo teams of the user'));
}

export function registerTempoDirectoryTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerAccountTools(tools, context);
  registerTeamTools(tools, context);
}
