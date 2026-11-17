import { stripNoise } from '../../tools/context.js';
import { callZephyr } from './client.js';

type Body = Record<string, unknown>;

/** The body without the fields left out, so Zephyr keeps its own defaults. */
const defined = (body: Body): Body => Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));

const send = async (method: 'POST' | 'PUT', url: string, subject: string, body: Body, path?: Record<string, string>) =>
  stripNoise(await callZephyr({ method, url, path, body: defined(body) }, subject));

export interface TestResultInput {
  status: string;
  comment?: string;
  environment?: string;
  executionTime?: number;
  executedBy?: string;
  stepResults?: Array<{ index: number; status: string; comment?: string }>;
  issueLinks?: string[];
}

/** A result as Zephyr reads it, which calls step results script results. */
const resultBody = ({ stepResults, ...rest }: TestResultInput): Body => defined({ ...rest, scriptResults: stepResults });

/** Adds a result for a test case in a test cycle, or with `replaceLatest` updates its latest one. */
export function recordTestResult(testCycleKey: string, testCaseKey: string, result: TestResultInput, replaceLatest: boolean) {
  return send(replaceLatest ? 'PUT' : 'POST', '/testrun/{testRunKey}/testcase/{testCaseKey}/testresult',
    `Test case ${testCaseKey} in test cycle ${testCycleKey}`, resultBody(result), { testRunKey: testCycleKey, testCaseKey });
}

/** Adds results for many test cases of a test cycle in one call, each naming its test case. */
export async function recordTestResults(testCycleKey: string, results: Array<TestResultInput & { testCaseKey: string }>) {
  const created = await callZephyr({
    method: 'POST',
    url: '/testrun/{testRunKey}/testresults',
    path: { testRunKey: testCycleKey },
    body: results.map(resultBody),
  }, `Test cycle ${testCycleKey}`);
  return { testCycleKey, recorded: results.length, created: stripNoise(created) ?? null };
}

export interface TestCaseInput extends Body {
  projectKey: string;
  name: string;
  steps?: Array<{ description: string; testData?: string; expectedResult?: string }>;
  plainText?: string;
}

const testScript = ({ steps, plainText }: TestCaseInput) => {
  if (steps?.length) return { type: 'STEP_BY_STEP', steps };
  return plainText ? { type: 'PLAIN_TEXT', text: plainText } : undefined;
};

export function createTestCase(input: TestCaseInput) {
  const { steps: _steps, plainText: _plainText, ...fields } = input;
  return send('POST', '/testcase', `Project ${input.projectKey}`, { ...fields, testScript: testScript(input) });
}

/** Creates a test cycle; the API calls it a test run and its test cases "items". */
export function createTestCycle({ testCaseKeys, ...fields }: Body & { projectKey: string; testCaseKeys?: string[] }) {
  return send('POST', '/testrun', `Project ${fields.projectKey}`, { ...fields, items: testCaseKeys?.map((testCaseKey) => ({ testCaseKey })) });
}

export function createTestPlan({ testCycleKeys, ...fields }: Body & { projectKey: string; testCycleKeys?: string[] }) {
  return send('POST', '/testplan', `Project ${fields.projectKey}`, { ...fields, testRunKeys: testCycleKeys });
}
