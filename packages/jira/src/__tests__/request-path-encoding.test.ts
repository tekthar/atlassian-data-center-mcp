import { request } from '../jira-client/core/request.js';
import type { OpenAPIConfig } from '../jira-client/core/OpenAPI.js';

const config: OpenAPIConfig = {
  BASE: 'https://jira.example.com/rest',
  VERSION: '2',
  WITH_CREDENTIALS: false,
  CREDENTIALS: 'include',
};

function deleteIssueLink(linkId: string) {
  return request(config, { method: 'DELETE', url: '/api/2/issueLink/{linkId}', path: { linkId } });
}

describe('jira request path encoding', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn(
      async (_url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => new Response(null, { status: 204 }),
    ) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends a plain id to the intended endpoint', async () => {
    await deleteIssueLink('10200');

    expect(fetchMock.mock.calls[0][0]).toBe('https://jira.example.com/rest/api/2/issueLink/10200');
  });

  it.each(['../project/ABC', '../issue/ABC-123?deleteSubtasks=true', '../version/10001', '../user?username=jdoe'])(
    'refuses %p before any request is sent',
    async (linkId) => {
      await expect(deleteIssueLink(linkId)).rejects.toThrow('Refusing path parameter "linkId"');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('keeps query and fragment characters inside the path segment', async () => {
    await deleteIssueLink('7?x=1#');

    expect(fetchMock.mock.calls[0][0]).toBe('https://jira.example.com/rest/api/2/issueLink/7%3Fx%3D1%23');
  });
});
