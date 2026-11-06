import { DefaultConfigRegistry } from '../../config/registry.js';
import type { ConfigKey, ProductDefinition, ReadableSource, SourceId } from '../../config/source.js';
import { OsKeychainSource } from '../../config/sources/os-keychain.js';
import { keychainCheck, nodeCheck, settingsCheck, signInCheck } from '../../doctor/checks.js';
import { runChecks, type DoctorCheck } from '../../doctor/doctor.js';
import { summarizeTools } from '../../doctor/tools-check.js';

const JIRA: ProductDefinition = {
  id: 'jira',
  envVars: { host: 'JIRA_HOST', apiBasePath: 'JIRA_API_BASE_PATH', token: 'JIRA_API_TOKEN', defaultPageSize: 'JIRA_DEFAULT_PAGE_SIZE' },
};

class FixedSource implements ReadableSource {
  constructor(readonly id: SourceId, readonly priority: number, private readonly values: Partial<Record<ConfigKey, string>>) {}
  read(_product: ProductDefinition, key: ConfigKey) { return this.values[key]; }
  describe() { return this.id; }
}

const keychain = (available: boolean, token?: string) => new OsKeychainSource({
  env: {},
  resolveBackend: () => (available ? { name: 'Windows Credential Manager', get: () => token, set: () => undefined, delete: () => undefined } : undefined),
});

const registry = (...sources: ReadableSource[]) => new DefaultConfigRegistry(sources);
const TOKEN = 'NjM4MTI2NjAxOTQ1OkqLz8Rk2Vt9mQe3wXb7HcU1';

describe('doctor checks', () => {
  it('requires Node.js 22.22.2 or later', () => {
    expect(nodeCheck('22.22.2').status).toBe('ok');
    expect(nodeCheck('24.1.0').status).toBe('ok');
    expect(nodeCheck('22.9.0')).toMatchObject({ status: 'fail', fix: expect.stringContaining('22.22.2') });
  });

  it('lists where each setting comes from, with the token masked', () => {
    const result = settingsCheck(registry(new FixedSource('process-env', 100, { host: 'jira.example.com', token: TOKEN })), JIRA, 'mcp-jira-dc');

    expect(result.status).toBe('ok');
    expect(result.notes).toContain('JIRA_HOST: jira.example.com, from the environment');
    expect(result.notes).toContain('JIRA_API_TOKEN: ••••HcU1, from the environment');
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('fails with the setup command when the host or token is missing', () => {
    expect(settingsCheck(registry(), JIRA, 'mcp-jira-dc')).toMatchObject({
      status: 'fail',
      detail: 'missing JIRA_HOST or JIRA_API_BASE_PATH and JIRA_API_TOKEN',
      fix: 'run npx -y mcp-jira-dc setup',
    });
  });

  it('flags a token left in the home file when a keychain is available', () => {
    const result = keychainCheck(registry(new FixedSource('home-file', 60, { token: TOKEN }), keychain(true)), JIRA, 'mcp-jira-dc', {});

    expect(result).toMatchObject({ status: 'warn', fix: 'run npx -y mcp-jira-dc setup again to move it into Windows Credential Manager' });
  });

  it('reports the keychain holding the token, a machine without one, and the off switch', () => {
    expect(keychainCheck(registry(keychain(true, TOKEN)), JIRA, 'p', {}).detail).toBe('token kept in Windows Credential Manager');
    expect(keychainCheck(registry(keychain(false)), JIRA, 'p', {}).detail).toContain('none on this machine');
    expect(keychainCheck(registry(keychain(true)), JIRA, 'p', { ATLASSIAN_DC_MCP_KEYCHAIN: 'off' }).detail).toContain('=off');
  });

  it('signs in with the resolved settings and reports who the token is', async () => {
    const validate = jest.fn(async () => ({ ok: true as const, detail: 'signed in as Alice (alice)' }));
    const config = registry(new FixedSource('home-file', 60, { apiBasePath: 'https://jira.example.com/rest', token: TOKEN }));

    expect(await signInCheck(config, JIRA, validate, 'mcp-jira-dc')).toEqual({ status: 'ok', detail: 'signed in as Alice (alice)' });
    expect(validate).toHaveBeenCalledWith({ host: '', apiBasePath: 'https://jira.example.com/rest', token: TOKEN });
  });

  it('turns a rejected sign-in into a failure with a fix', async () => {
    const validate = async () => ({ ok: false as const, message: '401 Unauthorized' });

    expect(await signInCheck(registry(), JIRA, validate, 'mcp-jira-dc')).toMatchObject({ status: 'fail', detail: '401 Unauthorized' });
  });

  it('summarizes the listed tools, the tool search and the server output', () => {
    const tools = [
      { name: 'jira_getIssue', description: 'Get an issue' },
      { name: 'jira_searchTools', description: 'Find more.\n- jira_agile (8): Boards\n- xray_tests (4): Tests' },
      { name: 'jira_runCode', description: 'Run code' },
    ];

    const result = summarizeTools(tools, ['Permission filter hid 2 Jira tools']);

    expect(result.detail).toMatch(/^3 listed, about [\d,]+ tokens of context$/);
    expect(result.notes).toEqual(['12 more through jira_searchTools', 'jira_runCode is on', 'server: Permission filter hid 2 Jira tools']);
  });
});

describe('runChecks', () => {
  const check = (name: string, status: 'ok' | 'warn' | 'fail', needs?: string[]): DoctorCheck =>
    ({ name, needs, run: () => ({ status, detail: `${name} ${status}`, fix: status === 'ok' ? undefined : `fix ${name}` }) });

  it('prints each check, skips those whose prerequisite failed, and exits 1', async () => {
    const lines: string[] = [];

    const code = await runChecks([check('A', 'ok'), check('B', 'fail'), check('C', 'ok', ['B']), check('D', 'warn')], (line) => lines.push(line));

    expect(code).toBe(1);
    expect(lines).toEqual([
      '✓ A  A ok',
      '✗ B  B fail',
      '     Fix: fix B',
      '- C  skipped: B must pass first',
      '! D  D warn',
      '     Fix: fix D',
    ]);
  });

  it('exits 0 when nothing failed, warnings included', async () => {
    expect(await runChecks([check('A', 'ok'), check('B', 'warn')], () => undefined)).toBe(0);
  });
});
