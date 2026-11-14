import { stripNoise } from '../../tools/context.js';
import { callBigPicture } from './client.js';

type Body = Record<string, unknown>;
export type FieldValue = string | number | boolean | Record<string, unknown>;

/** BigPicture's own default box icon. Its API needs an icon and has no default of its own. */
export const DEFAULT_BOX_ICON = 'font-awesome-box-open@lightPurple';

/** The body without the fields left out, so BigPicture keeps its own defaults. */
const defined = (body: Body): Body => Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));

const send = async (method: 'POST' | 'PUT', url: string, subject: string, body: Body, path?: Record<string, string | number>) =>
  stripNoise(await callBigPicture({ method, url, path, body: defined(body) }, subject));

interface ScalarType {
  key: 'value' | 'number';
  fits: (value: unknown) => boolean;
  expected: string;
}

const isString = (value: unknown) => typeof value === 'string';
const isNumber = (value: unknown) => typeof value === 'number';

/*
 * BigPicture reads a field's new value as a JSON string holding the type's value object, the shape a
 * field read returns: `{"value": ...}` for text, dates and yes/no, `{"number": ...}` for numbers and
 * percentages. A plain value is wrapped only for these types: BigPicture reads the JSON with Gson, which
 * skips keys a type doesn't have, so a value of the wrong kind would arrive as an empty one.
 */
const SCALAR_TYPES = new Map<string, ScalarType>([
  ['STRING', { key: 'value', fits: isString, expected: 'a string' }],
  ['DATE', { key: 'value', fits: (value) => isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value as string), expected: 'a date such as "2026-11-16"' }],
  ['BOOLEAN', { key: 'value', fits: (value) => typeof value === 'boolean', expected: 'true or false' }],
  ['NUMBER', { key: 'number', fits: isNumber, expected: 'a number' }],
  ['PERCENTAGE', { key: 'number', fits: isNumber, expected: 'a number' }],
]);

/** The JSON BigPicture reads as a field's value, or why the value doesn't fit the field's type. */
export function fieldValueJson(dataType: string, value: FieldValue): { json: string } | { error: string } {
  if (typeof value === 'object') return { json: JSON.stringify(value) };
  const scalar = SCALAR_TYPES.get(dataType);
  if (!scalar) return { error: `Give the value of a ${dataType} field as an object, in the shape bigpicture_getIssueFields returns it.` };
  if (!scalar.fits(value)) return { error: `A ${dataType} value must be ${scalar.expected}.` };
  return { json: JSON.stringify({ [scalar.key]: value }) };
}

export async function updateIssueField(issueKey: string, fieldName: string, dataType: string, valueJson: string) {
  await callBigPicture({
    method: 'PUT', url: '/ppm/task/core/task/{issueKey}/field', path: { issueKey },
    body: { fieldName, fieldValue: valueJson, dataTypeId: dataType },
  }, `Issue ${issueKey}`);
  return { updated: true, issueKey, fieldName };
}

export interface BoxInput {
  parentBoxId: string;
  boxTypeId: string;
  name: string;
  startDate: string;
  endDate: string;
  iconId?: string;
}

export const addBox = ({ parentBoxId, boxTypeId, name, startDate, endDate, iconId }: BoxInput) =>
  send('POST', '/ppm/box', `Box ${parentBoxId}`, {
    parentBoxId, boxTypeId, boxName: name, boxStartDate: startDate, boxEndDate: endDate, boxIconId: iconId ?? DEFAULT_BOX_ICON,
  });

export interface MembershipInput extends Body {
  teamId: number;
  boxId?: string;
  individualId: string;
  startDate: string;
}

const MEMBERSHIPS = '/ppm/team/{teamId}/memberships';

/*
 * A membership is a series of periods, each starting on a date with an availability that lasts until
 * the next one; BigPicture ignores an end date when one is added.
 */
export const addTeamMember = ({ teamId, boxId, ...membership }: MembershipInput) =>
  send('POST', MEMBERSHIPS, `Team ${teamId}`, { boxId, membership: defined(membership) }, { teamId });

export const updateTeamMember = ({ teamId, boxId, ...membership }: MembershipInput) =>
  send('PUT', MEMBERSHIPS, `Team ${teamId}`, { boxId, membership: defined(membership) }, { teamId });

export async function removeTeamMember(teamId: number, individualId: string, boxId?: string) {
  return stripNoise(await callBigPicture({
    method: 'DELETE', url: `${MEMBERSHIPS}/{individualId}`, path: { teamId, individualId }, query: { boxId },
  }, `Team ${teamId}`));
}
