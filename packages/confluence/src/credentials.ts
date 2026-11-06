import { credentialValidator } from '@atlassian-dc-mcp/common';
import { ConfluenceService } from './confluence-service.js';

/** Checks a host, base path and token with one request to Confluence; `setup` and `doctor` both use it. */
export const validateConfluenceCredentials = credentialValidator(({ host, apiBasePath, token }) =>
  new ConfluenceService(host || undefined, token, apiBasePath || undefined));
