import { z } from 'zod';
import { invalidInput, type PolicyRegistrar, respond } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as behaviours from './behaviour-operations.js';
import { behaviourToolSchemas as schemas } from './behaviour-schemas.js';

const AFFECTS_EVERYONE = 'It changes the create, edit and transition screens of everyone who uses the mapped projects.';

/** Why a mapping can't be sent as given, or undefined when it can. */
function mappingProblem(mapping: behaviours.MappingInput): string | undefined {
  if (mapping.type === 'SERVICEDESK') {
    return mapping.serviceDesk !== undefined && mapping.requestTypes?.length ? undefined : 'A SERVICEDESK mapping needs serviceDesk and requestTypes.';
  }
  return mapping.projectIds?.length ? undefined : 'A PROJECT mapping needs projectIds.';
}

/** Why an unmapping can't be sent as given: it must name both ids of one mapping. */
function unmapProblem(input: behaviours.UnmapInput): string | undefined {
  if (input.type === 'SERVICEDESK') {
    return input.serviceDeskId !== undefined && input.requestTypeId !== undefined ? undefined : 'Give serviceDeskId and requestTypeId of the mapping to remove.';
  }
  return input.projectId !== undefined && input.issueTypeId !== undefined ? undefined : 'Give projectId and issueTypeId of the mapping to remove.';
}

function registerSaveTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('scriptrunner_saveBehaviour', {
    description: `Create a ScriptRunner behaviour in the ${context.instanceType}, or replace one: its name, initialiser script and the rules and scripts of each field. Replacing sends the whole behaviour, so get it with scriptrunner_getBehaviours first and send it back changed. ${AFFECTS_EVERYONE}`,
    inputSchema: z.object(schemas.saveBehaviour),
  }, async ({ behaviour }) => {
    if (behaviour.id !== undefined && behaviour.fields === undefined) {
      return invalidInput('To replace a behaviour, send its fields too, as scriptrunner_getBehaviours returns them; a behaviour saved without them loses its field rules.');
    }
    return respond(() => behaviours.saveBehaviour(behaviour), 'Error saving ScriptRunner behaviour');
  });
}

function registerEnableTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('scriptrunner_setBehaviourEnabled', {
    description: `Switch a ScriptRunner behaviour on or off in the ${context.instanceType}. Switching off keeps it and its mappings. ${AFFECTS_EVERYONE}`,
    inputSchema: z.object(schemas.setBehaviourEnabled),
  }, async ({ id, enabled }) => respond(() => behaviours.setBehaviourEnabled(id, enabled), 'Error switching ScriptRunner behaviour'));
}

function registerMappingTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('scriptrunner_mapBehaviour', {
    description: `Apply a ScriptRunner behaviour in the ${context.instanceType} to projects and issue types, or to a service desk's request types. ${AFFECTS_EVERYONE}`,
    inputSchema: z.object(schemas.mapBehaviour),
  }, async ({ behaviourId, type, ...rest }) => {
    const mapping = { type: type ?? 'PROJECT' as const, ...rest };
    const problem = mappingProblem(mapping);
    return problem ? invalidInput(problem) : respond(() => behaviours.mapBehaviour(behaviourId, mapping), 'Error mapping ScriptRunner behaviour');
  });

  tools.registerTool('scriptrunner_unmapBehaviour', {
    description: `Stop a ScriptRunner behaviour applying to one project and issue type, or one service desk request type, in the ${context.instanceType}. Name the mapping as scriptrunner_getBehaviours shows it.`,
    inputSchema: z.object(schemas.unmapBehaviour),
  }, async ({ behaviourId, type, ...rest }) => {
    const input = { type: type ?? 'PROJECT' as const, ...rest };
    const problem = unmapProblem(input);
    return problem ? invalidInput(problem) : respond(() => behaviours.unmapBehaviour(behaviourId, input), 'Error unmapping ScriptRunner behaviour');
  });
}

export function registerBehaviourEditTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerSaveTool(tools, context);
  registerEnableTool(tools, context);
  registerMappingTools(tools, context);
}
