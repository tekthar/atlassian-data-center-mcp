import { fileURLToPath } from 'node:url';
import { runDoctorCli } from '@atlassian-dc-mcp/common';
import { JIRA_PRODUCT } from './config.js';
import { validateJiraCredentials } from './credentials.js';

// The server entry sits next to this file, in build/ and in the bundled dist/ alike.
const serverEntry = fileURLToPath(new URL('./index.js', import.meta.url));

await runDoctorCli(JIRA_PRODUCT, {
  packageName: 'mcp-jira-dc',
  validateCredentials: validateJiraCredentials,
  server: { command: process.execPath, args: [serverEntry] },
});
