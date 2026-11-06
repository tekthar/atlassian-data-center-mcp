# Security Policy

## Supported versions

The servers (`mcp-jira-dc`, `mcp-confluence-dc` and `mcp-bitbucket-dc`) are released together, with one version, and
are pre-1.0. Until 1.0, security fixes go into the next release only. There is no long-term support branch.

| Version | Supported |
|---|---|
| latest published `0.x` | ✅ |
| any older `0.x` | ❌ please upgrade |

## Reporting a vulnerability

**Please don't open a public issue for a security problem.** That tells attackers about it before users can upgrade.

Report it privately through
[GitHub private vulnerability reporting](https://github.com/tekthar/atlassian-data-center-mcp/security/advisories/new).
It keeps the report private, and lets us work on the fix with you and publish an advisory. If you can't use GitHub,
contact the maintainers through the [Tekthar organization page](https://github.com/tekthar) and we'll arrange a
private channel.

Please include:

- what the problem is and what an attacker could do with it;
- the server and its version: `npx -y mcp-jira-dc` runs the latest one unless your MCP client's config pins a
  version such as `mcp-jira-dc@0.47.0`. Add your Jira, Confluence or Bitbucket version if it matters;
- the settings involved (`TOOLSETS`, `READ_ONLY_MODE`, attachment folders and so on), with tokens and hostnames removed;
- the smallest steps or tool calls that show it;
- whether you have told anyone else.

## What to expect

- **Acknowledgement** within 72 hours.
- **Assessment** within 7 days: severity, affected versions and how we plan to fix it.
- **A fix**, depending on severity:
  - critical (a sandbox escape, a token sent where it shouldn't go, files written outside the allowed folders):
    within 14 days;
  - high (a tool doing more than it declares, a setting that can be bypassed): within 30 days;
  - medium and low: in the next regular release.
- **Credit**, if you'd like it, in the release notes and the advisory.

## What counts as a vulnerability

The servers act with the user's own token, so the question is whether a server does more than the user and their
settings allow. In scope:

- **Escaping the code sandbox**: code run by `jira_runCode` or `confluence_runCode` reaching the network, files,
  processes or environment of the machine; calling a tool that changes data; or stopping the server instead of only
  its own run.
- **Tools that do more than they declare**: a tool marked read-only that changes data; the tool search or the code
  sandbox offering a destructive tool; or a way around `READ_ONLY_MODE`, `ENABLED_TOOLS`, `TOOLSETS`, the opt-in
  settings such as `JIRA_VERSION_DELETE_ENABLED`, or Bitbucket's merge and decline allowlists.
- **Files**: reading or writing outside the configured attachment folders (for example through `..` or a symbolic
  link), or a saved attachment overwriting an existing file.
- **Credentials**: a token written to logs, error messages or tool results; sent to a host other than the configured
  one; or stored where other users of the machine can read it.
- **Dependencies**: a vulnerability in a dependency that can be exploited through these servers.

Out of scope:

- Anything the token's owner is already allowed to do in Jira, Confluence or Bitbucket. Hiding tools trims what the
  agent sees; the products' own permissions are the access control.
- Bugs in Jira, Confluence, Bitbucket or their apps. Please report those to Atlassian or the app's vendor.
- Bugs in MCP clients or in the MCP SDK. Please report those to their projects.
- Prompt injection in itself: issues, pages, comments and files are written by other people, and any agent that reads
  them can be misled. It is in scope when one of these servers makes it worse, for example by running a write without
  the client being told it is a write.
- Attacks that need code execution on the user's machine already.

## Coordinated disclosure

We follow a 90-day disclosure window. Once a fix is released, the advisory is published. If you need longer to
coordinate a fix downstream, say so in your report.
