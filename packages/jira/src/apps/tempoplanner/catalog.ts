import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * The planning toolset is off by default and offered through the tool search once Tempo's planning API is found,
 * whether Capacity Planner or Tempo Timesheets serves it. Tempo decides whose plans each user sees.
 */
export const TEMPO_PLANNER_CATALOG: ToolCatalog = {
  toolsets: {
    tempoplanner_plans: { description: 'Tempo Capacity Planner: plans (allocated time) by person, team, issue or project, capacity and availability, and plans awaiting your approval', default: false },
  },
  tools: {
    tempoplanner_getPlans: { toolset: 'tempoplanner_plans', access: 'read' },
    tempoplanner_getPlan: { toolset: 'tempoplanner_plans', access: 'read' },
    tempoplanner_getPlansForReview: { toolset: 'tempoplanner_plans', access: 'read' },
    tempoplanner_getCapacity: { toolset: 'tempoplanner_plans', access: 'read' },
  },
};
