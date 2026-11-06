import { execFileSync } from 'node:child_process';
import os from 'node:os';

/*
 * Windows ignores the 0600 mode Node passes when creating a file: the file inherits its folder's permissions,
 * which can include administrators, other users of a shared profile, or backup accounts. These helpers replace
 * a file's permissions with full control for the current user only. Adapted from the abp-mcp bridge.
 */

/** Runs a command and returns its stdout; injectable so the Windows logic is testable on any platform. */
export type RunCommand = (command: string, args: readonly string[]) => string;

const SID = /^S-1-\d+(?:-\d+)+$/;

/** The SID in `whoami /user /fo csv` output: a header row, then `"DOMAIN\user","S-1-5-..."`. */
export function parseWhoamiSid(output: string): string | undefined {
  const rows = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  for (const row of rows.reverse()) {
    const fields = [...row.matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1].replace(/""/g, '"'));
    const sid = fields.find((field) => SID.test(field));
    if (sid) return sid;
  }
  return undefined;
}

/**
 * Who to grant the file to. A SID (`*S-1-...`) always resolves, including for Entra ID (`AzureAD\user`) and
 * domain accounts whose bare user name doesn't; without one, `DOMAIN\user`, and only then the user name.
 */
export function windowsAclIdentity(sid: string | undefined, env: Record<string, string | undefined>, username: string): string {
  if (sid && SID.test(sid)) return `*${sid}`;
  if (env.USERDOMAIN && env.USERNAME) return `${env.USERDOMAIN}\\${env.USERNAME}`;
  return username;
}

/** `icacls` arguments that drop inherited entries and grant only `identity` full control. */
export function icaclsArgs(file: string, identity: string): string[] {
  return [file, '/inheritance:r', '/grant:r', `${identity}:F`];
}

const defaultRun: RunCommand = (command, args) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });

/** Restricts a file to the current Windows user. Throws when `icacls` fails. */
export function restrictToCurrentWindowsUser(file: string, run: RunCommand = defaultRun, env: Record<string, string | undefined> = process.env): void {
  let sid: string | undefined;
  try {
    sid = parseWhoamiSid(run('whoami', ['/user', '/fo', 'csv']));
  } catch {
    sid = undefined;
  }
  run('icacls', icaclsArgs(file, windowsAclIdentity(sid, env, os.userInfo().username)));
}
