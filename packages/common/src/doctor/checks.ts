import type { ConfigRegistry } from '../config/registry.js';
import type { ConfigKey, ProductDefinition } from '../config/source.js';
import { getHomeFilePath } from '../config/sources/home-file.js';
import { KEYCHAIN_ENV_VAR, OsKeychainSource } from '../config/sources/os-keychain.js';
import { maskToken } from '../redact.js';
import type { ValidateCredentials } from '../setup-cli.js';
import type { CheckResult } from './doctor.js';

export const MINIMUM_NODE = '22.22.2';

const parts = (version: string) => version.replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);

function atLeast(version: string, minimum: string): boolean {
  const [a, b] = [parts(version), parts(minimum)];
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

export function nodeCheck(version: string): CheckResult {
  return atLeast(version, MINIMUM_NODE)
    ? { status: 'ok', detail: version }
    : { status: 'fail', detail: `${version} is older than ${MINIMUM_NODE}`, fix: `install Node.js ${MINIMUM_NODE} or later` };
}

const where = (registry: ConfigRegistry, product: ProductDefinition, key: ConfigKey) => {
  const { value, from } = registry.resolve(product, key);
  const origin = !from ? undefined
    : from.sourceId === 'process-env' ? 'the environment'
    : from.sourceId === 'home-file' ? getHomeFilePath(product)
    : from.detail ?? from.sourceId;
  return { value, from: origin };
};

/** Where each setting comes from, so a value set in two places is easy to spot. */
export function settingsCheck(registry: ConfigRegistry, product: ProductDefinition, packageName: string): CheckResult {
  const host = where(registry, product, 'host');
  const base = where(registry, product, 'apiBasePath');
  const token = where(registry, product, 'token');
  const pageSize = where(registry, product, 'defaultPageSize');
  const notes = [
    `${product.envVars.host}: ${host.value ?? '(not set)'}${host.from ? `, from ${host.from}` : ''}`,
    `${product.envVars.apiBasePath}: ${base.value ?? '(not set)'}${base.from ? `, from ${base.from}` : ''}`,
    `${product.envVars.token}: ${maskToken(token.value)}${token.from ? `, from ${token.from}` : ''}`,
    `${product.envVars.defaultPageSize}: ${pageSize.value ?? '25 (default)'}${pageSize.from ? `, from ${pageSize.from}` : ''}`,
  ];
  const missing = [
    ...(host.value || base.value ? [] : [`${product.envVars.host} or ${product.envVars.apiBasePath}`]),
    ...(token.value ? [] : [product.envVars.token]),
  ];
  if (missing.length > 0) {
    return { status: 'fail', detail: `missing ${missing.join(' and ')}`, notes, fix: `run npx -y ${packageName} setup` };
  }
  return { status: 'ok', detail: 'everything needed is set', notes };
}

/** Which keychain this machine offers, and whether the token is in it. */
export function keychainCheck(registry: ConfigRegistry, product: ProductDefinition, packageName: string,
  env: Record<string, string | undefined>): CheckResult {
  const keychain = registry.sources.find((source): source is OsKeychainSource => source instanceof OsKeychainSource);
  const from = registry.resolve(product, 'token').from?.sourceId;
  if ((env[KEYCHAIN_ENV_VAR] ?? '').trim().toLowerCase() === 'off') {
    return { status: 'ok', detail: `not used: ${KEYCHAIN_ENV_VAR}=off` };
  }
  if (!keychain?.isAvailable()) {
    return { status: 'ok', detail: 'none on this machine, so the token is kept in the home file, readable only by you' };
  }
  if (from === 'home-file') {
    return {
      status: 'warn',
      detail: `${keychain.describe()} is available, but the token is in the home file`,
      fix: `run npx -y ${packageName} setup again to move it into ${keychain.describe()}`,
    };
  }
  return { status: 'ok', detail: from === 'os-keychain' ? `token kept in ${keychain.describe()}` : `${keychain.describe()} is available` };
}

/** Signs in with the resolved settings, the way setup validates them. */
export async function signInCheck(registry: ConfigRegistry, product: ProductDefinition, validate: ValidateCredentials,
  packageName: string): Promise<CheckResult> {
  const host = registry.resolve(product, 'host').value ?? '';
  const apiBasePath = registry.resolve(product, 'apiBasePath').value ?? '';
  const result = await validate({ host, apiBasePath, token: registry.resolve(product, 'token').value ?? '' });
  if (result.ok) return { status: 'ok', detail: result.detail ?? `${host || apiBasePath} accepted the token` };
  return {
    status: 'fail',
    detail: result.message,
    fix: `check the address and the token; npx -y ${packageName} setup tests them as you enter them`,
  };
}
