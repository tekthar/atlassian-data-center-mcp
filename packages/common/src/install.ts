import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildDefaultRegistry, type ConfigRegistry } from './config/registry.js';
import type { ProductDefinition } from './config/source.js';

/*
 * `npx -y <package> install --claude-code | --claude-desktop`: registers the server with an MCP client, so
 * nobody has to edit JSON by hand. Adapted from the abp-mcp bridge. The client starts the server with
 * `npx -y <package>`; the address and token come from what `setup` saved, never from the client's config.
 */

export const CLAUDE_CODE_SCOPES = ['user', 'project', 'local'] as const;
const NAME = /^[A-Za-z0-9_-]{1,64}$/;

type Log = (line: string) => void;

export type SpawnClaude = (command: string, args: string[], options: { stdio: 'inherit'; shell: boolean }) => { error?: Error; status: number | null };

export interface InstallTarget {
  packageName: string;
  /** The name the client lists the server under, such as `jira`. */
  name: string;
}

export const launchCommand = (packageName: string) => ({ command: 'npx', args: ['-y', packageName] });

/** Adds the server to Claude Code through `claude mcp add`. On Windows the command goes through a shell, so only checked values reach it. */
export function installClaudeCode(target: InstallTarget, scope: string, log: Log, spawn: SpawnClaude = spawnSync, platform = process.platform): boolean {
  if (!(CLAUDE_CODE_SCOPES as readonly string[]).includes(scope)) {
    throw new Error(`'${scope}' is not a Claude Code scope: use ${CLAUDE_CODE_SCOPES.join(', ')}.`);
  }
  const launch = launchCommand(target.packageName);
  const args = ['mcp', 'add', target.name, '--scope', scope, '--', launch.command, ...launch.args];
  const result = spawn('claude', args, { stdio: 'inherit', shell: platform === 'win32' });
  if (result.error || result.status !== 0) {
    log('Could not run `claude`. Run this yourself:');
    log(`  claude ${args.join(' ')}`);
    return false;
  }
  log(`Added '${target.name}' to Claude Code (${scope} scope).`);
  return true;
}

/** Where Claude Desktop keeps its configuration on this platform. */
export function claudeDesktopConfigPath(env: Record<string, string | undefined> = process.env, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return path.join(env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  return path.join(env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'Claude', 'claude_desktop_config.json');
}

function readDesktopConfig(file: string): { mcpServers?: Record<string, unknown> } {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text) as { mcpServers?: Record<string, unknown> };
  } catch (error) {
    throw new Error(`${file} isn't valid JSON (${(error as Error).message}), so it was left as it is. Fix it, then run install again.`);
  }
}

/** Adds the server to Claude Desktop's configuration, after backing the file up. */
export function installClaudeDesktop(target: InstallTarget, log: Log, file = claudeDesktopConfigPath()): void {
  const config = readDesktopConfig(file);
  if (fs.existsSync(file)) {
    const backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(file, backup);
    log(`Backed up ${file} to ${backup}.`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const replacing = config.mcpServers?.[target.name] !== undefined;
  config.mcpServers = { ...config.mcpServers, [target.name]: launchCommand(target.packageName) };
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`);
  fs.renameSync(temporary, file);
  log(`${replacing ? `Replaced '${target.name}' in` : `Added '${target.name}' to`} ${file}. Restart Claude Desktop to load it.`);
}

export interface InstallArgs {
  client?: 'claude-code' | 'claude-desktop';
  scope: string;
  name?: string;
  help: boolean;
}

export function parseInstallArgs(argv: string[]): InstallArgs {
  const args: InstallArgs = { scope: 'user', help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--claude-code' || arg === '--claude-desktop') args.client = arg.slice(2) as InstallArgs['client'];
    else if (arg === '--scope') args.scope = argv[++i] ?? '';
    else if (arg === '--name') args.name = argv[++i] ?? '';
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown option ${arg}.`);
  }
  return args;
}

const HELP = (packageName: string, name: string) => `Usage: npx -y ${packageName} install --claude-code | --claude-desktop [options]

Registers this server with an MCP client. Run \`npx -y ${packageName} setup\` first: the server reads the
address and token setup saved, so nothing secret goes into the client's configuration.

  --claude-code       Run \`claude mcp add\` for you
  --scope <scope>     Claude Code scope: user (default), project or local
  --claude-desktop    Add the server to Claude Desktop's configuration, after backing it up
  --name <name>       The name the client lists the server under (default: ${name})`;

/** Warns when setup hasn't saved what the server needs, since the client would start a server that can't sign in. */
function warnIfNotSetUp(product: ProductDefinition, packageName: string, log: Log, registry: ConfigRegistry): void {
  registry.initialize();
  const host = registry.resolve(product, 'host').value ?? registry.resolve(product, 'apiBasePath').value;
  if (!host || !registry.resolve(product, 'token').value) {
    log(`Warning: no address or token is saved yet, so the server won't start. Run npx -y ${packageName} setup.`);
  }
}

export function runInstallCli(product: ProductDefinition, packageName: string, log: Log = (line) => process.stdout.write(`${line}\n`),
  registry: ConfigRegistry = buildDefaultRegistry()): void {
  const args = parseInstallArgs(process.argv.slice(3));
  const target = { packageName, name: args.name ?? product.id };
  if (args.help || !args.client) {
    log(HELP(packageName, product.id));
    if (!args.help) process.exitCode = 1;
    return;
  }
  if (!NAME.test(target.name)) throw new Error(`'${target.name}' isn't a valid name: use letters, digits, - and _.`);
  warnIfNotSetUp(product, packageName, log, registry);
  if (args.client === 'claude-desktop') installClaudeDesktop(target, log);
  else if (!installClaudeCode(target, args.scope, log)) process.exitCode = 1;
}
