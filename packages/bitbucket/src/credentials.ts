import { credentialValidator } from '@atlassian-dc-mcp/common';
import { BitbucketService } from './bitbucket-service.js';

/** Checks a host, base path and token with one request to Bitbucket; `setup` and `doctor` both use it. */
export const validateBitbucketCredentials = credentialValidator(({ host, apiBasePath, token }) =>
  new BitbucketService(host || undefined, token, apiBasePath || undefined));
