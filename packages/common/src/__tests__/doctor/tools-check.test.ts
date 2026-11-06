import { toolsCheck } from '../../doctor/tools-check.js';

jest.setTimeout(20_000);

/** A tiny stand-in MCP server, run with `node -e`. */
const SERVER = `
process.stderr.write('Permission filter hid 1 Jira tools: jira_deleteIssue\\n');
let buffer = '';
process.stdin.setEncoding('utf8').on('data', (chunk) => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\\n')) >= 0) {
    const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    if (message.method === 'initialize') reply(message.id, { protocolVersion: message.params.protocolVersion, capabilities: {}, serverInfo: { name: 'fake', version: '1' } });
    if (message.method === 'tools/list') reply(message.id, message.params.cursor
      ? { tools: [{ name: 'jira_runCode', description: 'Run code' }] }
      : { tools: [{ name: 'jira_getIssue', description: 'Get' }], nextCursor: 'page-2' });
  }
});
function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n'); }
`;

describe('toolsCheck', () => {
  it('lists the tools across pages and shows what the server printed', async () => {
    const result = await toolsCheck({ command: process.execPath, args: ['-e', SERVER] }, process.env);

    expect(result.status).toBe('ok');
    expect(result.detail).toMatch(/^2 listed/);
    expect(result.notes).toEqual(['jira_runCode is on', 'server: Permission filter hid 1 Jira tools: jira_deleteIssue']);
  });

  it('fails with the server output when the server stops', async () => {
    const crash = "process.stderr.write('Missing required environment variables: JIRA_API_TOKEN\\n'); process.exit(1)";

    const result = await toolsCheck({ command: process.execPath, args: ['-e', crash] }, process.env);

    expect(result).toMatchObject({ status: 'fail', detail: expect.stringContaining('the server stopped (exit code 1)') });
    expect(result.notes).toEqual(['server: Missing required environment variables: JIRA_API_TOKEN']);
  });

  it('gives up on a server that never answers', async () => {
    const result = await toolsCheck({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] }, process.env, 300);

    expect(result).toMatchObject({ status: 'fail', detail: expect.stringContaining('no answer within 0.3 seconds') });
  });
});
