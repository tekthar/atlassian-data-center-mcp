import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as bigPicture from './operations.js';
import { bigPictureToolSchemas as schemas } from './schemas.js';

function registerBoxTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('bigpicture_getBoxHierarchy', {
    description: `Get BigPicture's box hierarchy in the ${context.instanceType}: its portfolios, programs, projects and iterations as a tree, each with its id, type, status, dates and leader. Archived boxes are left out unless asked for.`,
    inputSchema: z.object(schemas.getBoxHierarchy),
  }, async ({ includeArchived }) => respond(() => bigPicture.getBoxHierarchy(includeArchived ?? false), 'Error fetching the BigPicture box hierarchy'));

  tools.registerTool('bigpicture_getBox', {
    description: `Get one BigPicture box from the ${context.instanceType} by id: its name, type, status, dates, leader and description.`,
    inputSchema: z.object(schemas.getBox),
  }, async ({ boxId }) => respond(() => bigPicture.getBox(boxId), 'Error fetching BigPicture box'));

  tools.registerTool('bigpicture_getBoxTypesAndStatuses', {
    description: `List the BigPicture box types (such as portfolio, program, project, iteration) and box statuses configured in the ${context.instanceType}, to read the type and status ids boxes carry.`,
    inputSchema: z.object(schemas.getBoxTypesAndStatuses),
  }, async () => respond(() => bigPicture.getBoxTypesAndStatuses(), 'Error fetching BigPicture box types and statuses'));
}

function registerIssueTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('bigpicture_getIssueBoxes', {
    description: `Find which BigPicture boxes a Jira issue is in, in the ${context.instanceType}: the portfolio, program, project or iteration that plans the issue.`,
    inputSchema: z.object(schemas.getIssueBoxes),
  }, async ({ issueKey }) => respond(() => bigPicture.getIssueBoxes(issueKey), 'Error fetching the BigPicture boxes of the issue'));

  tools.registerTool('bigpicture_getIssueFields', {
    description: `Get a Jira issue's BigPicture fields in the ${context.instanceType}, such as its planned start and end dates and progress. Name the fields to read only those; bigpicture_getAvailableFields lists them.`,
    inputSchema: z.object(schemas.getIssueFields),
  }, async ({ issueKey, fieldNames }) => respond(() => bigPicture.getIssueFields(issueKey, fieldNames), 'Error fetching BigPicture issue fields'));

  tools.registerTool('bigpicture_getAvailableFields', {
    description: `List the fields BigPicture keeps for Jira issues in the ${context.instanceType}, such as planned dates and progress, with their names and types.`,
    inputSchema: z.object(schemas.getAvailableFields),
  }, async () => respond(() => bigPicture.getAvailableFields(), 'Error fetching BigPicture issue fields'));
}

function registerTeamTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('bigpicture_getBoxTeams', {
    description: `List the BigPicture teams working in boxes in the ${context.instanceType}, with their ids for bigpicture_getTeamMembers.`,
    inputSchema: z.object(schemas.getBoxTeams),
  }, async ({ boxIds }) => respond(() => bigPicture.getBoxTeams(boxIds), 'Error fetching BigPicture box teams'));

  tools.registerTool('bigpicture_getGlobalTeams', {
    description: `List BigPicture's global teams in the ${context.instanceType}: the teams shared across boxes.`,
    inputSchema: z.object(schemas.getGlobalTeams),
  }, async () => respond(() => bigPicture.getGlobalTeams(), 'Error fetching BigPicture global teams'));

  tools.registerTool('bigpicture_getTeamMembers', {
    description: `List the members of a BigPicture team in the ${context.instanceType}, optionally in one box, with their roles and allocation.`,
    inputSchema: z.object(schemas.getTeamMembers),
  }, async ({ teamId, boxId }) => respond(() => bigPicture.getTeamMembers(teamId, boxId), 'Error fetching BigPicture team members'));
}

export function registerBigPictureReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerBoxTools(tools, context);
  registerIssueTools(tools, context);
  registerTeamTools(tools, context);
}
