import { stripNoise } from '../../tools/context.js';
import { callTempo, type TempoApi } from './client.js';

/* Tempo's accounts, which time is logged against, and its teams, from Tempo's bundled Accounts and Teams apps. */

type Query = Record<string, string | boolean | undefined>;

const get = async (api: TempoApi, url: string, subject: string, path?: Record<string, string | number>, query?: Query) =>
  stripNoise(await callTempo({ method: 'GET', url, path, query }, subject, api));

export const getAccounts = (includeArchived: boolean) =>
  get('accounts', '/account', 'The Tempo accounts', undefined, { skipArchived: !includeArchived });

export const getAccount = (accountKey: string) =>
  get('accounts', '/account/key/{accountKey}', `Account ${accountKey}`, { accountKey });

export const getIssueAccount = (issueKey: string) =>
  get('accounts', '/account/issue/{issueKey}/current', `The account of issue ${issueKey}`, { issueKey });

export const getTeams = () => get('teams', '/team', 'The Tempo teams');

export const getTeam = (teamId: number) => get('teams', '/team/{id}', `Team ${teamId}`, { id: teamId });

export const getTeamMembers = (teamId: number, includeInactive: boolean) =>
  get('teams', '/team/{id}/member', `Team ${teamId}`, { id: teamId }, { onlyActive: !includeInactive });

export const getUserTeams = (userName: string, from?: string, to?: string) =>
  get('teams', '/user/{userName}/memberships', `User ${userName}`, { userName }, { from, to });
