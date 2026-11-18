import { stripNoise } from '../../tools/context.js';
import { callBigPicture } from './client.js';

/*
 * BigPicture answers which tasks a box plans with its own task ids, so the Jira issue behind each is read
 * with its bulk field read: by default the task's Key and Summary, which BigPicture keeps for every task.
 * Both routes are POSTs that only read.
 */
export const DEFAULT_ISSUE_FIELDS = ['Key', 'Summary'];

interface BoxTask {
  taskId?: string;
  childTaskIds?: string[];
}

interface TaskFields {
  taskId?: string;
  fields?: Array<{ name?: string; value?: unknown }>;
}

/** A field value as BigPicture sends it, such as `{ dataTypeId, value }` or `{ dataTypeId, number }`, reduced to the value. */
export function plainValue(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const { dataTypeId: _type, ...rest } = value as Record<string, unknown>;
  const keys = Object.keys(rest);
  if (keys.length === 1 && (keys[0] === 'value' || keys[0] === 'number')) return rest[keys[0]];
  return rest;
}

async function boxTasks(boxId: string): Promise<BoxTask[]> {
  const scope = await callBigPicture<{ taskInBoxes?: Array<{ boxId?: string; tasks?: BoxTask[] }> }>({
    method: 'POST', url: '/ppm/boxarea/task/scope', body: { boxIds: [boxId] },
  }, `Box ${boxId}`);
  return (scope?.taskInBoxes ?? []).find((box) => box.boxId === boxId)?.tasks ?? [];
}

async function taskFields(taskIds: string[], fieldNames: string[]): Promise<Map<string, Record<string, unknown>>> {
  const answer = await callBigPicture<{ tasksFields?: TaskFields[] }>({
    method: 'POST', url: '/ppm/task/core/task/field/bulk', body: { taskIdOrExtPlatformTaskKeys: taskIds, fieldNames },
  }, 'The BigPicture fields of the box\'s issues');
  return new Map((answer?.tasksFields ?? []).map((task) => [String(task.taskId),
    Object.fromEntries((task.fields ?? []).map((field) => [String(field.name), plainValue(field.value)]))]));
}

export interface BoxIssuesPage {
  boxId: string;
  fieldNames?: string[];
  startAt?: number;
  limit?: number;
}

/** A page of the issues a box plans, each with the fields asked for and its sub-tasks' task ids. */
export async function getBoxIssues({ boxId, fieldNames, startAt = 0, limit }: BoxIssuesPage, pageSize: number) {
  const tasks = await boxTasks(boxId);
  const page = tasks.slice(startAt, startAt + (limit ?? pageSize)).filter((task) => task.taskId !== undefined);
  const fields = page.length ? await taskFields(page.map((task) => String(task.taskId)), fieldNames?.length ? fieldNames : DEFAULT_ISSUE_FIELDS) : new Map();
  const issues = page.map(({ taskId, childTaskIds }) => ({
    taskId,
    fields: fields.get(String(taskId)) ?? {},
    ...(childTaskIds?.length ? { childTaskIds } : {}),
  }));
  return stripNoise({ boxId, total: tasks.length, startAt, issues });
}
