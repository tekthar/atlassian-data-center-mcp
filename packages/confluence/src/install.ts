import { runInstallCli } from '@atlassian-dc-mcp/common';
import { CONFLUENCE_PRODUCT } from './config.js';

try {
  runInstallCli(CONFLUENCE_PRODUCT, 'mcp-confluence-dc');
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
}
