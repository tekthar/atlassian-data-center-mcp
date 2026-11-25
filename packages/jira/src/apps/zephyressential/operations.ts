import { IssueService } from '../../jira-client/index.js';
import { asArray, asRecord } from '../../tools/context.js';
import { callZephyrEssential } from './client.js';

/*
 * The answers are ZAPI's JAXB beans: ZQLSearchResultBean with ZQLScheduleBean executions, TeststepBeanWrapper with
 * TeststepBean steps, and StepResultBean results, whose status is an id that their executionStatus lists name.
 */

export const defined = (entries: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined && value !== null && value !== ''));

/** Defect keys from a list of defect beans or of bare keys. */
export const defectKeys = (value: unknown) =>
  asArray(value).map((defect) => (typeof defect === 'string' ? defect : asRecord(defect).key)).filter(Boolean);

/** The defect keys, or nothing when there are none, so the answer leaves them out. */
export const defectsIfAny = (value: unknown) => (defectKeys(value).length ? defectKeys(value) : undefined);

function describeExecution(value: unknown) {
  const execution = asRecord(value);
  return defined({
    id: execution.id,
    issueKey: execution.issueKey,
    summary: execution.issueSummary,
    projectKey: execution.projectKey,
    version: execution.versionName,
    cycle: execution.cycleName,
    folder: execution.folderName,
    status: asRecord(execution.status).name,
    executedOn: execution.executedOn,
    executedBy: execution.executedByDisplay ?? execution.executedBy,
    assignee: execution.assigneeDisplay,
    comment: execution.comment,
    defects: defectsIfAny(execution.defects),
  });
}

/** Test executions a ZQL query finds, a page at a time. */
export async function searchExecutions(zql: string, offset = 0, limit = 20) {
  const found = asRecord(await callZephyrEssential({
    method: 'GET', url: '/zql/executeSearch', query: { zqlQuery: zql, offset, maxRecords: limit },
  }, 'The execution search'));
  const executions = asArray(found.executions).map(describeExecution);
  const total = typeof found.totalCount === 'number' ? found.totalCount : executions.length;
  return { total, offset, executions, ...(offset + executions.length < total ? { nextOffset: offset + executions.length } : {}) };
}

/** A test's steps in order: what to do, with what data, and what to expect. */
export async function getTestSteps(issueKey: string) {
  const issueId = asRecord(await IssueService.getIssue1(issueKey, undefined, 'summary')).id;
  const found = await callZephyrEssential({ method: 'GET', url: '/teststep/{issueId}', path: { issueId } }, `Test ${issueKey}'s steps`);
  const steps = Array.isArray(found) ? found : asArray(asRecord(found).stepBeanCollection);
  return {
    issueKey,
    steps: steps.map((step) => {
      const { id, orderId, step: action, data, result } = asRecord(step);
      return defined({ id, orderId, step: action, data, result });
    }),
  };
}

/** Each step's result in one execution, with the status by name. */
export async function getStepResults(executionId: number) {
  const found = asArray(await callZephyrEssential({
    method: 'GET', url: '/stepResult', query: { executionId },
  }, `Execution ${executionId}'s step results`)).map(asRecord);
  const statuses = new Map(found.flatMap((result) => asArray(result.executionStatus).map(asRecord))
    .map((status) => [String(status.id), status.name]));
  return {
    executionId,
    stepResults: found.map((result) => defined({
      id: result.id,
      stepId: result.stepId,
      orderId: result.orderId,
      step: result.step,
      status: statuses.get(String(result.status)) ?? result.status,
      comment: result.comment,
      defects: defectsIfAny(result.defects),
    })),
  };
}
