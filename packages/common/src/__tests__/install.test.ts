import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeDesktopConfigPath, installClaudeCode, installClaudeDesktop, parseInstallArgs } from '../install.js';

const target = { packageName: 'mcp-jira-dc', name: 'jira' };

describe('install --claude-code', () => {
  it('runs claude mcp add with the npx command, through a shell only on Windows', () => {
    const spawn = jest.fn(() => ({ status: 0 }));
    const lines: string[] = [];

    expect(installClaudeCode(target, 'project', (line) => lines.push(line), spawn, 'win32')).toBe(true);
    expect(spawn).toHaveBeenCalledWith('claude', ['mcp', 'add', 'jira', '--scope', 'project', '--', 'npx', '-y', 'mcp-jira-dc'], { stdio: 'inherit', shell: true });
    expect(lines).toEqual(["Added 'jira' to Claude Code (project scope)."]);
  });

  it('refuses an unknown scope before running anything', () => {
    const spawn = jest.fn();

    expect(() => installClaudeCode(target, 'user; rm -rf ~', () => undefined, spawn)).toThrow("is not a Claude Code scope");
    expect(spawn).not.toHaveBeenCalled();
  });

  it('prints the command to run when claude is missing', () => {
    const lines: string[] = [];

    expect(installClaudeCode(target, 'user', (line) => lines.push(line), () => ({ status: null, error: new Error('ENOENT') }))).toBe(false);
    expect(lines[1]).toBe('  claude mcp add jira --scope user -- npx -y mcp-jira-dc');
  });
});

describe('install --claude-desktop', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-'));
    file = path.join(dir, 'Claude', 'claude_desktop_config.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));

  it('creates the configuration when there is none', () => {
    installClaudeDesktop(target, () => undefined, file);

    expect(read()).toEqual({ mcpServers: { jira: { command: 'npx', args: ['-y', 'mcp-jira-dc'] } } });
  });

  it('keeps other servers and settings, backs the file up, and replaces an existing entry', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x' }, jira: { command: 'old' } } }));
    const lines: string[] = [];

    installClaudeDesktop(target, (line) => lines.push(line), file);

    expect(read()).toEqual({ theme: 'dark', mcpServers: { other: { command: 'x' }, jira: { command: 'npx', args: ['-y', 'mcp-jira-dc'] } } });
    expect(fs.readdirSync(path.dirname(file)).filter((name) => name.includes('.bak-'))).toHaveLength(1);
    expect(lines[1]).toMatch(/^Replaced 'jira'/);
  });

  it('leaves a configuration it cannot parse untouched', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ "mcpServers": ');

    expect(() => installClaudeDesktop(target, () => undefined, file)).toThrow("isn't valid JSON");
    expect(fs.readFileSync(file, 'utf8')).toBe('{ "mcpServers": ');
  });

  it("finds Claude Desktop's configuration on each platform", () => {
    expect(claudeDesktopConfigPath({ APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'win32')).toBe(path.join('C:\\Users\\a\\AppData\\Roaming', 'Claude', 'claude_desktop_config.json'));
    expect(claudeDesktopConfigPath({}, 'darwin')).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
    expect(claudeDesktopConfigPath({ XDG_CONFIG_HOME: '/x' }, 'linux')).toBe(path.join('/x', 'Claude', 'claude_desktop_config.json'));
  });
});

describe('parseInstallArgs', () => {
  it('reads the client, scope and name, and rejects unknown options', () => {
    expect(parseInstallArgs(['--claude-code', '--scope', 'local', '--name', 'jira-prod'])).toEqual({ client: 'claude-code', scope: 'local', name: 'jira-prod', help: false });
    expect(() => parseInstallArgs(['--cursor'])).toThrow('Unknown option --cursor');
  });
});
