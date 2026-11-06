import type { ConfigKey, ProductDefinition, SourceId, WritableSource } from '../source.js';
import { resolveKeychainBackend, type KeychainBackend } from './keychain-backend.js';

export const KEYCHAIN_ENV_VAR = 'ATLASSIAN_DC_MCP_KEYCHAIN';

export type OsKeychainDeps = {
  resolveBackend: () => KeychainBackend | undefined;
  env: Record<string, string | undefined>;
};

const accountFor = (product: ProductDefinition) => `${product.id}-token`;

/**
 * The token in the OS keychain: macOS Keychain, Windows Credential Manager, or the Secret Service keyring on
 * Linux. Only the token is kept here; the other settings stay in the home file. `ATLASSIAN_DC_MCP_KEYCHAIN=off`
 * leaves the keychain alone, so the token stays in the home file.
 */
export class OsKeychainSource implements WritableSource {
  readonly id: SourceId = 'os-keychain';
  readonly priority = 40;

  private backend: KeychainBackend | undefined;
  private resolved = false;
  private readonly cache = new Map<string, string | undefined>();
  private readonly deps: OsKeychainDeps;

  constructor(deps: Partial<OsKeychainDeps> = {}) {
    this.deps = { resolveBackend: () => resolveKeychainBackend(), env: process.env, ...deps };
  }

  isAvailable(): boolean {
    return this.getBackend() !== undefined;
  }

  read(product: ProductDefinition, key: ConfigKey): string | undefined {
    const backend = key === 'token' ? this.getBackend() : undefined;
    if (!backend) return undefined;
    if (!this.cache.has(product.id)) {
      this.cache.set(product.id, backend.get(accountFor(product)) || undefined);
    }
    return this.cache.get(product.id);
  }

  describe(): string {
    return this.getBackend()?.name ?? 'OS keychain';
  }

  /** Where the product's token is kept, for setup's summary. */
  describeForProduct(product: ProductDefinition): string {
    return `${this.describe()} (service atlassian-dc-mcp, account ${accountFor(product)})`;
  }

  write(product: ProductDefinition, key: ConfigKey, value: string): void {
    if (key !== 'token') throw new Error('The OS keychain only stores the token');
    const backend = this.getBackend();
    if (!backend) throw new Error('There is no OS keychain to use on this machine');
    backend.set(accountFor(product), value);
    this.cache.set(product.id, value);
  }

  clear(product: ProductDefinition, key: ConfigKey): void {
    const backend = key === 'token' ? this.getBackend() : undefined;
    if (!backend) return;
    backend.delete(accountFor(product));
    this.cache.set(product.id, undefined);
  }

  private getBackend(): KeychainBackend | undefined {
    if (!this.resolved) {
      const off = ['off', 'false', '0', 'no'].includes((this.deps.env[KEYCHAIN_ENV_VAR] ?? '').trim().toLowerCase());
      this.backend = off ? undefined : this.deps.resolveBackend();
      this.resolved = true;
    }
    return this.backend;
  }
}
