import { runSetupCli } from '@atlassian-dc-mcp/common';
import { JIRA_PRODUCT } from './config.js';
import { validateJiraCredentials } from './credentials.js';

await runSetupCli(JIRA_PRODUCT, { validateCredentials: validateJiraCredentials });
