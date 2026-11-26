import { OpenAPI } from '../jira-client/core/OpenAPI.js';
import { isLoginPageRedirect, request } from '../jira-client/core/request.js';

function landedOn(url: string, redirected: boolean, body = '<html>login</html>', contentType = 'text/html'): Response {
  const response = new Response(body, { status: 200, headers: { 'Content-Type': contentType } });
  Object.defineProperty(response, 'url', { value: url });
  Object.defineProperty(response, 'redirected', { value: redirected });
  return response;
}

const LOGIN = 'https://jira.example.com/login.jsp?permissionViolation=true&os_destination=%2Frest%2Fraven%2F1.0%2Fapi';

describe('isLoginPageRedirect', () => {
  it('is true when a redirect lands on login.jsp', () => {
    expect(isLoginPageRedirect(landedOn(LOGIN, true))).toBe(true);
  });

  it('is true for login.jsp under a context path', () => {
    expect(isLoginPageRedirect(landedOn('https://example.com/jira/login.jsp?permissionViolation=true', true))).toBe(true);
  });

  it('is false for a redirect elsewhere, such as a moved issue', () => {
    expect(isLoginPageRedirect(landedOn('https://jira.example.com/rest/api/2/issue/10002', true, '{}', 'application/json'))).toBe(false);
  });

  it('is false without a redirect', () => {
    expect(isLoginPageRedirect(landedOn('https://jira.example.com/login.jsp', false))).toBe(false);
  });
});

describe('request on a login-page redirect', () => {
  const originalFetch = global.fetch;
  const originalBase = OpenAPI.BASE;

  beforeEach(() => {
    OpenAPI.BASE = 'https://jira.example.com/rest';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    OpenAPI.BASE = originalBase;
  });

  it('rejects with a 404 instead of resolving with the login page', async () => {
    global.fetch = jest.fn(async () => landedOn(LOGIN, true)) as unknown as typeof fetch;

    await expect(request(OpenAPI, { method: 'GET', url: '/raven/1.0/api/settings/teststatuses' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('still resolves a redirect that lands on JSON', async () => {
    global.fetch = jest.fn(async () => landedOn('https://jira.example.com/rest/api/2/issue/10002', true, '{"key":"NEW-1"}', 'application/json')) as unknown as typeof fetch;

    await expect(request(OpenAPI, { method: 'GET', url: '/api/2/issue/OLD-1' })).resolves.toEqual({ key: 'NEW-1' });
  });
});
