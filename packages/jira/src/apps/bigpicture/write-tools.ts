import { z } from 'zod';
import { invalidInput, respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as bigPicture from './write-operations.js';
import { bigPictureWriteSchemas as schemas } from './write-schemas.js';

function registerIssueWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('bigpicture_updateIssueField', {
    description: `Set one of a Jira issue's BigPicture fields in the ${context.instanceType}, such as its baseline dates, progress or story points. Get the field's name and dataType from bigpicture_getAvailableFields, and its current value from bigpicture_getIssueFields.`,
    inputSchema: z.object(schemas.updateIssueField),
  }, async ({ issueKey, fieldName, dataType, value }) => {
    const fieldValue = bigPicture.fieldValueJson(dataType, value);
    if ('error' in fieldValue) return invalidInput(fieldValue.error);
    return respond(() => bigPicture.updateIssueField(issueKey, fieldName, dataType, fieldValue.json), 'Error updating BigPicture field');
  });
}

function registerBoxWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('bigpicture_addBox', {
    description: `Add a BigPicture box in the ${context.instanceType}: a portfolio, program, project or iteration under a parent box, with its dates. It starts as not started. Returns the new box's id.`,
    inputSchema: z.object(schemas.addBox),
  }, async (input) => respond(() => bigPicture.addBox(input), 'Error adding BigPicture box'));
}

function registerTeamWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('bigpicture_addTeamMember', {
    description: `Add a person to a BigPicture team in the ${context.instanceType} from a start date, with the share of their time they give it. Returns the team with its members.`,
    inputSchema: z.object(schemas.addTeamMember),
  }, async (input) => respond(() => bigPicture.addTeamMember(input), 'Error adding BigPicture team member'));

  tools.registerTool('bigpicture_updateTeamMember', {
    description: `Change one period of a person's BigPicture team membership in the ${context.instanceType}: its start date or the share of their time they give the team. Find the period with bigpicture_getTeamMembers.`,
    inputSchema: z.object(schemas.updateTeamMember),
  }, async (input) => respond(() => bigPicture.updateTeamMember(input), 'Error updating BigPicture team member'));

  tools.registerTool('bigpicture_removeTeamMember', {
    description: `Remove a person from a BigPicture team in the ${context.instanceType}, with every period of their membership. Their planned availability for the team is lost.`,
    inputSchema: z.object(schemas.removeTeamMember),
  }, async ({ teamId, individualId, boxId }) =>
    respond(() => bigPicture.removeTeamMember(teamId, individualId, boxId), 'Error removing BigPicture team member'));
}

export function registerBigPictureWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerIssueWriteTools(tools, context);
  registerBoxWriteTools(tools, context);
  registerTeamWriteTools(tools, context);
}
