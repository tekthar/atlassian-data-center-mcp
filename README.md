# Atlassian Data Center MCP

[![mcp-jira-dc on npm](https://img.shields.io/npm/v/mcp-jira-dc.svg?label=mcp-jira-dc&logo=npm)](https://www.npmjs.com/package/mcp-jira-dc)
[![mcp-confluence-dc on npm](https://img.shields.io/npm/v/mcp-confluence-dc.svg?label=mcp-confluence-dc&logo=npm)](https://www.npmjs.com/package/mcp-confluence-dc)
[![mcp-bitbucket-dc on npm](https://img.shields.io/npm/v/mcp-bitbucket-dc.svg?label=mcp-bitbucket-dc&logo=npm)](https://www.npmjs.com/package/mcp-bitbucket-dc)
[![CI](https://github.com/tekthar/jira-dc-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tekthar/jira-dc-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/tekthar/jira-dc-mcp.svg)](https://github.com/tekthar/jira-dc-mcp/blob/main/LICENSE)

**Your Jira, Confluence and Bitbucket Data Center, ready for AI agents, without flooding their context.**

Three [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers that let Claude, Cursor and any other MCP
client work in your self-hosted Atlassian tools: search and update issues, read and write pages, review pull requests.
Each is one `npx` command. Your agent signs in with your personal access token, so it can do what you can, and nothing
more.

```bash
npx -y mcp-jira-dc setup                    # ← saves your Jira address and token
claude mcp add jira -- npx -y mcp-jira-dc   # ← connects Claude Code
```

Claude now sees 14 Jira tools: the everyday ones for issues, comments and transitions, plus a search that reaches 43
more when it needs them, and a sandbox where it can combine many reads into one answer.

> A community project. Not affiliated with or endorsed by Atlassian. Jira, Confluence and Bitbucket are trademarks of
> Atlassian.

## Why you'll like it

- **One command, nothing to host**: `npx` runs each server on your machine. No Python, no Docker, no server to run.
  Built for Data Center and Server, the editions Atlassian's own MCP server doesn't cover.
- **A small tool list, with nothing out of reach**: every listed tool costs tokens in every request, so the everyday
  tools are listed and the rest wait behind a search. The agent sees 14 Jira tools instead of 61, and can still use all
  of them.
- **Answers, not pages of JSON**: for a question that takes many calls, the agent writes a short script that makes the
  calls in a sandbox and returns only the answer. One example below returns 226 characters instead of 1,215.
- **Only the tools you can use**: at startup the Jira server reads your permissions and hides what your account could
  never run.
- **Writes stay visible**: every tool tells the client whether it reads, changes or deletes, so the client can ask you
  first. Scripts can only read, and deleting always needs a setting you turn on.
- **Locked down when you need it**: read-only mode, an exact tool allowlist, merges only on the repositories and target
  branches you name, and attachments only inside folders you name.
- **Credentials in the right place**: `setup` checks your token against the server, then stores it in the macOS
  Keychain, or in a file only your user can read.

## The three servers

| Server | npm package | What the agent can do |
|---|---|---|
| **Jira** | [`mcp-jira-dc`](https://www.npmjs.com/package/mcp-jira-dc) | Search with JQL, create, update and transition issues, comments, links, versions, sprints, worklogs, service desk queues, fields and users. 63 tools in 18 toolsets. |
| **Confluence** | [`mcp-confluence-dc`](https://www.npmjs.com/package/mcp-confluence-dc) | Search with CQL, read, create and update pages, page trees, version history and diffs, labels, comments, restrictions and attachments. 26 tools in 11 toolsets. |
| **Bitbucket** | [`mcp-bitbucket-dc`](https://www.npmjs.com/package/mcp-bitbucket-dc) | Browse projects, repositories, files, branches and commits, search code, and review and comment on pull requests. Merging and declining are opt-in. 27 tools plus 2 opt-in. |

Install only the ones you use. They share one configuration format, so a single settings file can serve all three.

## Install

```bash
npx -y mcp-jira-dc setup
```

Requires Node.js 22.22.2 or later, a Data Center or Server instance, and a personal access token. Swap in
`mcp-confluence-dc` or `mcp-bitbucket-dc` for the other servers.

## Crash course

### 1. Save your address and token

`setup` asks for your host and token, makes one authenticated request to check them, and saves them:

```bash
npx -y mcp-jira-dc setup
```

To create a token in Jira or Confluence, open your profile picture, then **Personal Access Tokens** > **Create token**.
In Bitbucket it's **Manage account** > **HTTP access tokens**. In scripts and CI, `setup --non-interactive` takes
everything as flags and exits non-zero when the token doesn't work.

### 2. Connect your agent

With [Claude Code](https://claude.com/claude-code):

```bash
claude mcp add jira -- npx -y mcp-jira-dc
```

Claude Desktop, Cursor, VS Code and other clients with an `mcpServers` file:

```json
{
  "mcpServers": {
    "jira": { "command": "npx", "args": ["-y", "mcp-jira-dc"] },
    "confluence": { "command": "npx", "args": ["-y", "mcp-confluence-dc"] },
    "bitbucket": { "command": "npx", "args": ["-y", "mcp-bitbucket-dc"] }
  }
}
```

Then ask something like *"Which issues in our current sprint are blocked, and who owns them?"*

### 3. Choose what's listed

Every setting is optional. Unset, Jira and Confluence list their everyday tools and offer the rest through the search.

| Setting | What it does |
|---|---|
| `TOOLSETS` | Lists whole toolsets directly, e.g. `default,jira_agile` for a team that lives in sprints. `all` lists everything. |
| `READ_ONLY_MODE=true` | Offers only tools that never change anything. |
| `ENABLED_TOOLS` | An exact allowlist of tool names, for locked-down setups. |
| `TOOL_GATEWAY=off` | Turns the search off: tools outside the selected toolsets are left out. |
| `CODE_EXECUTION=off` | Removes the code sandbox. |
| `PERMISSION_FILTER=off` | Lists Jira tools without checking your permissions first. |

Each server's README lists its toolsets and the settings that turn on risky tools:
[Jira](packages/jira/README.md), [Confluence](packages/confluence/README.md),
[Bitbucket](packages/bitbucket/README.md).

## What the agent sees

These are real responses from the Jira server, run against a test Jira. The tool list holds the everyday tools and four
more:

```text
jira_searchIssues, jira_getIssue, jira_getIssueComments, jira_createIssue, jira_updateIssue,
jira_postIssueComment, jira_updateIssueComment, jira_getTransitions, jira_transitionIssue,
jira_downloadAttachment, jira_searchTools, jira_runReadTool, jira_runWriteTool, jira_runCode
```

Asked about a sprint, the agent searches for a tool. `jira_searchTools` returns the matches with their input schemas
(left out here), and says whether each one reads or writes:

```json
[
  { "name": "jira_getSprintIssues", "toolset": "jira_agile", "access": "read",
    "description": "List the issues in a sprint in the JIRA Data Center edition instance, in rank order, optionally narrowed by JQL. Returns key, summary, status, type, priority and assignee per issue." },
  { "name": "jira_addIssuesToSprint", "toolset": "jira_agile", "access": "write",
    "description": "Move issues into a future or active sprint in the JIRA Data Center edition instance, taking them out of any other sprint. At most 50 issues per call." },
  { "name": "jira_moveIssuesToBacklog", "toolset": "jira_agile", "access": "write",
    "description": "Move issues to the backlog in the JIRA Data Center edition instance, removing them from their future or active sprint. At most 50 issues per call." }
]
```

It can run the read tool with `jira_runReadTool`, or, to answer the question in one step, write a script for
`jira_runCode`:

```js
const { issues } = await tools.jira_getSprintIssues({ sprintId: 42 });
const blocked = issues.filter((issue) => issue.status === 'Blocked');
console.log(`${blocked.length} of ${issues.length} issues are blocked`);
return blocked.map((issue) => `${issue.key} ${issue.summary} (${issue.assignee?.displayName ?? 'unassigned'})`);
```

```json
{
  "result": [
    "PAY-102 Migrate payouts to new ledger (Ben Okafor)",
    "PAY-104 Upgrade payment SDK (Amira Haddad)",
    "PAY-106 Refund API returns 500 on partial refunds (Ben Okafor)"
  ],
  "logs": ["3 of 7 issues are blocked"],
  "toolCalls": 1
}
```

That answer is 226 characters. The full sprint listing it came from is 1,215, and on a real sprint the gap grows with
every issue.

## How it works

Each server runs on your machine as a child process of your MCP client, and calls your Atlassian instance's REST API
with your token:

```mermaid
sequenceDiagram
    autonumber
    participant Agent as 🤖 Claude / Cursor / any MCP client
    participant Server as mcp-jira-dc<br/>(on your machine)
    participant Sandbox as Code sandbox<br/>(QuickJS, own thread)
    participant Jira as 🏢 Jira Data Center

    Agent->>Server: tools/list
    Server-->>Agent: everyday tools, search, run tools, runCode

    Agent->>Server: jira_searchTools "sprint issues"
    Server-->>Agent: matching tools with their schemas

    Agent->>Server: jira_runCode (a short script)
    Server->>Sandbox: run the script
    Sandbox->>Server: tools.jira_getSprintIssues(...)
    Server->>Jira: GET /rest/agile/1.0/sprint/42/issue
    Jira-->>Server: the sprint's issues
    Server-->>Sandbox: issue data
    Sandbox-->>Server: the script's return value
    Server-->>Agent: the answer, and console output
```

The script runs in [QuickJS](https://github.com/justjake/quickjs-emscripten), a JavaScript engine compiled to
WebAssembly, in its own worker thread. It can't reach the network, files or your processes, only the read tools. It is
stopped after 30 seconds or 50 tool calls, and if it crashes the engine, only that run fails.

### Compared with listing every tool

The same Jira server with `TOOLSETS=all`, against the defaults:

| | Defaults | Every tool listed |
|---|---|---|
| Tools in every request | 14 (about 13,900 characters of schema) | 61 (about 56,000 characters) |
| Reaching a less common tool | One search, then a call | A direct call |
| A question that takes many calls | One script, returning only the answer | One call per step, every result in context |
| Writes | One at a time, each visible to the client | One at a time, each visible to the client |
| Deleting | Only toolsets you turn on | Listed with everything else |

## How do we know it works?

An agent acts with your account, so a tool that does more than it says is a real problem. More than 1,000 automated
tests run on every pull request, on Ubuntu and on Windows:

- **Every tool is accounted for**: a tool missing from its server's catalog stops the server from starting. Tests check
  that read-only mode offers only read tools, that every Jira tool that changes data names the permission it needs
  (apart from the few anyone can run, like watching an issue yourself), and that the search never offers a destructive
  tool.
- **The sandbox is attacked on purpose**: tests try to reach `require`, `process` and the network, and run busy loops,
  promises that never settle, runaway recursion, a native stack overflow and unbounded memory. Each must fail cleanly
  while the server keeps working.
- **The shipped package is checked**: CI bundles each server the way npm receives it and loads the bundle, so a missing
  dependency fails the build, not your install.
- **Careful with dependencies**: every version is pinned exactly, new releases must be at least seven days old before we
  take them, and npm packages are published from CI with npm trusted publishing, with no long-lived token.

## Documentation

| Guide | What it covers |
|---|---|
| [Jira server](packages/jira/README.md) | Settings, the 18 toolsets, the permission filter, attachments, deleting versions |
| [Confluence server](packages/confluence/README.md) | Settings, the 11 toolsets, attachments |
| [Bitbucket server](packages/bitbucket/README.md) | Settings, the tools, allowing merges for named repositories |
| [Configuration reference](docs/configuration.md) | Every `setup` flag, where credentials are stored, the order settings are read in, full client configurations |
| [Contributing](CONTRIBUTING.md) | Building and testing, how tool selection, the search and the sandbox work, releasing |
| [Changelog](CHANGELOG.md) | What each release changed |

## Status and roadmap

The servers are at **0.44** on npm. The tool search and code execution are on `main` and ship in the next release;
they change which Jira tools are listed by default, and the [changelog](CHANGELOG.md) says how to keep the old list.
Until 1.0, minor versions may include breaking changes, and the changelog describes them. Coming next:

- Jira Data Center apps (plugins), reached through the tool search so they cost nothing until used
- Jira administration tools
- test management

## Have a question? Want to help?

Questions, ideas and bug reports are welcome as [issues](https://github.com/tekthar/jira-dc-mcp/issues). To contribute
code or docs, read the [contributing guide](CONTRIBUTING.md) first.

```
packages/jira/          mcp-jira-dc
packages/confluence/    mcp-confluence-dc
packages/bitbucket/     mcp-bitbucket-dc
packages/common/        shared code (configuration, setup, tool selection, the tool search, the code sandbox),
                        bundled into each server and never published on its own
scripts/                bundling, versioning and release scripts
docs/                   guides
```

To run the tests:

```bash
npm install
npm run build
npm test
```

## Credits and licence

MIT licence.

This project is Tekthar's fork of [b1ff/atlassian-dc-mcp](https://github.com/b1ff/atlassian-dc-mcp), and its Data
Center tools are adapted from [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian). Both are MIT
licensed, and their notices are in [LICENSE](LICENSE). Thank you to both. It is built on the official
[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and
[quickjs-emscripten](https://github.com/justjake/quickjs-emscripten), and maintained by
[Tekthar](https://github.com/tekthar).

The npm package named `jira-dc-mcp` is a different project; ours are `mcp-jira-dc`, `mcp-confluence-dc` and
`mcp-bitbucket-dc`.

**Sister projects:** [abp-mcp](https://github.com/tekthar/abp-mcp), your ABP app, ready for AI agents, with the
permissions you already have; and [CASL .NET](https://github.com/tekthar/casl-net), permissions you can read out loud,
for .NET.
