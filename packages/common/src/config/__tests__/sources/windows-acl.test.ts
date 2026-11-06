import { icaclsArgs, parseWhoamiSid, restrictToCurrentWindowsUser, windowsAclIdentity } from '../../sources/windows-acl.js';

const WHOAMI = '"User Name","SID"\r\n"CONTOSO\\\\alice","S-1-5-21-1004336348-1177238915-682003330-512"\r\n';

describe('windows-acl', () => {
  it('reads the SID from whoami /user /fo csv', () => {
    expect(parseWhoamiSid(WHOAMI)).toBe('S-1-5-21-1004336348-1177238915-682003330-512');
    expect(parseWhoamiSid('ERROR: unexpected output')).toBeUndefined();
  });

  it('grants by SID, so Entra ID and domain accounts resolve, then falls back to DOMAIN\\user and the user name', () => {
    expect(windowsAclIdentity('S-1-5-21-1-2-3-500', {}, 'alice')).toBe('*S-1-5-21-1-2-3-500');
    expect(windowsAclIdentity(undefined, { USERDOMAIN: 'AzureAD', USERNAME: 'alice' }, 'alice')).toBe('AzureAD\\alice');
    expect(windowsAclIdentity(undefined, {}, 'alice')).toBe('alice');
  });

  it('removes inherited entries and grants only the current user full control', () => {
    expect(icaclsArgs('C:\\Users\\alice\\.atlassian-dc-mcp\\jira.env', '*S-1-5-21-1')).toEqual(
      ['C:\\Users\\alice\\.atlassian-dc-mcp\\jira.env', '/inheritance:r', '/grant:r', '*S-1-5-21-1:F'],
    );
  });

  it('runs whoami, then icacls with the SID', () => {
    const calls: Array<[string, readonly string[]]> = [];
    const run = (command: string, args: readonly string[]) => {
      calls.push([command, args]);
      return command === 'whoami' ? WHOAMI : '';
    };

    restrictToCurrentWindowsUser('jira.env', run, {});

    expect(calls).toEqual([
      ['whoami', ['/user', '/fo', 'csv']],
      ['icacls', ['jira.env', '/inheritance:r', '/grant:r', '*S-1-5-21-1004336348-1177238915-682003330-512:F']],
    ]);
  });

  it('still runs icacls when whoami fails, and throws when icacls does', () => {
    const run = (command: string) => {
      if (command === 'whoami') throw new Error('not found');
      throw new Error('icacls: access denied');
    };

    expect(() => restrictToCurrentWindowsUser('jira.env', run, { USERDOMAIN: 'CONTOSO', USERNAME: 'alice' })).toThrow('access denied');
  });
});
