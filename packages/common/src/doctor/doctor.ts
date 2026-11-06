import type { ProductDefinition } from '../config/source.js';
import { buildDefaultRegistry, type ConfigRegistry } from '../config/registry.js';
import type { ValidateCredentials } from '../setup-cli.js';
import { keychainCheck, nodeCheck, settingsCheck, signInCheck } from './checks.js';
import { toolsCheck, type ServerCommand } from './tools-check.js';

export type CheckStatus = 'ok' | 'warn' | 'fail';

/** One check's outcome. `warn` passes, but is flagged; `fix` says what to do about a warning or failure. */
export interface CheckResult {
  status: CheckStatus;
  detail: string;
  fix?: string;
  /** Extra lines shown under the check, such as warnings the server printed. */
  notes?: string[];
}

export interface DoctorCheck {
  name: string;
  /** Checks that must pass first; when one failed, this check is skipped. */
  needs?: string[];
  run(): Promise<CheckResult> | CheckResult;
}

export interface DoctorOptions {
  /** The npm package, e.g. `mcp-jira-dc`, for the commands the fixes suggest. */
  packageName: string;
  validateCredentials: ValidateCredentials;
  /** How to start this server, to list its tools the way an MCP client sees them. */
  server: ServerCommand;
  registry?: ConfigRegistry;
  env?: Record<string, string | undefined>;
  log?: (line: string) => void;
}

const SYMBOL: Record<CheckStatus | 'skip', string> = { ok: '✓', warn: '!', fail: '✗', skip: '-' };

export function doctorChecks(product: ProductDefinition, options: DoctorOptions, registry: ConfigRegistry): DoctorCheck[] {
  const env = options.env ?? process.env;
  return [
    { name: 'Node.js', run: () => nodeCheck(process.versions.node) },
    { name: 'Settings', run: () => settingsCheck(registry, product, options.packageName) },
    { name: 'Keychain', needs: ['Settings'], run: () => keychainCheck(registry, product, options.packageName, env) },
    { name: 'Sign-in', needs: ['Settings'], run: () => signInCheck(registry, product, options.validateCredentials, options.packageName) },
    { name: 'Tools', needs: ['Sign-in'], run: () => toolsCheck(options.server, env) },
  ];
}

/** Runs each check in order and prints it as it finishes. Returns the exit code: 1 when any check failed. */
export async function runChecks(checks: DoctorCheck[], log: (line: string) => void): Promise<number> {
  const failed = new Set<string>();
  const width = Math.max(...checks.map((check) => check.name.length));
  for (const check of checks) {
    const label = check.name.padEnd(width);
    const blocker = check.needs?.find((name) => failed.has(name));
    if (blocker) {
      failed.add(check.name);
      log(`${SYMBOL.skip} ${label}  skipped: ${blocker} must pass first`);
      continue;
    }
    const result = await check.run();
    if (result.status === 'fail') failed.add(check.name);
    log(`${SYMBOL[result.status]} ${label}  ${result.detail}`);
    for (const note of result.notes ?? []) log(`  ${' '.repeat(width)}  ${note}`);
    if (result.fix) log(`  ${' '.repeat(width)}  Fix: ${result.fix}`);
  }
  return failed.size > 0 ? 1 : 0;
}

/** `npx -y <package> doctor`: checks the setup step by step and says how to fix the first thing that's wrong. */
export async function runDoctor(product: ProductDefinition, options: DoctorOptions): Promise<number> {
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const registry = options.registry ?? buildDefaultRegistry();
  registry.initialize();
  log(`${options.packageName} doctor`);
  log('');
  return runChecks(doctorChecks(product, options, registry), log);
}

const HELP = (packageName: string) => `Usage: npx -y ${packageName} doctor

Checks this server's setup one step at a time: Node.js, where each setting comes from, the OS keychain,
signing in, and the tools an MCP client will see. For each problem it says how to fix it.
Exits with 1 when a check fails. Paste the output into a bug report; the token is masked.`;

export async function runDoctorCli(product: ProductDefinition, options: DoctorOptions): Promise<void> {
  const args = process.argv.slice(3);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${HELP(options.packageName)}\n`);
    return;
  }
  process.exitCode = await runDoctor(product, options);
}
