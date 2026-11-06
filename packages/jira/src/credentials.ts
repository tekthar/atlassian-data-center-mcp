import { credentialValidator } from '@atlassian-dc-mcp/common';
import { JiraService } from './jira-service.js';

/** Checks a host, base path and token with one request to Jira; `setup` and `doctor` both use it. */
export const validateJiraCredentials = credentialValidator(({ host, apiBasePath, token }) =>
  new JiraService(host || undefined, token, apiBasePath || undefined));
