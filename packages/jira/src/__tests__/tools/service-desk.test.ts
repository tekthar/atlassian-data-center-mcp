import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { OpenAPI } from '../../jira-client/core/OpenAPI.js';
import { request } from '../../jira-client/core/request.js';
import { registerServiceDeskTools, SERVICE_DESK_CATALOG } from '../../tools/service-desk.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  path?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

const links = { self: 'https://jira.example.com/rest/servicedeskapi/x', web: 'https://jira.example.com/servicedesk/x' };
const apiError = (status: number, statusText: string, body: unknown = {}) =>
  Object.assign(new Error(statusText), { status, statusText, body });
const notFound = apiError(404, 'Not Found', '<html>Not Found</html>');

/** Answer each servicedeskapi URL template with a fixed response, or reject with an error. */
function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    if (!(options.url in routes)) throw new Error(`Unexpected request to ${options.url}`);
    const response = routes[options.url];
    if (response instanceof Error) throw response;
    return response;
  });
}

const callOptions = (index = 0) => mockedRequest.mock.calls[index][1] as RequestOptions;

function setup(pageSize = 25) {
  const recorder = createRecordingRegistrar();
  registerServiceDeskTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => pageSize });
  return recorder;
}

const page = (values: unknown[], extra: Record<string, unknown> = {}) =>
  ({ size: values.length, start: 0, limit: 50, isLastPage: true, values, _links: links, ...extra });

describe('jira service desk tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool under the service desk toolset', () => {
    const registered = setup().registrar.registeredTools();

    expect(registered).toEqual(Object.keys(SERVICE_DESK_CATALOG.tools));
    expect(SERVICE_DESK_CATALOG.toolsets.jira_service_desk.default).toBe(false);
    expect(SERVICE_DESK_CATALOG.tools.jira_createCustomerRequest.access).toBe('write');
  });

  describe('jira_getServiceDeskForProject', () => {
    const desk = (id: string, projectKey: string) =>
      ({ id, projectId: `100${id}`, projectKey, projectName: `${projectKey} desk`, _links: links });

    it('pages through service desks until the project matches, case-insensitively', async () => {
      mockedRequest
        .mockResolvedValueOnce(page([desk('1', 'HR')], { isLastPage: false }))
        .mockResolvedValueOnce(page([desk('4', 'SUP')], { start: 1 }));

      const result = await setup().callJson('jira_getServiceDeskForProject', { projectKey: 'sup' });

      expect(mockedRequest).toHaveBeenNthCalledWith(1, OpenAPI, {
        method: 'GET', url: '/servicedeskapi/servicedesk', query: { start: 0, limit: 50 }, mediaType: 'application/json',
      });
      expect(callOptions(1).query).toEqual({ start: 1, limit: 50 });
      expect(result).toEqual({
        success: true,
        data: { projectKey: 'SUP', serviceDesk: { id: '4', projectId: '1004', projectKey: 'SUP', projectName: 'SUP desk' } },
      });
    });

    it('returns a null service desk when no desk belongs to the project', async () => {
      mockedRequest.mockResolvedValue(page([desk('1', 'HR')]));

      const result = await setup().callJson('jira_getServiceDeskForProject', { projectKey: 'ACS' });

      expect(mockedRequest).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true, data: { projectKey: 'ACS', serviceDesk: null } });
    });

    it('explains a 404 as Jira Service Management being unavailable', async () => {
      mockedRequest.mockRejectedValue(notFound);

      const result = await setup().call('jira_getServiceDeskForProject', { projectKey: 'SUP' });
      const body = JSON.parse((result.content[0] as { text: string }).text);

      expect(result.isError).toBe(true);
      expect(body.error).toContain('was not found (404)');
      expect(body.error).toContain('Jira Service Management is installed');
    });

    it('rejects a malformed project key', async () => {
      await expect(setup().call('jira_getServiceDeskForProject', { projectKey: '1-bad key' })).rejects.toThrow();
      expect(mockedRequest).not.toHaveBeenCalled();
    });
  });

  describe('jira_getServiceDeskQueues', () => {
    it('requests queues with counts and shapes them', async () => {
      mockedRequest.mockResolvedValue(page([
        { id: '47', name: 'Open', jql: 'project = SUP AND resolution = EMPTY', fields: ['issuekey', 'summary'], issueCount: 3, _links: links },
      ]));

      const result = await setup().callJson('jira_getServiceDeskQueues', { serviceDeskId: '4', start: 5 });

      expect(mockedRequest).toHaveBeenCalledWith(OpenAPI, {
        method: 'GET',
        url: '/servicedeskapi/servicedesk/{serviceDeskId}/queue',
        path: { serviceDeskId: '4' },
        query: { includeCount: true, start: 5, limit: 25 },
        mediaType: 'application/json',
      });
      expect(result).toEqual({
        success: true,
        data: {
          serviceDeskId: '4', start: 0, limit: 50, size: 1, isLastPage: true,
          queues: [{ id: '47', name: 'Open', jql: 'project = SUP AND resolution = EMPTY', fields: ['issuekey', 'summary'], issueCount: 3 }],
        },
      });
    });

    it('caps the default page size at 50', async () => {
      mockedRequest.mockResolvedValue(page([]));

      await setup(200).callJson('jira_getServiceDeskQueues', { serviceDeskId: '4' });

      expect(callOptions().query).toEqual({ includeCount: true, start: 0, limit: 50 });
    });

    it('reports API errors other than 404 with their status', async () => {
      mockedRequest.mockRejectedValue(apiError(403, 'Forbidden', { errorMessage: 'No access' }));

      const result = await setup().callJson('jira_getServiceDeskQueues', { serviceDeskId: '4' });

      expect(result).toEqual({
        success: false, error: 'Error fetching service desk queues: 403 Forbidden', details: { errorMessage: 'No access' },
      });
    });

    it('rejects a non-numeric service desk id and an oversized limit', async () => {
      await expect(setup().call('jira_getServiceDeskQueues', { serviceDeskId: 'SUP' })).rejects.toThrow();
      await expect(setup().call('jira_getServiceDeskQueues', { serviceDeskId: '4', limit: 51 })).rejects.toThrow();
      expect(mockedRequest).not.toHaveBeenCalled();
    });
  });

  describe('jira_getQueueIssues', () => {
    const queueIssue = {
      id: '10001',
      key: 'SUP-1',
      self: 'https://jira.example.com/rest/api/2/issue/10001',
      expand: 'renderedFields',
      fields: {
        summary: 'Printer jam',
        status: { self: 'https://jira.example.com/status/1', iconUrl: 'https://jira.example.com/icon.png', name: 'Open', id: '1' },
        reporter: { name: 'jdoe', displayName: 'Jane Doe', avatarUrls: { '48x48': 'https://jira.example.com/avatar' } },
        resolution: null,
      },
    };

    it('fetches queue metadata and issues, stripping links and avatars', async () => {
      routeRequests({
        '/servicedeskapi/servicedesk/{serviceDeskId}/queue/{queueId}': { id: '47', name: 'Open', issueCount: 1, _links: links },
        '/servicedeskapi/servicedesk/{serviceDeskId}/queue/{queueId}/issue': page([queueIssue]),
      });

      const result = await setup().callJson('jira_getQueueIssues', { serviceDeskId: '4', queueId: '47', limit: 10 });

      const issueCall = mockedRequest.mock.calls.find(([, options]) => (options as RequestOptions).url.endsWith('/issue'));
      expect(issueCall?.[1]).toEqual({
        method: 'GET',
        url: '/servicedeskapi/servicedesk/{serviceDeskId}/queue/{queueId}/issue',
        path: { serviceDeskId: '4', queueId: '47' },
        query: { start: 0, limit: 10 },
        mediaType: 'application/json',
      });
      expect(result.data.queue).toEqual({ id: '47', name: 'Open', issueCount: 1 });
      expect(result.data.issues).toEqual([{
        id: '10001',
        key: 'SUP-1',
        fields: { summary: 'Printer jam', status: { name: 'Open', id: '1' }, reporter: { name: 'jdoe', displayName: 'Jane Doe' }, resolution: null },
      }]);
    });

    it('still returns issues when the queue metadata call fails', async () => {
      routeRequests({
        '/servicedeskapi/servicedesk/{serviceDeskId}/queue/{queueId}': apiError(500, 'Internal Server Error'),
        '/servicedeskapi/servicedesk/{serviceDeskId}/queue/{queueId}/issue': page([queueIssue]),
      });

      const result = await setup().callJson('jira_getQueueIssues', { serviceDeskId: '4', queueId: '47' });

      expect(result.success).toBe(true);
      expect(result.data.queue).toBeUndefined();
      expect(result.data.issues).toHaveLength(1);
    });

    it('fails with a clear message when the queue does not exist', async () => {
      routeRequests({
        '/servicedeskapi/servicedesk/{serviceDeskId}/queue/{queueId}': notFound,
        '/servicedeskapi/servicedesk/{serviceDeskId}/queue/{queueId}/issue': notFound,
      });

      const result = await setup().callJson('jira_getQueueIssues', { serviceDeskId: '4', queueId: '99' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Queue 99 in service desk 4 was not found (404)');
    });

    it('requires a numeric queue id', async () => {
      await expect(setup().call('jira_getQueueIssues', { serviceDeskId: '4' })).rejects.toThrow();
      await expect(setup().call('jira_getQueueIssues', { serviceDeskId: '4', queueId: '../47' })).rejects.toThrow();
      expect(mockedRequest).not.toHaveBeenCalled();
    });
  });

  describe('jira_getRequestTypes', () => {
    it('lists request types without icons or links', async () => {
      mockedRequest.mockResolvedValue(page([{
        id: '23', name: 'Get IT help', description: 'Ask the IT team', helpText: '', issueTypeId: '10004',
        serviceDeskId: '4', groupIds: ['12'], icon: { id: '1', _links: { iconUrls: {} } }, _links: links,
      }]));

      const result = await setup().callJson('jira_getRequestTypes', { serviceDeskId: '4', start: 0, limit: 20 });

      expect(mockedRequest).toHaveBeenCalledWith(OpenAPI, {
        method: 'GET',
        url: '/servicedeskapi/servicedesk/{serviceDeskId}/requesttype',
        path: { serviceDeskId: '4' },
        query: { start: 0, limit: 20 },
        mediaType: 'application/json',
      });
      expect(result.data.requestTypes).toEqual([
        { id: '23', name: 'Get IT help', description: 'Ask the IT team', issueTypeId: '10004', groupIds: ['12'] },
      ]);
    });

    it('explains a 404 for an unknown service desk', async () => {
      mockedRequest.mockRejectedValue(notFound);

      const result = await setup().callJson('jira_getRequestTypes', { serviceDeskId: '404' });

      expect(result.error).toContain('Service desk 404 was not found (404)');
    });

    it('rejects a negative start', async () => {
      await expect(setup().call('jira_getRequestTypes', { serviceDeskId: '4', start: -1 })).rejects.toThrow();
    });
  });

  const priorityField = {
    fieldId: 'customfield_10010',
    name: 'Urgency',
    description: '',
    required: false,
    jiraSchema: { type: 'option', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:select', customId: 10010 },
    validValues: [{ value: '10100', label: 'High', children: [] }, { value: '10101', label: 'Low', children: [] }],
    defaultValues: [],
  };
  const fieldsResponse = {
    canRaiseOnBehalfOf: true,
    canAddRequestParticipants: true,
    requestTypeFields: [
      { fieldId: 'summary', name: 'Summary', required: true, jiraSchema: { type: 'string', system: 'summary' }, validValues: [], defaultValues: [] },
      { fieldId: 'description', name: 'Description', required: false, jiraSchema: { type: 'string', system: 'description' }, validValues: [] },
      priorityField,
      { fieldId: 'labels', name: 'Labels', required: false, jiraSchema: { type: 'array', items: 'string', system: 'labels' }, validValues: [] },
    ],
  };

  describe('jira_getRequestTypeFields', () => {
    it('shapes field definitions and the raise-on-behalf flags', async () => {
      mockedRequest.mockResolvedValue(fieldsResponse);

      const result = await setup().callJson('jira_getRequestTypeFields', { serviceDeskId: '4', requestTypeId: '23' });

      expect(mockedRequest).toHaveBeenCalledWith(OpenAPI, {
        method: 'GET',
        url: '/servicedeskapi/servicedesk/{serviceDeskId}/requesttype/{requestTypeId}/field',
        path: { serviceDeskId: '4', requestTypeId: '23' },
        mediaType: 'application/json',
      });
      expect(result.data).toMatchObject({ serviceDeskId: '4', requestTypeId: '23', canRaiseOnBehalfOf: true, canAddRequestParticipants: true });
      expect(result.data.fields[0]).toEqual({ fieldId: 'summary', name: 'Summary', required: true, jiraSchema: { type: 'string', system: 'summary' } });
      expect(result.data.fields[2].validValues).toEqual(priorityField.validValues);
    });

    it('explains a 404 for an unknown request type', async () => {
      mockedRequest.mockRejectedValue(notFound);

      const result = await setup().callJson('jira_getRequestTypeFields', { serviceDeskId: '4', requestTypeId: '99' });

      expect(result.error).toContain('Request type 99 in service desk 4 was not found (404)');
    });

    it('requires a request type id', async () => {
      await expect(setup().call('jira_getRequestTypeFields', { serviceDeskId: '4' })).rejects.toThrow();
    });
  });

  describe('jira_createCustomerRequest', () => {
    const created = {
      _expands: ['participant', 'status'],
      issueId: '10050',
      issueKey: 'SUP-50',
      requestTypeId: '23',
      serviceDeskId: '4',
      createdDate: { iso8601: '2026-11-05T10:00:00+0300', friendly: 'Today 10:00', epochMillis: 1793862000000 },
      reporter: { name: 'jdoe', key: 'JIRAUSER10100', displayName: 'Jane Doe', emailAddress: 'jane.doe@example.com', active: true, timeZone: 'Asia/Riyadh', _links: links },
      requestFieldValues: [{ fieldId: 'summary', label: 'Summary', value: 'Printer jam' }],
      currentStatus: { status: 'Waiting for support', statusDate: {} },
      _links: { jiraRest: 'https://jira.example.com/rest/api/2/issue/10050', web: 'https://jira.example.com/servicedesk/customer/portal/4/SUP-50', self: links.self },
    };

    const routeCreate = (fields: unknown = fieldsResponse, response: unknown = created) => routeRequests({
      '/servicedeskapi/servicedesk/{serviceDeskId}/requesttype/{requestTypeId}/field': fields,
      '/servicedeskapi/request': response,
    });

    it('maps option labels to ids, splits list strings and posts with the experimental header', async () => {
      routeCreate();

      const result = await setup().callJson('jira_createCustomerRequest', {
        serviceDeskId: '4',
        requestTypeId: '23',
        requestFieldValues: { summary: 'Printer jam', description: '  ', customfield_10010: 'high', labels: 'printer, floor-3' },
        raiseOnBehalfOf: 'jdoe',
        requestParticipants: ['asmith'],
      });

      expect(callOptions(1)).toEqual({
        method: 'POST',
        url: '/servicedeskapi/request',
        headers: { 'X-ExperimentalApi': 'opt-in' },
        mediaType: 'application/json',
        body: {
          serviceDeskId: '4',
          requestTypeId: '23',
          requestFieldValues: { summary: 'Printer jam', customfield_10010: { id: '10100' }, labels: ['printer', 'floor-3'] },
          raiseOnBehalfOf: 'jdoe',
          requestParticipants: ['asmith'],
        },
      });
      expect(result).toEqual({
        success: true,
        data: {
          issueId: '10050',
          issueKey: 'SUP-50',
          serviceDeskId: '4',
          requestTypeId: '23',
          createdDate: '2026-11-05T10:00:00+0300',
          reporter: { name: 'jdoe', key: 'JIRAUSER10100', displayName: 'Jane Doe', emailAddress: 'jane.doe@example.com', active: true, timeZone: 'Asia/Riyadh' },
          currentStatus: 'Waiting for support',
          portalUrl: 'https://jira.example.com/servicedesk/customer/portal/4/SUP-50',
        },
      });
    });

    it('omits optional body fields that were not given and passes option objects through', async () => {
      routeCreate();

      await setup().callJson('jira_createCustomerRequest', {
        serviceDeskId: '4', requestTypeId: '23', requestFieldValues: { summary: 'Printer jam', customfield_10010: { id: '10101' } },
      });

      expect(callOptions(1).body).toEqual({
        serviceDeskId: '4', requestTypeId: '23', requestFieldValues: { summary: 'Printer jam', customfield_10010: { id: '10101' } },
      });
    });

    it('lists missing required fields without creating anything', async () => {
      routeCreate();

      const result = await setup().callJson('jira_createCustomerRequest', {
        serviceDeskId: '4', requestTypeId: '23', requestFieldValues: { description: 'No summary' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields: Summary (summary)');
      expect(mockedRequest).toHaveBeenCalledTimes(1);
    });

    it('rejects an unknown option and lists the allowed ones', async () => {
      routeCreate();

      const result = await setup().callJson('jira_createCustomerRequest', {
        serviceDeskId: '4', requestTypeId: '23', requestFieldValues: { summary: 'Printer jam', customfield_10010: 'Critical' },
      });

      expect(result.error).toBe('"Critical" is not a valid option for field Urgency (customfield_10010). Allowed: High (10100), Low (10101).');
      expect(mockedRequest).toHaveBeenCalledTimes(1);
    });

    it('refuses raiseOnBehalfOf when the request type does not allow it, instead of creating as the agent', async () => {
      routeCreate({ ...fieldsResponse, canRaiseOnBehalfOf: false });

      const result = await setup().callJson('jira_createCustomerRequest', {
        serviceDeskId: '4', requestTypeId: '23', requestFieldValues: { summary: 'Printer jam' }, raiseOnBehalfOf: 'jdoe',
      });

      expect(result.error).toContain('cannot raise requests on behalf of other customers');
      expect(mockedRequest).toHaveBeenCalledTimes(1);
    });

    it('refuses request participants when the request type does not allow them', async () => {
      routeCreate({ ...fieldsResponse, canAddRequestParticipants: false });

      const result = await setup().callJson('jira_createCustomerRequest', {
        serviceDeskId: '4', requestTypeId: '23', requestFieldValues: { summary: 'Printer jam' }, requestParticipants: ['asmith'],
      });

      expect(result.error).toContain('cannot add request participants');
      expect(mockedRequest).toHaveBeenCalledTimes(1);
    });

    it('reports a rejected create with the Jira error body', async () => {
      routeCreate(fieldsResponse, apiError(400, 'Bad Request', { errorMessage: 'The user jdoe is not a customer' }));

      const result = await setup().callJson('jira_createCustomerRequest', {
        serviceDeskId: '4', requestTypeId: '23', requestFieldValues: { summary: 'Printer jam' }, raiseOnBehalfOf: 'jdoe',
      });

      expect(result).toEqual({
        success: false,
        error: 'Error creating customer request: 400 Bad Request',
        details: { errorMessage: 'The user jdoe is not a customer' },
      });
      expect(mockedRequest).toHaveBeenCalledTimes(2);
    });

    it('explains a 404 when Jira Service Management is missing', async () => {
      mockedRequest.mockRejectedValue(notFound);

      const result = await setup().callJson('jira_createCustomerRequest', {
        serviceDeskId: '4', requestTypeId: '23', requestFieldValues: { summary: 'Printer jam' },
      });

      expect(result.error).toContain('was not found (404)');
    });

    it('rejects empty field values in the handler and malformed input in the schema', async () => {
      const result = await setup().callJson('jira_createCustomerRequest', { serviceDeskId: '4', requestTypeId: '23', requestFieldValues: {} });

      expect(result).toEqual({ success: false, error: 'requestFieldValues is empty. Provide at least the required fields, such as summary.' });
      await expect(setup().call('jira_createCustomerRequest', { serviceDeskId: '4', requestTypeId: '23' })).rejects.toThrow();
      await expect(setup().call('jira_createCustomerRequest', {
        serviceDeskId: '4', requestTypeId: '23', requestFieldValues: { summary: 'x' }, requestParticipants: 'asmith',
      })).rejects.toThrow();
      expect(mockedRequest).not.toHaveBeenCalled();
    });
  });
});
