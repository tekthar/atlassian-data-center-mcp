import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { FieldService, IssueService, ProjectService, ProjectsService, VersionService } from '../../jira-client/index.js';
import { FIELDS_PROJECTS_CATALOG, registerFieldsProjectsTools } from '../../tools/fields-projects.js';

jest.mock('../../jira-client/index.js', () => ({
  FieldService: { getFields: jest.fn() },
  IssueService: { getCreateIssueMetaProjectIssueTypes: jest.fn(), getCreateIssueMetaFields: jest.fn() },
  ProjectService: { getAllProjects: jest.fn(), getProjectComponents: jest.fn() },
  ProjectsService: { searchForProjects: jest.fn() },
  VersionService: { createVersion: jest.fn() },
}));

const mocked = {
  getFields: FieldService.getFields as jest.Mock,
  issueTypes: IssueService.getCreateIssueMetaProjectIssueTypes as jest.Mock,
  createFields: IssueService.getCreateIssueMetaFields as jest.Mock,
  allProjects: ProjectService.getAllProjects as jest.Mock,
  components: ProjectService.getProjectComponents as jest.Mock,
  pickProjects: ProjectsService.searchForProjects as jest.Mock,
  createVersion: VersionService.createVersion as jest.Mock,
};

const apiError = (status: number, statusText: string, body: unknown = {}) =>
  Object.assign(new Error(statusText), { status, statusText, body });

const page = (values: unknown[], extra: Record<string, unknown> = {}) =>
  ({ maxResults: 50, startAt: 0, total: values.length, isLast: true, values, ...extra });

const lead = {
  self: 'https://jira.example.com/rest/api/2/user?username=jdoe',
  name: 'jdoe',
  key: 'JIRAUSER10100',
  displayName: 'Jane Doe',
  active: true,
  avatarUrls: { '48x48': 'https://jira.example.com/avatar' },
};

const bugType = { self: 'https://jira.example.com/rest/api/2/issuetype/10001', id: '10001', name: 'Bug', description: 'A problem', iconUrl: 'x', subtask: false };
const taskType = { self: 'https://jira.example.com/rest/api/2/issuetype/10002', id: '10002', name: 'Task', description: '', iconUrl: 'y', subtask: false, untranslatedName: 'Aufgabe' };

const summaryMeta = { required: true, schema: { type: 'string', system: 'summary' }, name: 'Summary', fieldId: 'summary', hasDefaultValue: false, operations: ['set'] };
const severityMeta = {
  required: false,
  schema: { type: 'option', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:select', customId: 10100 },
  name: 'Severity',
  fieldId: 'customfield_10100',
  operations: ['set'],
  allowedValues: [
    { self: 'https://jira.example.com/rest/api/2/customFieldOption/1', value: 'High', id: '1', disabled: false },
    { self: 'https://jira.example.com/rest/api/2/customFieldOption/2', value: 'Low', id: '2', disabled: true },
  ],
};
const regionMeta = {
  required: false,
  schema: { type: 'option-with-child', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:cascadingselect', customId: 10200 },
  name: 'Region',
  fieldId: 'customfield_10200',
  allowedValues: [
    { value: 'Europe', id: '10', cascadingOptions: [{ value: 'Germany', id: '11' }, { value: 'France', id: '12' }] },
    { value: 'Asia', id: '20', cascadingOptions: [{ value: 'Saudi Arabia', id: '21' }] },
  ],
};

function setup() {
  const recorder = createRecordingRegistrar();
  registerFieldsProjectsTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

async function errorText(name: string, args: Record<string, unknown>) {
  const result = await setup().call(name, args);
  expect(result.isError).toBe(true);
  return JSON.parse((result.content[0] as { text: string }).text).error as string;
}

beforeEach(() => jest.resetAllMocks());

describe('fields and projects catalog', () => {
  it('registers every catalog tool, in non-default toolsets', () => {
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(FIELDS_PROJECTS_CATALOG.tools).sort());
    for (const toolset of Object.values(FIELDS_PROJECTS_CATALOG.toolsets)) {
      expect(toolset.default).toBe(false);
    }
    expect(FIELDS_PROJECTS_CATALOG.tools.jira_batchCreateVersions.access).toBe('write');
  });
});

describe('jira_searchFields', () => {
  const fields = [
    { id: 'customfield_10300', key: 'customfield_10300', name: 'Release Summary', custom: true, clauseNames: ['cf[10300]', 'Release Summary'], schema: { type: 'string', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:textfield', customId: 10300 } },
    { id: 'summary', key: 'summary', name: 'Summary', custom: false, navigable: true, orderable: true, searchable: true, clauseNames: ['summary'], schema: { type: 'string', system: 'summary' } },
    { id: 'customfield_10002', key: 'customfield_10002', name: 'Story Points', custom: true, clauseNames: ['cf[10002]', 'Story Points'], schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float', customId: 10002 } },
    { id: 'labels', key: 'labels', name: 'Labels', custom: false, clauseNames: ['labels'], schema: { type: 'array', items: 'string', system: 'labels' } },
  ];

  it('ranks exact matches before substring matches and shapes the fields', async () => {
    mocked.getFields.mockResolvedValue(fields);

    const result = await setup().callJson('jira_searchFields', { keyword: 'SUMMARY' });

    expect(result.data.total).toBe(2);
    expect(result.data.fields).toEqual([
      { id: 'summary', name: 'Summary', custom: false, schemaType: 'string', clauseNames: ['summary'] },
      expect.objectContaining({ id: 'customfield_10300', custom: true, customType: 'com.atlassian.jira.plugin.system.customfieldtypes:textfield' }),
    ]);
  });

  it('matches every word of a multi-word keyword in any order', async () => {
    mocked.getFields.mockResolvedValue(fields);

    const result = await setup().callJson('jira_searchFields', { keyword: 'points story' });

    expect(result.data.fields.map((field: { id: string }) => field.id)).toEqual(['customfield_10002']);
  });

  it('lists the first fields when no keyword is given, up to the limit', async () => {
    mocked.getFields.mockResolvedValue(fields);

    const result = await setup().callJson('jira_searchFields', { limit: 1 });

    expect(result.data).toEqual({ total: 4, fields: [expect.objectContaining({ id: 'customfield_10300' })] });
  });

  it('reports API errors', async () => {
    mocked.getFields.mockRejectedValue(apiError(401, 'Unauthorized'));

    expect(await errorText('jira_searchFields', { keyword: 'x' })).toBe('Error searching fields: 401 Unauthorized');
  });

  it('rejects a limit below 1', async () => {
    await expect(setup().call('jira_searchFields', { limit: 0 })).rejects.toThrow();
  });
});

describe('jira_getFieldOptions', () => {
  beforeEach(() => {
    mocked.issueTypes.mockResolvedValue(page([bugType, taskType]));
    mocked.createFields.mockResolvedValue(page([summaryMeta, severityMeta, regionMeta]));
  });

  it('resolves the issue type by name and reads the options from createmeta', async () => {
    const result = await setup().callJson('jira_getFieldOptions', { fieldId: 'customfield_10100', projectKey: 'ACS', issueType: 'bug' });

    expect(mocked.issueTypes).toHaveBeenCalledWith('ACS', '50', '0');
    expect(mocked.createFields).toHaveBeenCalledWith('10001', 'ACS', '50', '0');
    expect(result).toEqual({
      success: true,
      data: { fieldId: 'customfield_10100', name: 'Severity', total: 2, options: [{ id: '1', value: 'High' }, { id: '2', value: 'Low', disabled: true }] },
    });
  });

  it('filters cascading options by child value and returns values only', async () => {
    const result = await setup().callJson('jira_getFieldOptions', {
      fieldId: 'Region', projectKey: 'ACS', issueType: '10002', contains: 'saudi', valuesOnly: true,
    });

    expect(mocked.createFields).toHaveBeenCalledWith('10002', 'ACS', '50', '0');
    expect(result.data).toEqual({ fieldId: 'customfield_10200', name: 'Region', total: 1, options: [{ value: 'Asia', children: ['Saudi Arabia'] }] });
  });

  it('applies returnLimit after filtering', async () => {
    const result = await setup().callJson('jira_getFieldOptions', { fieldId: 'customfield_10200', projectKey: 'ACS', issueType: 'Bug', returnLimit: 1 });

    expect(result.data.total).toBe(2);
    expect(result.data.options).toEqual([
      { id: '10', value: 'Europe', childOptions: [{ id: '11', value: 'Germany' }, { id: '12', value: 'France' }] },
    ]);
  });

  it('names the available issue types when the issue type is unknown', async () => {
    const error = await errorText('jira_getFieldOptions', { fieldId: 'customfield_10100', projectKey: 'ACS', issueType: 'Epic' });

    expect(error).toBe('Issue type "Epic" cannot be used to create issues in ACS. Available issue types: Bug, Task.');
    expect(mocked.createFields).not.toHaveBeenCalled();
  });

  it('fails when the field is not on the create screen', async () => {
    expect(await errorText('jira_getFieldOptions', { fieldId: 'customfield_99999', projectKey: 'ACS', issueType: 'Bug' }))
      .toContain('Field "customfield_99999" is not on the create screen of Bug in ACS');
  });

  it('reports API errors', async () => {
    mocked.issueTypes.mockRejectedValue(apiError(400, 'Bad Request'));

    expect(await errorText('jira_getFieldOptions', { fieldId: 'customfield_10100', projectKey: 'NOPE', issueType: 'Bug' }))
      .toBe('Error fetching field options: 400 Bad Request');
  });

  it('requires a project and an issue type, and a positive returnLimit', async () => {
    await expect(setup().call('jira_getFieldOptions', { fieldId: 'customfield_10100', issueType: 'Bug' })).rejects.toThrow();
    await expect(setup().call('jira_getFieldOptions', { fieldId: 'customfield_10100', projectKey: 'ACS' })).rejects.toThrow();
    await expect(setup().call('jira_getFieldOptions', {
      fieldId: 'customfield_10100', projectKey: 'ACS', issueType: 'Bug', returnLimit: 0,
    })).rejects.toThrow();
  });
});

describe('jira_getCreateFields', () => {
  it('pages through createmeta and flags fields with allowed values', async () => {
    mocked.createFields
      .mockResolvedValueOnce(page([summaryMeta, severityMeta], { total: 3, isLast: false }))
      .mockResolvedValueOnce(page([regionMeta], { startAt: 2, total: 3, isLast: true }));

    const result = await setup().callJson('jira_getCreateFields', { projectKey: 'ACS', issueTypeId: 10001 });

    expect(mocked.createFields).toHaveBeenNthCalledWith(1, '10001', 'ACS', '50', '0');
    expect(mocked.createFields).toHaveBeenNthCalledWith(2, '10001', 'ACS', '50', '2');
    expect(result.data).toEqual([
      { fieldId: 'summary', name: 'Summary', required: true, custom: false, schemaType: 'string' },
      {
        fieldId: 'customfield_10100', name: 'Severity', required: false, custom: true, schemaType: 'option',
        customType: 'com.atlassian.jira.plugin.system.customfieldtypes:select', hasAllowedValues: true,
      },
      expect.objectContaining({ fieldId: 'customfield_10200', schemaType: 'option-with-child', hasAllowedValues: true }),
    ]);
  });

  it('includes allowed values when asked', async () => {
    mocked.createFields.mockResolvedValue(page([severityMeta]));

    const result = await setup().callJson('jira_getCreateFields', { projectKey: 'ACS', issueTypeId: 10001, includeAllowedValues: true });

    expect(result.data[0].allowedValues).toEqual([{ id: '1', value: 'High' }, { id: '2', value: 'Low', disabled: true }]);
    expect(result.data[0].hasAllowedValues).toBeUndefined();
  });

  it('reports API errors', async () => {
    mocked.createFields.mockRejectedValue(apiError(400, 'Bad Request'));

    expect(await errorText('jira_getCreateFields', { projectKey: 'ACS', issueTypeId: 1 })).toBe('Error fetching create fields: 400 Bad Request');
  });

  it('requires a positive integer issue type id', async () => {
    await expect(setup().call('jira_getCreateFields', { projectKey: 'ACS', issueTypeId: '10001' })).rejects.toThrow();
    await expect(setup().call('jira_getCreateFields', { projectKey: 'ACS', issueTypeId: -1 })).rejects.toThrow();
  });
});

describe('jira_getProjectIssueTypes', () => {
  it('lists and shapes the issue types of a project', async () => {
    mocked.issueTypes.mockResolvedValue(page([bugType, taskType]));

    const result = await setup().callJson('jira_getProjectIssueTypes', { projectKey: 'ACS' });

    expect(mocked.issueTypes).toHaveBeenCalledWith('ACS', '50', '0');
    expect(result.data).toEqual([
      { id: '10001', name: 'Bug', description: 'A problem', subtask: false },
      { id: '10002', name: 'Task', subtask: false, untranslatedName: 'Aufgabe' },
    ]);
  });

  it('stops paging on an empty page', async () => {
    mocked.issueTypes
      .mockResolvedValueOnce(page([bugType], { total: 5, isLast: false }))
      .mockResolvedValueOnce(page([], { startAt: 1, total: 5, isLast: false }));

    const result = await setup().callJson('jira_getProjectIssueTypes', { projectKey: 'ACS' });

    expect(mocked.issueTypes).toHaveBeenCalledTimes(2);
    expect(result.data).toHaveLength(1);
  });

  it('reports API errors', async () => {
    mocked.issueTypes.mockRejectedValue(apiError(400, 'Bad Request'));

    expect(await errorText('jira_getProjectIssueTypes', { projectKey: 'NOPE' })).toBe('Error fetching project issue types: 400 Bad Request');
  });

  it('requires a non-blank project key', async () => {
    await expect(setup().call('jira_getProjectIssueTypes', { projectKey: '  ' })).rejects.toThrow();
  });
});

describe('jira_getProjectFields', () => {
  it('merges the create fields of every issue type', async () => {
    mocked.issueTypes.mockResolvedValue(page([bugType, taskType]));
    mocked.createFields.mockImplementation(async (issueTypeId: string) => (issueTypeId === '10001'
      ? page([summaryMeta, { ...severityMeta, required: true }])
      : page([summaryMeta, regionMeta])));

    const result = await setup().callJson('jira_getProjectFields', { projectKey: 'ACS' });

    expect(mocked.createFields).toHaveBeenCalledWith('10001', 'ACS', '50', '0');
    expect(mocked.createFields).toHaveBeenCalledWith('10002', 'ACS', '50', '0');
    expect(result.data).toEqual([
      { fieldId: 'summary', name: 'Summary', custom: false, schemaType: 'string', issueTypes: ['Bug', 'Task'], requiredFor: ['Bug', 'Task'] },
      expect.objectContaining({ fieldId: 'customfield_10100', custom: true, issueTypes: ['Bug'], requiredFor: ['Bug'] }),
      expect.objectContaining({ fieldId: 'customfield_10200', issueTypes: ['Task'], requiredFor: [] }),
    ]);
  });

  it('reports API errors', async () => {
    mocked.issueTypes.mockResolvedValue(page([bugType]));
    mocked.createFields.mockRejectedValue(apiError(403, 'Forbidden'));

    expect(await errorText('jira_getProjectFields', { projectKey: 'ACS' })).toBe('Error fetching project fields: 403 Forbidden');
  });

  it('requires a project key', async () => {
    await expect(setup().call('jira_getProjectFields', {})).rejects.toThrow();
  });
});

describe('jira_getAllProjects', () => {
  const project = {
    expand: 'description,lead,url,projectKeys',
    self: 'https://jira.example.com/rest/api/2/project/10000',
    id: '10000',
    key: 'ACS',
    name: 'Access',
    avatarUrls: { '48x48': 'https://jira.example.com/avatar' },
    projectCategory: { self: 'x', id: '10010', name: 'Inspection', description: '' },
    projectTypeKey: 'software',
    archived: false,
    description: 'Access control system',
    lead,
  };

  it('lists projects without details by default', async () => {
    mocked.allProjects.mockResolvedValue([project]);

    const result = await setup().callJson('jira_getAllProjects', {});

    expect(mocked.allProjects).toHaveBeenCalledWith(false, undefined);
    expect(result.data).toEqual([{ id: '10000', key: 'ACS', name: 'Access', projectTypeKey: 'software', category: 'Inspection' }]);
  });

  it('expands the description and lead when details are asked for', async () => {
    mocked.allProjects.mockResolvedValue([{ ...project, archived: true }]);

    const result = await setup().callJson('jira_getAllProjects', { includeArchived: true, includeDetails: true });

    expect(mocked.allProjects).toHaveBeenCalledWith(true, 'description,lead');
    expect(result.data[0]).toEqual(expect.objectContaining({
      archived: true,
      description: 'Access control system',
      lead: { name: 'jdoe', key: 'JIRAUSER10100', displayName: 'Jane Doe', active: true },
    }));
  });

  it('reports API errors', async () => {
    mocked.allProjects.mockRejectedValue(apiError(403, 'Forbidden'));

    expect(await errorText('jira_getAllProjects', {})).toBe('Error fetching projects: 403 Forbidden');
  });

  it('rejects a non-boolean includeArchived', async () => {
    await expect(setup().call('jira_getAllProjects', { includeArchived: 'yes' })).rejects.toThrow();
  });
});

describe('jira_searchProjects', () => {
  it('queries the project picker and shapes the matches', async () => {
    mocked.pickProjects.mockResolvedValue({
      header: 'Showing 1 of 1 matching projects',
      total: 1,
      projects: [{ key: 'ACS', name: 'Access', id: 10000, avatar: 'https://jira.example.com/avatar', html: '<b>AC</b>S' }],
    });

    const result = await setup().callJson('jira_searchProjects', { query: ' acc ' });

    expect(mocked.pickProjects).toHaveBeenCalledWith(20, 'acc');
    expect(result.data).toEqual({ total: 1, projects: [{ id: 10000, key: 'ACS', name: 'Access' }] });
  });

  it('passes maxResults through', async () => {
    mocked.pickProjects.mockResolvedValue({ total: 0, projects: [] });

    await setup().callJson('jira_searchProjects', { query: 'acc', maxResults: 5 });

    expect(mocked.pickProjects).toHaveBeenCalledWith(5, 'acc');
  });

  it('reports API errors', async () => {
    mocked.pickProjects.mockRejectedValue(apiError(500, 'Internal Server Error'));

    expect(await errorText('jira_searchProjects', { query: 'acc' })).toBe('Error searching projects: 500 Internal Server Error');
  });

  it('rejects an empty query and more than 100 results', async () => {
    await expect(setup().call('jira_searchProjects', { query: '' })).rejects.toThrow();
    await expect(setup().call('jira_searchProjects', { query: 'acc', maxResults: 101 })).rejects.toThrow();
  });
});

describe('jira_getProjectComponents', () => {
  it('lists and shapes the components of a project', async () => {
    mocked.components.mockResolvedValue([
      {
        self: 'https://jira.example.com/rest/api/2/component/10500', id: '10500', name: 'Backend', description: 'APIs',
        lead, assigneeType: 'COMPONENT_LEAD', realAssigneeType: 'COMPONENT_LEAD', isAssigneeTypeValid: true, project: 'ACS', projectId: 10000, archived: false,
      },
      { id: '10501', name: 'Legacy', assigneeType: 'PROJECT_DEFAULT', archived: true },
    ]);

    const result = await setup().callJson('jira_getProjectComponents', { projectKey: 'ACS' });

    expect(mocked.components).toHaveBeenCalledWith('ACS');
    expect(result.data).toEqual([
      {
        id: '10500', name: 'Backend', description: 'APIs', assigneeType: 'COMPONENT_LEAD',
        lead: { name: 'jdoe', key: 'JIRAUSER10100', displayName: 'Jane Doe', active: true },
      },
      { id: '10501', name: 'Legacy', assigneeType: 'PROJECT_DEFAULT', archived: true },
    ]);
  });

  it('reports API errors', async () => {
    mocked.components.mockRejectedValue(apiError(404, 'Not Found'));

    expect(await errorText('jira_getProjectComponents', { projectKey: 'NOPE' })).toBe('Error fetching project components: 404 Not Found');
  });

  it('requires a project key', async () => {
    await expect(setup().call('jira_getProjectComponents', { projectKey: '' })).rejects.toThrow();
  });
});

describe('jira_batchCreateVersions', () => {
  const created = (id: string, name: string) => ({
    self: `https://jira.example.com/rest/api/2/version/${id}`, id, name, archived: false, released: false, projectId: 10000,
    userStartDate: '01/Jan/26',
  });

  it('creates the versions in order and reports per-item failures', async () => {
    mocked.createVersion
      .mockResolvedValueOnce(created('20001', 'v1.0'))
      .mockRejectedValueOnce(apiError(400, 'Bad Request', { errors: { name: 'A version with this name already exists in this project.' } }));

    const result = await setup().callJson('jira_batchCreateVersions', {
      projectKey: 'ACS',
      versions: [{ name: 'v1.0', startDate: '2026-01-01', releaseDate: '2026-02-01', description: 'First' }, { name: 'v0.9' }],
    });

    expect(mocked.createVersion).toHaveBeenNthCalledWith(1, {
      project: 'ACS', name: 'v1.0', startDate: '2026-01-01', releaseDate: '2026-02-01', description: 'First',
    });
    expect(mocked.createVersion).toHaveBeenNthCalledWith(2, { project: 'ACS', name: 'v0.9' });
    expect(result).toEqual({
      success: true,
      data: {
        projectKey: 'ACS', created: 1, failed: 1,
        results: [
          { index: 0, name: 'v1.0', success: true, version: { id: '20001', name: 'v1.0', archived: false, released: false, projectId: 10000 } },
          {
            index: 1, name: 'v0.9', success: false, error: 'Error creating version: 400 Bad Request',
            details: { errors: { name: 'A version with this name already exists in this project.' } },
          },
        ],
      },
    });
  });

  it('fails the call when no version was created', async () => {
    mocked.createVersion.mockRejectedValue(apiError(403, 'Forbidden'));

    expect(await errorText('jira_batchCreateVersions', { projectKey: 'ACS', versions: [{ name: 'v1' }, { name: 'v2' }] }))
      .toBe('None of the 2 versions were created in ACS.');
    expect(mocked.createVersion).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty list, a blank name and a malformed date', async () => {
    await expect(setup().call('jira_batchCreateVersions', { projectKey: 'ACS', versions: [] })).rejects.toThrow();
    await expect(setup().call('jira_batchCreateVersions', { projectKey: 'ACS', versions: [{ name: ' ' }] })).rejects.toThrow();
    await expect(setup().call('jira_batchCreateVersions', {
      projectKey: 'ACS', versions: [{ name: 'v1', releaseDate: '01/02/2026' }],
    })).rejects.toThrow();
    expect(mocked.createVersion).not.toHaveBeenCalled();
  });
});
