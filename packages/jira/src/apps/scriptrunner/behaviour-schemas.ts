import { z } from 'zod';

const behaviourId = z.string().min(1).describe('The behaviour\'s id, from scriptrunner_getBehaviours');

const mappingType = z.enum(['PROJECT', 'SERVICEDESK']).optional()
  .describe('PROJECT maps projects and issue types (default); SERVICEDESK maps a service desk\'s request types');

const ids = (what: string) => z.array(z.number().int()).min(1).optional().describe(`${what} ids`);

export const behaviourToolSchemas = {
  saveBehaviour: {
    behaviour: z.looseObject({
      id: z.string().min(1).optional().describe('The behaviour to replace; leave out to create one'),
      name: z.string().min(1).describe('The behaviour\'s name'),
      description: z.string().optional(),
      disabled: z.boolean().optional().describe('True to save it switched off'),
      guideWorkflow: z.string().optional().describe('Workflow whose transitions the field rules may name'),
      init: z.record(z.string(), z.unknown()).optional().describe('The initialiser script, as scriptrunner_getBehaviours returns it'),
      fields: z.array(z.record(z.string(), z.unknown())).optional()
        .describe('Every field the behaviour controls, with its rules and scripts, as scriptrunner_getBehaviours returns them'),
    }).describe('The whole behaviour. To change one, get it with scriptrunner_getBehaviours, change it, and send all of it back'),
  },
  setBehaviourEnabled: {
    id: behaviourId,
    enabled: z.boolean().describe('True to switch the behaviour on, false to switch it off'),
  },
  mapBehaviour: {
    behaviourId,
    type: mappingType,
    projectIds: ids('Project'),
    issueTypeIds: ids('Issue type'),
    serviceDesk: z.number().int().optional().describe('Service desk id, for SERVICEDESK'),
    requestTypes: ids('Request type'),
  },
  unmapBehaviour: {
    behaviourId,
    type: mappingType,
    projectId: z.number().int().optional().describe('The mapping\'s project id, for PROJECT'),
    issueTypeId: z.number().int().optional().describe('The mapping\'s issue type id, for PROJECT'),
    serviceDeskId: z.number().int().optional().describe('The mapping\'s service desk id, for SERVICEDESK'),
    requestTypeId: z.number().int().optional().describe('The mapping\'s request type id, for SERVICEDESK'),
  },
};
