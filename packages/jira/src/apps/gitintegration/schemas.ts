import { z } from 'zod';

export const MAX_COMMITS = 100;

const issueKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as PROJ-12').describe('The issue, e.g. PROJ-12');
const offset = z.number().int().min(0).optional().describe('How many to skip, for the next page (default 0)');

export const gitIntegrationToolSchemas = {
  getIssueCommits: {
    issueKey,
    withFiles: z.boolean().optional().describe('Also list each commit\'s changed files with lines added and deleted (default false)'),
    offset,
    limit: z.number().int().min(1).max(MAX_COMMITS).optional().describe(`Commits per page (default 20, up to ${MAX_COMMITS})`),
  },
  getIssueBranches: { issueKey },
  getIssuePullRequests: { issueKey },
  getRepositories: {
    projectKey: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Expected a Jira project key such as PROJ').optional()
      .describe('Only the repositories connected to this project; leave out for all you may see'),
    offset,
    limit: z.number().int().min(1).max(100).optional().describe('Repositories per page (default 50, up to 100)'),
  },
};
