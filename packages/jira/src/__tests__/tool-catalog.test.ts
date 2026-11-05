import fs from 'node:fs';
import path from 'node:path';
import { isToolAllowed, resolveToolPolicy } from '@atlassian-dc-mcp/common';
import { JIRA_TOOL_CATALOG } from '../tool-catalog.js';

const registeredInIndex = (): string[] => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
  return [...source.matchAll(/registerTool\(\s*['"]([A-Za-z_]+)['"]/g)].map((match) => match[1]);
};

const allowedBy = (env: Record<string, string>) => {
  const policy = resolveToolPolicy(JIRA_TOOL_CATALOG, env, () => undefined);
  return Object.entries(JIRA_TOOL_CATALOG.tools)
    .filter(([name, entry]) => isToolAllowed(name, entry, policy))
    .map(([name]) => name);
};

describe('JIRA_TOOL_CATALOG', () => {
  it('has an entry for every tool index.ts registers, and nothing else', () => {
    expect(registeredInIndex().sort()).toEqual(Object.keys(JIRA_TOOL_CATALOG.tools).sort());
  });

  it('only references toolsets it defines', () => {
    const toolsets = Object.keys(JIRA_TOOL_CATALOG.toolsets);
    for (const entry of Object.values(JIRA_TOOL_CATALOG.tools)) {
      expect(toolsets).toContain(entry.toolset);
    }
  });

  it('keeps every existing tool available when no policy variable is set', () => {
    expect(allowedBy({})).toEqual(Object.keys(JIRA_TOOL_CATALOG.tools));
  });

  it('exposes only read tools in read-only mode', () => {
    expect(allowedBy({ READ_ONLY_MODE: 'true' })).toEqual([
      'jira_searchIssues',
      'jira_getIssue',
      'jira_getIssueComments',
      'jira_getTransitions',
      'jira_getIssueLinkTypes',
      'jira_getProjectVersions',
      'jira_getVersion',
      'jira_getIssueDevelopmentInfo',
      'jira_downloadAttachment',
    ]);
  });
});
