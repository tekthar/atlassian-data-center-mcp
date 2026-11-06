# mcp-jira-dc

**Connect Claude, Cursor and any other MCP client to Jira Data Center and Jira Server, signed in as you.**

The server runs on your machine. Your MCP client starts it and talks to it over stdio; it calls Jira's REST API with
your personal access token, lists the everyday issue tools, and keeps 43 more one search away. Jira's own permissions
decide what you can do: the server can hide tools, never unlock them.

```bash
npx -y mcp-jira-dc setup                    # saves your Jira address and token
claude mcp add jira -- npx -y mcp-jira-dc   # connects Claude Code
```

> Not affiliated with or endorsed by Atlassian. Jira is a trademark of Atlassian.

## Why run it on your machine?

| | A hosted MCP connector | **mcp-jira-dc** |
|---|---|---|
| Works with Jira Data Center and Server | depends on the service | **yes** |
| Reaches a Jira behind your firewall or VPN | only if Jira is exposed to the service | **yes**: wherever your machine can reach |
| Where your token lives | with the service | **on your machine**: macOS Keychain, or a file only your user can read |
| Hides tools your account can't use | depends on the service | **yes**: reads your Jira permissions at startup |
| Who decides which tools the agent sees | the service | **you**, with a few settings |
| Something to host, approve or pay for | the service | **nothing**: `npx` runs it |

[Atlassian's official MCP server](https://github.com/atlassian/atlassian-mcp-server) is a hosted server for Atlassian
Cloud.

## Install

You need Node.js 22.22.2 or later, Jira Data Center or Jira Server, and a personal access token. To create one, open
your profile picture in Jira, then **Personal Access Tokens** > **Create token**.

**1. Save your address and token.** `setup` asks for them, checks them with one request to Jira, and saves them:

```bash
npx -y mcp-jira-dc setup
```

On macOS the token goes to the Keychain. Everything else goes to `~/.atlassian-dc-mcp/jira.env`
(`%USERPROFILE%\.atlassian-dc-mcp\jira.env` on Windows), which only your user can read.

**2. Connect your client.** Claude Code:

```bash
claude mcp add jira -- npx -y mcp-jira-dc
```

Claude Desktop, Cursor, VS Code and other clients with an `mcpServers` file:

```json
{
  "mcpServers": {
    "jira": { "command": "npx", "args": ["-y", "mcp-jira-dc"] }
  }
}
```

To skip `setup`, put the settings in that entry instead:
`"env": { "JIRA_HOST": "jira.example.com", "JIRA_API_TOKEN": "<personal access token>" }`.

## Commands

| Command | Does |
|---|---|
| `npx -y mcp-jira-dc` | Serves Jira over stdio. This is what your MCP client runs. |
| `npx -y mcp-jira-dc setup` | Asks for your address and token, checks them against Jira, and saves them. |
| `setup --non-interactive --host <host> --token <token>` | The same from flags, for scripts and CI. Exits non-zero if the token doesn't work. Values you leave out come from your existing settings. |
| `setup --help` | Lists every option. |

## What the agent sees

The tool list holds the everyday tools for issues, comments, transitions and attachments, plus four more:

| Tool | What it's for |
|---|---|
| `jira_searchTools` | Finds any other tool by keyword, such as "sprint issues", and returns its description and input schema. Its own description names every toolset it can reach. |
| `jira_runReadTool` | Runs a found tool that only reads Jira. |
| `jira_runWriteTool` | Runs a found tool that changes Jira. Your client can ask you first, as for any write. |
| `jira_runCode` | Runs a short JavaScript snippet that combines several read calls and returns only the answer. |

For a question that takes many calls, `jira_runCode` keeps the intermediate results out of the context:

```js
const { issues } = await tools.jira_getSprintIssues({ sprintId: 42 });
const blocked = issues.filter((issue) => issue.status === 'Blocked');
return blocked.map((issue) => `${issue.key} ${issue.summary}`);
```

The snippet runs in QuickJS, a JavaScript engine compiled to WebAssembly, in its own worker thread. It sees only
`tools`, `callTool` and `console`: no network, files, processes or timers. It can call read tools only, and stops after
30 seconds or 50 tool calls (4 at a time), at 64 MB of memory, or with a result over 100,000 characters. If it crashes
the engine, only that run fails.

## Toolsets

**On** toolsets are listed directly. **Gateway** toolsets are reached through `jira_searchTools`. **Off** toolsets need
`TOOLSETS`.

| Toolset | Default | Tools |
|---|---|---|
| `jira_issues`: search, read, create and update issues | on | `jira_searchIssues`, `jira_getIssue`, `jira_createIssue`, `jira_updateIssue` |
| `jira_comments`: read, add and edit issue comments | on | `jira_getIssueComments`, `jira_postIssueComment`, `jira_updateIssueComment` |
| `jira_transitions`: list and run workflow transitions | on | `jira_getTransitions`, `jira_transitionIssue` |
| `jira_attachments`: download and upload issue attachments | on | `jira_downloadAttachment`, `jira_uploadAttachment` (opt-in) |
| `jira_links`: issue link types, link and unlink issues | gateway | `jira_getIssueLinkTypes`, `jira_linkIssues`, `jira_unlinkIssues` (destructive) |
| `jira_watchers`: watch and unwatch issues as yourself | gateway | `jira_watchIssue`, `jira_unwatchIssue` |
| `jira_versions`: project versions (releases) | gateway | `jira_getProjectVersions`, `jira_getVersion`, `jira_createVersion`, `jira_updateVersion`, `jira_deleteVersion` (destructive, opt-in) |
| `jira_development`: branches, commits and pull requests linked to issues | gateway | `jira_getIssueDevelopmentInfo` |
| `jira_issue_management`: list a project's issues, bulk-create, assign and delete issues | gateway | `jira_getProjectIssues`, `jira_batchCreateIssues`, `jira_assignIssue`, `jira_deleteIssue` (destructive) |
| `jira_watcher_management`: list an issue's watchers and add or remove other users | gateway | `jira_getIssueWatchers`, `jira_addWatcher`, `jira_removeWatcher` |
| `jira_users`: look up user profiles and assignable users | gateway | `jira_getUserProfile`, `jira_searchAssignableUsers` |
| `jira_fields`: find fields, issue-type create schemas and allowed values | gateway | `jira_searchFields`, `jira_getFieldOptions`, `jira_getCreateFields`, `jira_getProjectIssueTypes`, `jira_getProjectFields` |
| `jira_projects`: list and search projects, list components, create versions in bulk | gateway | `jira_getAllProjects`, `jira_searchProjects`, `jira_getProjectComponents`, `jira_batchCreateVersions` |
| `jira_agile`: boards and sprints, their issues, sprint planning | gateway | `jira_getAgileBoards`, `jira_getBoardIssues`, `jira_getSprintsFromBoard`, `jira_getSprintIssues`, `jira_createSprint`, `jira_updateSprint`, `jira_addIssuesToSprint`, `jira_moveIssuesToBacklog` |
| `jira_worklog`: read and log work time | gateway | `jira_getWorklog`, `jira_addWorklog` |
| `jira_remote_links`: add web links to issues and move issues into epics | gateway | `jira_createRemoteIssueLink`, `jira_linkToEpic` |
| `jira_analytics`: issue timelines, SLAs, epic hierarchy, cross-project links, development info in bulk | gateway | `jira_getIssueDates`, `jira_getIssueSla`, `jira_getProjectEpicHierarchy`, `jira_getCrossProjectDependencies`, `jira_getIssuesDevelopmentInfo` |
| `jira_service_desk`: Jira Service Management desks, queues, request types and requests | off | `jira_getServiceDeskForProject`, `jira_getServiceDeskQueues`, `jira_getQueueIssues`, `jira_getRequestTypes`, `jira_getRequestTypeFields`, `jira_createCustomerRequest` |

The tool search never offers a destructive tool. To use one, turn on its toolset with `TOOLSETS`.

## Settings

Every setting is an environment variable. Each comes from the first of these that has it: the environment, the dotenv
file (`ATLASSIAN_DC_MCP_CONFIG_FILE`, or `.env` in the working directory), the file `setup` writes, then the macOS
Keychain.

**Connecting**

| Variable | Use |
|---|---|
| `JIRA_HOST` | Host name and optional port, without `https://`, e.g. `jira.example.com`. |
| `JIRA_API_BASE_PATH` | Full REST base URL, used instead of `JIRA_HOST`, e.g. `https://example.com/jira/rest`. |
| `JIRA_API_TOKEN` | Personal access token. |
| `JIRA_DEFAULT_PAGE_SIZE` | Page size for list tools. Default 25. |
| `ATLASSIAN_DC_MCP_CONFIG_FILE` | Absolute path to a dotenv file with any of these settings, e.g. one file shared by several servers. |
| `ATLASSIAN_DC_MCP_REQUEST_TIMEOUT_MS` | How long a request to Jira may take. Default 30000. |

**Choosing tools**

| Variable | Use |
|---|---|
| `TOOLSETS` | Toolsets to list directly: names, `default`, or `all`, e.g. `default,jira_agile`. |
| `READ_ONLY_MODE` | `true` offers only tools that never change Jira. |
| `ENABLED_TOOLS` | An exact list of tool names. Replaces `TOOLSETS`, and turns the tool search and `jira_runCode` off. |
| `TOOL_GATEWAY` | `off` turns the tool search off: tools outside the selected toolsets are left out. |
| `CODE_EXECUTION` | `off` removes `jira_runCode`. |
| `PERMISSION_FILTER` | `off` lists tools without asking Jira for your permissions first. |
| `JIRA_PERMISSION_PROJECTS` | Project keys, e.g. `ACS,BPO`. Without it, a permission you hold in any project counts; with it, only these projects count. |

**Turning on risky tools**

| Variable | Use |
|---|---|
| `JIRA_VERSION_DELETE_ENABLED` | `true` lists `jira_deleteVersion`. |
| `JIRA_ATTACHMENTS_UPLOAD_ENABLED`, `JIRA_ATTACHMENTS_DOWNLOAD_ENABLED` | `true` lets attachments be uploaded from, or saved to, your disk. Default off: downloads come back inline and never touch the disk. |
| `JIRA_ATTACHMENTS_UPLOAD_ROOTS`, `JIRA_ATTACHMENTS_DOWNLOAD_ROOTS` | Folders allowed for each direction, separated like your OS `PATH`. |
| `JIRA_ATTACHMENTS_DIR` | One folder used for both directions. |
| `JIRA_ATTACHMENTS_MAX_UPLOAD_BYTES`, `JIRA_ATTACHMENTS_MAX_DOWNLOAD_BYTES` | Size limits. Default 25 MiB. |

## What it guarantees

- **It never widens access.** Every request carries your token, so Jira decides what you can do. Hiding a tool trims
  what the agent sees; it never unlocks anything.
- **Writes stay visible.** Every tool tells your client whether it reads, changes or deletes, so the client can ask you
  first. `jira_runCode` can only call read tools.
- **Deleting is always your decision.** Delete tools appear only in toolsets you turn on, never through the tool search
  or `jira_runCode`, and `jira_deleteVersion` also needs its own setting.
- **It never retries a call on its own.** If a request fails, the agent sees Jira's error and decides what to do.
- **It stays out of your files.** Attachments are read from and saved to only the folders you name, and a saved file
  never overwrites an existing one.

Issue text, comments and attachments are written by other people, so treat them as data, not instructions.
`jira_downloadAttachment` shows an image to the model only when asked to, with `returnContent: 'image'`.

## Related projects

- [mcp-confluence-dc](https://www.npmjs.com/package/mcp-confluence-dc) and
  [mcp-bitbucket-dc](https://www.npmjs.com/package/mcp-bitbucket-dc): the same approach for Confluence and Bitbucket
  Data Center.
- [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian): a Python server for Jira and Confluence, Cloud
  and Data Center.
- [jira-dc-mcp](https://www.npmjs.com/package/jira-dc-mcp): another Jira Data Center server, with semantic search.

## Acknowledgments

mcp-jira-dc builds on two MIT-licensed projects: [b1ff/atlassian-dc-mcp](https://github.com/b1ff/atlassian-dc-mcp), and
[sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian), whose Data Center tools were adapted for this
server. Their copyright notices are in [LICENSE](LICENSE).

## License

MIT. Part of [Atlassian Data Center MCP](https://github.com/tekthar/jira-dc-mcp), with
[mcp-confluence-dc](https://www.npmjs.com/package/mcp-confluence-dc) and
[mcp-bitbucket-dc](https://www.npmjs.com/package/mcp-bitbucket-dc).
