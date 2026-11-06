import { runInstallCli } from '@atlassian-dc-mcp/common';
import { JIRA_PRODUCT } from './config.js';

try {
  runInstallCli(JIRA_PRODUCT, 'mcp-jira-dc');
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
}
