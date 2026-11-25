import { asArray, asRecord } from '../../tools/context.js';
import { callZephyrEssential } from './client.js';
import { defectsIfAny, defined } from './operations.js';

/*
 * Results are saved as ZAPI's ScheduleResourceDelegateImpl.editExecution and StepResultResource.updateStepResult
 * read them: `status` is a status id as a string, `comment` is plain text, and `defectList` replaces the linked
 * defects when `updateDefectList` is "true". Both answer the saved bean with its status as an id again.
 */

const EDIT_EXECUTIONS = 'It needs you to browse the test\'s project and, when Zephyr\'s own permissions are turned on, to edit executions there.';

type StatusList = 'testExecutionStatus' | 'teststepExecutionStatus';

interface Status {
  id: string;
  name: string;
}

export interface ResultInput {
  status: string;
  comment?: string;
  defects?: string[];
}

async function statusesOf(list: StatusList): Promise<Status[]> {
  const found = asArray(await callZephyrEssential({ method: 'GET', url: `/util/${list}` }, 'Zephyr Essential\'s status list'));
  return found.map(asRecord).map((status) => ({ id: String(status.id), name: String(status.name) }));
}

/** The status's id, from its name in any case or from its id; Zephyr's own names are listed when neither matches. */
function statusIdOf(statuses: Status[], status: string): string {
  const match = statuses.find((known) => known.id === status.trim() || known.name.toLowerCase() === status.trim().toLowerCase());
  if (!match) throw new Error(`Zephyr Essential has no status "${status}" here. Use one of: ${statuses.map((known) => known.name).join(', ')}.`);
  return match.id;
}

const nameOf = (statuses: Status[], id: unknown) => statuses.find((known) => known.id === String(id))?.name ?? id;

const resultBody = (statusId: string, { comment, defects }: ResultInput) =>
  defined({ status: statusId, comment, ...(defects ? { defectList: defects, updateDefectList: 'true' } : {}) });

/** Records a test execution's status, with an optional comment and the defects to link. */
export async function recordResult(executionId: number, input: ResultInput) {
  const statuses = await statusesOf('testExecutionStatus');
  const saved = asRecord(await callZephyrEssential({
    method: 'PUT', url: '/execution/{id}/execute', path: { id: executionId }, body: resultBody(statusIdOf(statuses, input.status), input),
  }, `Execution ${executionId}`, EDIT_EXECUTIONS));
  return defined({
    id: saved.id ?? executionId,
    issueKey: saved.issueKey,
    cycle: saved.cycleName,
    folder: saved.folderName,
    status: nameOf(statuses, saved.executionStatus),
    executedBy: saved.executedByDisplay ?? saved.executedBy,
    executedOn: saved.executedOn,
    comment: saved.comment,
    defects: defectsIfAny(saved.defects),
  });
}

/** Records one step's status in an execution, with an optional comment and the defects to link. */
export async function recordStepResult(stepResultId: number, input: ResultInput) {
  const statuses = await statusesOf('teststepExecutionStatus');
  const saved = asRecord(await callZephyrEssential({
    method: 'PUT', url: '/stepResult/{id}', path: { id: stepResultId }, body: resultBody(statusIdOf(statuses, input.status), input),
  }, `Step result ${stepResultId}`, EDIT_EXECUTIONS));
  return defined({
    id: saved.id ?? stepResultId,
    executionId: saved.executionId,
    stepId: saved.stepId,
    status: nameOf(statuses, saved.status),
    executedBy: saved.executedBy,
    comment: saved.comment,
    defects: defectsIfAny(saved.defectList),
  });
}
