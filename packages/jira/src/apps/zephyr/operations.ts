import { stripNoise } from '../../tools/context.js';
import { callZephyr } from './client.js';

type Query = Record<string, string | number | boolean | undefined>;

const get = async (url: string, subject: string, path?: Record<string, string>, query?: Query) =>
  stripNoise(await callZephyr({ method: 'GET', url, path, query }, subject));

export interface SearchInput {
  query: string;
  fields?: string;
  startAt?: number;
  maxResults?: number;
}

const searchQuery = ({ query, fields, startAt, maxResults }: SearchInput, pageSize: number): Query =>
  ({ query, fields, startAt: startAt ?? 0, maxResults: maxResults ?? pageSize });

export const getTestCase = (testCaseKey: string, fields?: string) =>
  get('/testcase/{testCaseKey}', `Test case ${testCaseKey}`, { testCaseKey }, { fields });

export const searchTestCases = (search: SearchInput, pageSize: number) =>
  get('/testcase/search', 'The test case search', undefined, searchQuery(search, pageSize));

export const getLatestTestResult = (testCaseKey: string) =>
  get('/testcase/{testCaseKey}/testresult/latest', `The latest result of test case ${testCaseKey}`, { testCaseKey });

export const getIssueTestCases = (issueKey: string, fields?: string) =>
  get('/issuelink/{issueKey}/testcases', `Issue ${issueKey}`, { issueKey }, { fields });

/** Zephyr's API calls a test cycle a test run. */
export const getTestCycle = (testCycleKey: string, fields?: string) =>
  get('/testrun/{testRunKey}', `Test cycle ${testCycleKey}`, { testRunKey: testCycleKey }, { fields });

export const searchTestCycles = (search: SearchInput, pageSize: number) =>
  get('/testrun/search', 'The test cycle search', undefined, searchQuery(search, pageSize));

export interface ResultsPage {
  startAt?: number;
  maxResults?: number;
  onlyLastExecutions?: boolean;
}

export const getTestCycleResults = (testCycleKey: string, { startAt, maxResults, onlyLastExecutions }: ResultsPage, pageSize: number) =>
  get('/testrun/{testRunKey}/testresults/page', `Test cycle ${testCycleKey}`, { testRunKey: testCycleKey },
    { startAt: startAt ?? 0, maxResults: maxResults ?? pageSize, onlyLastExecutions: onlyLastExecutions ?? false });

export const getEnvironments = (projectKey: string) =>
  get('/environments', `The environments of project ${projectKey}`, undefined, { projectKey });

export const getTestPlan = (testPlanKey: string, fields?: string) =>
  get('/testplan/{testPlanKey}', `Test plan ${testPlanKey}`, { testPlanKey }, { fields });

export const searchTestPlans = (search: SearchInput, pageSize: number) =>
  get('/testplan/search', 'The test plan search', undefined, searchQuery(search, pageSize));
