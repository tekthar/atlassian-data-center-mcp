import { asArray, asRecord } from '../../tools/context.js';
import { userKeyOrMine } from '../user-key.js';
import { callTempoPlanner } from './client.js';
import { defined, hours } from './operations.js';

/*
 * Capacity is PlanScheduleResource's PlanDayScheduleBean: totalCapacity, totalPlannedHours and totalAvailability in
 * hours (PlanDaySchedule keeps seconds and divides by an hour), plannedPercentage as a percent, daySchedules with each
 * day's date, requiredSeconds, type and holiday, and planLogs with each day's timePlannedSeconds. Both dates are
 * yyyy-MM-dd. PlanDaySchedule counts the totals from today on: days before today are listed but not counted.
 */

const DAY_TYPES: Record<string, string> = {
  WORKING_DAY: 'working day', NON_WORKING_DAY: 'non-working day', HOLIDAY: 'holiday', HOLIDAY_AND_NON_WORKING_DAY: 'holiday',
};

const amount = (value: unknown) => (value === undefined || value === null || value === '' ? undefined : Number(value));

export interface CapacityQuery {
  from: string;
  to: string;
  users?: string[];
  teamId?: number;
}

function plannedByDay(planLogs: unknown): Map<string, number> {
  const planned = new Map<string, number>();
  for (const log of asArray(planLogs).map(asRecord)) {
    planned.set(String(log.day), (planned.get(String(log.day)) ?? 0) + Number(log.timePlannedSeconds ?? 0));
  }
  return planned;
}

function describeSchedule(value: unknown) {
  const schedule = asRecord(value);
  const planned = plannedByDay(schedule.planLogs);
  return defined({
    assignee: schedule.assigneeKey,
    capacityHours: amount(schedule.totalCapacity),
    plannedHours: amount(schedule.totalPlannedHours),
    availableHours: amount(schedule.totalAvailability),
    plannedPercent: amount(schedule.plannedPercentage),
    days: asArray(schedule.daySchedules).map(asRecord).map((day) => defined({
      date: day.date,
      type: DAY_TYPES[String(day.type)] ?? day.type,
      holiday: asRecord(day.holiday).name,
      requiredHours: hours(day.requiredSeconds),
      plannedHours: hours(planned.get(String(day.date)) ?? 0),
    })),
  });
}

/** Capacity, planned and available hours in a period, with each day, for people or a team; yours by default. */
export async function getCapacity({ from, to, users, teamId }: CapacityQuery) {
  if (teamId !== undefined) {
    const team = await callTempoPlanner({ method: 'GET', url: '/planSchedule/forTeam', query: { teamId, from, to } }, `Team ${teamId}'s schedule`);
    return { from, to, totalsCountFrom: 'today', team: { teamId, ...describeSchedule(team) } };
  }
  const assigneeKeys = users?.length ? users : [await userKeyOrMine(undefined)];
  const found = await callTempoPlanner({
    method: 'POST', url: '/planSchedule/users', body: { assigneeKeys, startDate: from, endDate: to, withPlanItemInfo: false },
  }, 'The schedules');
  return { from, to, totalsCountFrom: 'today', people: asArray(found).map(describeSchedule) };
}
