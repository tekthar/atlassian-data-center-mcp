import { z } from 'zod';

const teamId = z.number().int().positive().describe('The Tempo team id, from tempo_getTeams');

const date = (what: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date such as 2026-11-16').optional().describe(`${what}, e.g. '2026-11-16'`);

export const tempoDirectorySchemas = {
  getAccounts: {
    includeArchived: z.boolean().optional().describe('Also list archived accounts (default false)'),
  },
  getAccount: {
    accountKey: z.string().min(1).describe('The account key, e.g. \'ACME-SUPPORT\', from tempo_getAccounts'),
  },
  getIssueAccount: {
    issueKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as PROJ-12').describe('The issue key, e.g. \'PROJ-12\''),
  },
  getTeams: {},
  getTeam: { teamId },
  getTeamMembers: {
    teamId,
    includeInactive: z.boolean().optional().describe('Also list past and future members (default false)'),
  },
  getUserTeams: {
    userName: z.string().min(1).describe('The person\'s Jira username'),
    from: date('First day of the range'),
    to: date('Last day of the range'),
  },
};
