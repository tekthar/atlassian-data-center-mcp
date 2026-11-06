import { runSetupCli } from '@atlassian-dc-mcp/common';
import { CONFLUENCE_PRODUCT } from './config.js';
import { validateConfluenceCredentials } from './credentials.js';

await runSetupCli(CONFLUENCE_PRODUCT, { validateCredentials: validateConfluenceCredentials });
