import { fileURLToPath } from 'node:url';
import { runDoctorCli } from '@atlassian-dc-mcp/common';
import { BITBUCKET_PRODUCT } from './config.js';
import { validateBitbucketCredentials } from './credentials.js';

// The server entry sits next to this file, in build/ and in the bundled dist/ alike.
const serverEntry = fileURLToPath(new URL('./index.js', import.meta.url));

await runDoctorCli(BITBUCKET_PRODUCT, {
  packageName: 'mcp-bitbucket-dc',
  validateCredentials: validateBitbucketCredentials,
  server: { command: process.execPath, args: [serverEntry] },
});
