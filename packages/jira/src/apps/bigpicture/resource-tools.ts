import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as resources from './resource-operations.js';
import { bigPictureToolSchemas as schemas } from './schemas.js';

function registerSkillAndAbsenceTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('bigpicture_getSkills', {
    description: `List the skills defined in BigPicture's resource planning in the ${context.instanceType}, with each one's id, code and name.`,
    inputSchema: z.object(schemas.getSkills),
  }, async () => respond(() => resources.getSkills(), 'Error fetching BigPicture skills'));

  tools.registerTool('bigpicture_getPersonSkills', {
    description: `Get the skills a person (a BigPicture resource) has in the ${context.instanceType}, with the dates each applies from and to.`,
    inputSchema: z.object(schemas.getPersonSkills),
  }, async ({ individualId }) => respond(() => resources.getPersonSkills(individualId), 'Error fetching BigPicture person skills'));

  tools.registerTool('bigpicture_getPersonAbsences', {
    description: `Get a person's absences in BigPicture's resource planning in the ${context.instanceType}: each absence's dates, type, comment and how unavailable it makes them.`,
    inputSchema: z.object(schemas.getPersonAbsences),
  }, async ({ individualId }) => respond(() => resources.getPersonAbsences(individualId), 'Error fetching BigPicture absences'));
}

function registerPlanTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('bigpicture_getHolidayPlans', {
    description: `List BigPicture's holiday plans in the ${context.instanceType}, or get one by id: its fixed and floating holidays, extra working days and non-working weekdays.`,
    inputSchema: z.object(schemas.getHolidayPlans),
  }, async ({ holidayPlanId }) => respond(() => resources.getHolidayPlans(holidayPlanId), 'Error fetching BigPicture holiday plans'));

  tools.registerTool('bigpicture_getHolidayPlanPeople', {
    description: `List the people (BigPicture resources) a holiday plan applies to in the ${context.instanceType}, with each one's resourceKey, name and the dates the plan applies.`,
    inputSchema: z.object(schemas.getHolidayPlanPeople),
  }, async ({ holidayPlanId }) => respond(() => resources.getHolidayPlanPeople(holidayPlanId), 'Error fetching BigPicture holiday plan people'));

  tools.registerTool('bigpicture_getWorkloadPlans', {
    description: `List BigPicture's workload plans in the ${context.instanceType}, or get one by id: the working hours for each weekday and the weekly maximum.`,
    inputSchema: z.object(schemas.getWorkloadPlans),
  }, async ({ workloadPlanId }) => respond(() => resources.getWorkloadPlans(workloadPlanId), 'Error fetching BigPicture workload plans'));

  tools.registerTool('bigpicture_getWorkloadPlanPeople', {
    description: `List the people (BigPicture resources) a workload plan applies to in the ${context.instanceType}, with each one's resourceKey, name, the dates and their efficiency.`,
    inputSchema: z.object(schemas.getWorkloadPlanPeople),
  }, async ({ workloadPlanId }) => respond(() => resources.getWorkloadPlanPeople(workloadPlanId), 'Error fetching BigPicture workload plan people'));
}

function registerCapacityTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('bigpicture_getCapacity', {
    description: `Get how much working time people have between two dates in the ${context.instanceType}, from BigPicture's holiday plans, workload plans and absences. Give Jira user keys. Returns each person's total in seconds and in hours, optionally day by day, and the keys BigPicture doesn't know.`,
    inputSchema: z.object(schemas.getCapacity),
  }, async ({ userKeys, startDate, endDate, daily }) =>
    respond(() => resources.getCapacity(userKeys, startDate, endDate, daily ?? false), 'Error fetching BigPicture capacity'));
}

export function registerBigPictureResourceTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerSkillAndAbsenceTools(tools, context);
  registerPlanTools(tools, context);
  registerCapacityTool(tools, context);
}
