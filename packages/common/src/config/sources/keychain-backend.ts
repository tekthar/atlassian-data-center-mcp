import { execFileSync as nodeExecFileSync } from 'node:child_process';
import { existsSync as nodeExistsSync } from 'node:fs';
import { createRequire } from 'node:module';

/** Where the OS keeps secrets: one entry per account under the `atlassian-dc-mcp` service. */
export interface KeychainBackend {
  /** Shown to the user, e.g. "Windows Credential Manager". */
  readonly name: string;
  get(account: string): string | undefined;
  set(account: string, value: string): void;
  delete(account: string): void;
}

export const KEYCHAIN_SERVICE = 'atlassian-dc-mcp';
export const SECURITY_BINARY = '/usr/bin/security';
const SECURITY_TIMEOUT_MS = 5000;

export type SecurityCliDeps = {
  execFileSync: typeof nodeExecFileSync;
  existsSync: typeof nodeExistsSync;
};

/*
 * macOS: the `security` command. The token is passed with `-w`, so it is visible in argv to processes of the
 * same user; such a process can already read the keychain through `security` itself. Items `security` creates
 * trust `security`, so reading them through it never prompts, which a native library reading them would.
 */
export function securityCliBackend(deps: SecurityCliDeps = { execFileSync: nodeExecFileSync, existsSync: nodeExistsSync }): KeychainBackend | undefined {
  if (!deps.existsSync(SECURITY_BINARY)) return undefined;
  const run = (args: string[]) => deps.execFileSync(SECURITY_BINARY, args,
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: SECURITY_TIMEOUT_MS });
  return {
    name: 'macOS Keychain',
    get(account) {
      try {
        return String(run(['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'])).replace(/\n$/, '');
      } catch {
        // Exit 44 means not found; a locked keychain also reads as absent, so the resolver moves on.
        return undefined;
      }
    },
    set(account, value) {
      run(['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', account, '-w', value]);
    },
    delete(account) {
      try {
        run(['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account]);
      } catch {
        // Already absent.
      }
    },
  };
}

interface KeyringEntry {
  getPassword(): string | null;
  setPassword(value: string): void;
  deletePassword(): boolean;
}

export interface KeyringModule {
  Entry: new (service: string, account: string, options?: { linux?: { store?: 'secret-service' | 'keyutils' } }) => KeyringEntry;
}

const KEYRING_NAMES: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'Windows Credential Manager',
  linux: 'the Secret Service keyring',
};

/*
 * Windows and Linux: the native @napi-rs/keyring module. On Linux, entries are pinned to the Secret Service
 * (GNOME Keyring, KWallet): without the pin, the module silently falls back to the kernel keyring, which loses
 * its contents at every reboot. A machine without a Secret Service, such as a server, gets `undefined` and
 * keeps the token in the owner-only home file instead.
 */
export function nativeKeyringBackend(platform: NodeJS.Platform, keyring: KeyringModule | undefined): KeychainBackend | undefined {
  const name = KEYRING_NAMES[platform];
  if (!name || !keyring) return undefined;
  const options = platform === 'linux' ? { linux: { store: 'secret-service' as const } } : undefined;
  const entry = (account: string) => new keyring.Entry(KEYCHAIN_SERVICE, account, options);
  try {
    entry('__probe__').getPassword();
  } catch {
    return undefined;
  }
  return {
    name,
    get: (account) => {
      try {
        return entry(account).getPassword() ?? undefined;
      } catch {
        return undefined;
      }
    },
    set: (account, value) => entry(account).setPassword(value),
    delete: (account) => {
      try {
        entry(account).deletePassword();
      } catch {
        // Already absent.
      }
    },
  };
}

const moduleRequire = createRequire(import.meta.url);

/** The native keyring module, or `undefined` when its prebuilt binary isn't installed for this platform. */
export function loadKeyringModule(): KeyringModule | undefined {
  try {
    return moduleRequire('@napi-rs/keyring') as KeyringModule;
  } catch {
    return undefined;
  }
}

/** This machine's keychain, or `undefined` when there is none to use. */
export function resolveKeychainBackend(platform: NodeJS.Platform = process.platform): KeychainBackend | undefined {
  if (platform === 'darwin') return securityCliBackend();
  return nativeKeyringBackend(platform, KEYRING_NAMES[platform] ? loadKeyringModule() : undefined);
}
