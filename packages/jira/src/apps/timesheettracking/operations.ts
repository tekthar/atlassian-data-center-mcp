import { asArray, asRecord } from '../../tools/context.js';
import { userKeyOrMine } from '../user-key.js';
import { callTimesheetTracking } from './client.js';

/*
 * Work plans are time planned on an issue for a person and a day, in seconds. The app's own query takes dates
 * as dd/MM/yyyy, includes the whole last day, lists only plans not yet completed, keeps those on issues the
 * caller may manage, and calls jql.isEmpty() without a null check, so the tool always sends jql.
 */

const hours = (seconds: unknown) => (typeof seconds === 'number' ? Math.round(seconds / 36) / 100 : undefined);
const appDate = (isoDate: string) => isoDate.split('-').reverse().join('/');
const person = (value: unknown) => {
  const user = asRecord(value);
  return user.displayName ?? user.username ?? user.key;
};

function describePlan(value: unknown) {
  const plan = asRecord(value);
  const issue = asRecord(plan.issue);
  return {
    id: plan.uniqueId ?? plan.id,
    issueKey: issue.key,
    summary: issue.summary,
    person: person(plan.author),
    userKey: asRecord(plan.author).key,
    started: plan.started,
    hours: hours(plan.timePlanned),
    ...(plan.comment ? { comment: plan.comment } : {}),
    ...(plan.recurrenceRuleId ? { recurring: true } : {}),
    ...(plan.isCompleted ? { completed: true, completedAt: plan.completedAt } : {}),
  };
}

const totalHours = (plans: Array<{ hours?: number }>) => Math.round(plans.reduce((sum, plan) => sum + (plan.hours ?? 0), 0) * 100) / 100;

export interface WorkPlanSearch {
  userKey?: string;
  startDate: string;
  endDate: string;
  jql?: string;
}

/** A person's planned work between two days, with the total hours. */
export async function getWorkPlans({ userKey, startDate, endDate, jql }: WorkPlanSearch) {
  const key = await userKeyOrMine(userKey);
  const found = await callTimesheetTracking({
    method: 'POST',
    url: '/workplan/get-workplans',
    body: { userKey: key, startedDate: appDate(startDate), endDate: appDate(endDate), jql: jql ?? '' },
  }, 'Work plans');
  const workPlans = asArray(found).map(describePlan);
  return { userKey: key, startDate, endDate, totalHours: totalHours(workPlans), workPlans };
}

/** Everyone's planned work on one issue. */
export async function getIssueWorkPlans(issueKey: string) {
  const found = await callTimesheetTracking({
    method: 'GET', url: '/workplan/get-issue-workplans', query: { issueKey },
  }, `Issue ${issueKey}'s work plans`);
  const workPlans = asArray(found).map(describePlan);
  return { issueKey, totalHours: totalHours(workPlans), workPlans };
}

function describeTimer(value: unknown) {
  const timer = asRecord(value);
  const issue = asRecord(timer.issue);
  return {
    issueKey: issue.key,
    summary: issue.summary,
    person: person(timer.user),
    userKey: asRecord(timer.user).key,
    started: timer.startedWithTimeZone ?? timer.started,
    ...(timer.isCompleted ? { stopped: true, stoppedAt: timer.completedAt } : {}),
  };
}

/** Running timers, everyone's for Jira administrators and your own otherwise, or the timers on one issue. */
export async function getTimers(issueKey?: string) {
  const found = await callTimesheetTracking(issueKey
    ? { method: 'POST', url: '/timer/get-issue-timers', body: { issueKey } }
    : { method: 'GET', url: '/timer' }, issueKey ? `Issue ${issueKey}'s timers` : 'The timers');
  return { ...(issueKey ? { issueKey } : {}), timers: asArray(found).map(describeTimer) };
}
