import { runInstallCli } from '@atlassian-dc-mcp/common';
import { BITBUCKET_PRODUCT } from './config.js';

try {
  runInstallCli(BITBUCKET_PRODUCT, 'mcp-bitbucket-dc');
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
}
