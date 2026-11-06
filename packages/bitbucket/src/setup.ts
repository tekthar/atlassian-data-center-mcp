import { runSetupCli } from '@atlassian-dc-mcp/common';
import { BITBUCKET_PRODUCT } from './config.js';
import { validateBitbucketCredentials } from './credentials.js';

await runSetupCli(BITBUCKET_PRODUCT, { validateCredentials: validateBitbucketCredentials });
