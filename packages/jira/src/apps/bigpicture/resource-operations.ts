import { stripNoise } from '../../tools/context.js';
import { callBigPicture } from './client.js';

/*
 * BigPicture's resource planning: the people it plans with (resources, named by individualId), their
 * skills and absences, the holiday and workload plans that set their working days and hours, and the
 * capacity those give them.
 */

const get = async (url: string, subject: string, path?: Record<string, string | number>) =>
  stripNoise(await callBigPicture({ method: 'GET', url, path }, subject));

export const getSkills = () => get('/ppm/skills', 'The skills');

export const getPersonSkills = (individualId: string) =>
  get('/ppm/resources/{individualId}/skills', `Person ${individualId}`, { individualId });

export const getPersonAbsences = (individualId: string) =>
  get('/ppm/resources/{individualId}/absences', `Person ${individualId}`, { individualId });

export const getHolidayPlans = (holidayPlanId?: number) => (holidayPlanId === undefined
  ? get('/ppm/holiday-plans', 'The holiday plans')
  : get('/ppm/holiday-plans/{holidayPlanId}', `Holiday plan ${holidayPlanId}`, { holidayPlanId }));

export const getHolidayPlanPeople = (holidayPlanId: number) =>
  get('/ppm/resources/holiday-plans/{holidayPlanId}/assigned-resources', `Holiday plan ${holidayPlanId}`, { holidayPlanId });

export const getWorkloadPlans = (workloadPlanId?: number) => (workloadPlanId === undefined
  ? get('/ppm/workload-plans', 'The workload plans')
  : get('/ppm/workload-plans/{workloadPlanId}', `Workload plan ${workloadPlanId}`, { workloadPlanId }));

export const getWorkloadPlanPeople = (workloadPlanId: number) =>
  get('/ppm/resources/workload-plans/{workloadPlanId}/assigned-resources', `Workload plan ${workloadPlanId}`, { workloadPlanId });

interface PersonCapacity {
  userKey?: string;
  sum?: number;
  [field: string]: unknown;
}

interface CapacityResponse {
  capacityInSeconds?: PersonCapacity[];
  [field: string]: unknown;
}

const toHours = (seconds: number) => Math.round(seconds / 36) / 100;

/** Each person's working time in the period, as BigPicture gives it in seconds, with the total also in hours. */
export async function getCapacity(userKeys: string[], startDate: string, endDate: string, daily: boolean) {
  const capacity = await callBigPicture<CapacityResponse>({
    method: 'POST', url: '/ppm/resources/capacity', body: { userKeys, startDate, endDate, provideDailyValues: daily },
  }, 'The capacity');
  const people = (capacity?.capacityInSeconds ?? [])
    .map((person) => (typeof person.sum === 'number' ? { ...person, hours: toHours(person.sum) } : person));
  return stripNoise({ ...capacity, capacityInSeconds: people });
}
