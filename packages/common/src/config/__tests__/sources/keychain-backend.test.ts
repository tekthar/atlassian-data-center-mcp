import {
  nativeKeyringBackend,
  securityCliBackend,
  SECURITY_BINARY,
  type KeychainBackend,
  type KeyringModule,
  type SecurityCliDeps,
} from '../../sources/keychain-backend.js';
import { OsKeychainSource } from '../../sources/os-keychain.js';
import type { ProductDefinition } from '../../source.js';

const JIRA: ProductDefinition = {
  id: 'jira',
  envVars: {
    host: 'JIRA_HOST',
    apiBasePath: 'JIRA_API_BASE_PATH',
    token: 'JIRA_API_TOKEN',
    defaultPageSize: 'JIRA_DEFAULT_PAGE_SIZE',
  },
};

const notFound = (status: number) => Object.assign(new Error('security failed'), { status });

function cliSource(execFileSync: jest.Mock) {
  const deps = { execFileSync: execFileSync as unknown as SecurityCliDeps['execFileSync'], existsSync: () => true } as SecurityCliDeps;
  return new OsKeychainSource({ resolveBackend: () => securityCliBackend(deps), env: {} });
}

describe('macOS: the security command', () => {
  it('is unavailable when /usr/bin/security is missing', () => {
    expect(securityCliBackend({ execFileSync: jest.fn() as never, existsSync: () => false })).toBeUndefined();
  });

  it('reads the token, without its trailing newline, from service atlassian-dc-mcp and account <product>-token', () => {
    const execFileSync = jest.fn().mockReturnValueOnce('secret-token\n');

    expect(cliSource(execFileSync).read(JIRA, 'token')).toBe('secret-token');
    expect(execFileSync).toHaveBeenCalledWith(
      SECURITY_BINARY,
      ['find-generic-password', '-s', 'atlassian-dc-mcp', '-a', 'jira-token', '-w'],
      expect.objectContaining({ encoding: 'utf8', timeout: 5000 }),
    );
  });

  it.each([44, 128])('reads nothing when security exits %i (not found, or a locked keychain)', (status) => {
    const execFileSync = jest.fn().mockImplementationOnce(() => { throw notFound(status); });

    expect(cliSource(execFileSync).read(JIRA, 'token')).toBeUndefined();
  });

  it('writes with -U, so an existing entry is updated', () => {
    const execFileSync = jest.fn().mockReturnValueOnce('');

    cliSource(execFileSync).write(JIRA, 'token', 'abc');

    expect(execFileSync).toHaveBeenCalledWith(
      SECURITY_BINARY,
      ['add-generic-password', '-U', '-s', 'atlassian-dc-mcp', '-a', 'jira-token', '-w', 'abc'],
      expect.objectContaining({ encoding: 'utf8' }),
    );
  });

  it('round-trips a token containing shell metacharacters, passed as one argument', () => {
    const tricky = 'a\'b"c$d`e';
    const execFileSync = jest.fn().mockImplementationOnce(() => '').mockImplementationOnce(() => `${tricky}\n`);
    const source = cliSource(execFileSync);

    source.write(JIRA, 'token', tricky);

    expect(execFileSync.mock.calls[0][1].at(-1)).toBe(tricky);
    expect(source.read(JIRA, 'token')).toBe(tricky);
  });

  it('clears with delete-generic-password, ignoring an absent entry', () => {
    const execFileSync = jest.fn().mockImplementationOnce(() => { throw notFound(44); });
    const source = cliSource(execFileSync);

    expect(() => source.clear(JIRA, 'token')).not.toThrow();
    expect(execFileSync.mock.calls[0][1]).toEqual(['delete-generic-password', '-s', 'atlassian-dc-mcp', '-a', 'jira-token']);
    expect(source.read(JIRA, 'token')).toBeUndefined();
  });
});

function fakeKeyring(options: { probeFails?: boolean } = {}) {
  const store = new Map<string, string>();
  const created: Array<{ account: string; options: unknown }> = [];
  const module: KeyringModule = {
    Entry: class {
      constructor(private readonly service: string, private readonly account: string, entryOptions?: unknown) {
        created.push({ account, options: entryOptions });
      }
      getPassword() {
        if (options.probeFails && this.account === '__probe__') throw new Error('Platform failure: DBus error');
        return store.get(`${this.service}/${this.account}`) ?? null;
      }
      setPassword(value: string) {
        store.set(`${this.service}/${this.account}`, value);
      }
      deletePassword() {
        return store.delete(`${this.service}/${this.account}`);
      }
    },
  };
  return { module, store, created };
}

describe('Windows and Linux: the native keyring', () => {
  it('uses Windows Credential Manager without platform options', () => {
    const { module, store, created } = fakeKeyring();
    const backend = nativeKeyringBackend('win32', module) as KeychainBackend;

    backend.set('jira-token', 'secret');

    expect(backend.name).toBe('Windows Credential Manager');
    expect(store.get('atlassian-dc-mcp/jira-token')).toBe('secret');
    expect(created.every((entry) => entry.options === undefined)).toBe(true);
  });

  it('pins Linux entries to the Secret Service, so they never land in the kernel keyring', () => {
    const { module, created } = fakeKeyring();
    const backend = nativeKeyringBackend('linux', module) as KeychainBackend;

    backend.get('jira-token');

    expect(backend.name).toBe('the Secret Service keyring');
    expect(created.map((entry) => entry.options)).toEqual(
      created.map(() => ({ linux: { store: 'secret-service' } })),
    );
  });

  it('reports no keychain when the probe fails, such as on a server without a Secret Service', () => {
    expect(nativeKeyringBackend('linux', fakeKeyring({ probeFails: true }).module)).toBeUndefined();
  });

  it('reports no keychain without the native module, or on other platforms', () => {
    expect(nativeKeyringBackend('win32', undefined)).toBeUndefined();
    expect(nativeKeyringBackend('freebsd', fakeKeyring().module)).toBeUndefined();
  });

  it('reads an absent entry as undefined and deletes quietly', () => {
    const backend = nativeKeyringBackend('win32', fakeKeyring().module) as KeychainBackend;

    expect(backend.get('confluence-token')).toBeUndefined();
    expect(() => backend.delete('confluence-token')).not.toThrow();
  });
});

describe('OsKeychainSource', () => {
  const memoryBackend = (): KeychainBackend & { reads: number } => {
    const values = new Map<string, string>();
    return {
      name: 'Test keychain',
      reads: 0,
      get(account) { this.reads++; return values.get(account); },
      set(account, value) { values.set(account, value); },
      delete(account) { values.delete(account); },
    };
  };

  it('keeps only the token, and never asks the keychain for other settings', () => {
    const resolveBackend = jest.fn(memoryBackend);
    const source = new OsKeychainSource({ resolveBackend, env: {} });

    expect(source.read(JIRA, 'host')).toBeUndefined();
    expect(() => source.write(JIRA, 'host', 'x')).toThrow('only stores the token');
    expect(resolveBackend).not.toHaveBeenCalled();
  });

  it('caches the token after the first read', () => {
    const backend = memoryBackend();
    backend.set('jira-token', 'secret');
    const source = new OsKeychainSource({ resolveBackend: () => backend, env: {} });

    source.read(JIRA, 'token');
    source.read(JIRA, 'token');

    expect(backend.reads).toBe(1);
  });

  it('leaves the keychain alone with ATLASSIAN_DC_MCP_KEYCHAIN=off', () => {
    const resolveBackend = jest.fn(memoryBackend);
    const source = new OsKeychainSource({ resolveBackend, env: { ATLASSIAN_DC_MCP_KEYCHAIN: 'off' } });

    expect(source.isAvailable()).toBe(false);
    expect(source.read(JIRA, 'token')).toBeUndefined();
    expect(resolveBackend).not.toHaveBeenCalled();
  });

  it('names the keychain and the entry for setup', () => {
    const source = new OsKeychainSource({ resolveBackend: memoryBackend, env: {} });

    expect(source.describeForProduct(JIRA)).toBe('Test keychain (service atlassian-dc-mcp, account jira-token)');
  });
});
