import { fileURLToPath } from 'node:url';
import { runDoctorCli } from '@atlassian-dc-mcp/common';
import { CONFLUENCE_PRODUCT } from './config.js';
import { validateConfluenceCredentials } from './credentials.js';

// The server entry sits next to this file, in build/ and in the bundled dist/ alike.
const serverEntry = fileURLToPath(new URL('./index.js', import.meta.url));

await runDoctorCli(CONFLUENCE_PRODUCT, {
  packageName: 'mcp-confluence-dc',
  validateCredentials: validateConfluenceCredentials,
  server: { command: process.execPath, args: [serverEntry] },
});
