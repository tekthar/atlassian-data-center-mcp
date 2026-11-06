# mcp-jira-dc

An MCP server for **Jira Data Center and Jira Server**. It lets Claude and other MCP clients search, create, update and transition issues, and, when you turn them on, work with sprints, worklogs, service desk queues, users, fields and more.

- **63 tools in 18 toolsets.** By default 10 everyday issue tools are listed directly, and 3 gateway tools find and run 43 more, so the rest cost tokens only when used.
- **Sandboxed code execution:** the model can write a short script that combines many read calls and returns only the answer.
- **Tools your Jira account can't use are hidden** at startup.
- **Read-only mode** and an exact tool allowlist for locked-down setups.
- **One `npx` command:** no Python, no Docker.

Not affiliated with or endorsed by Atlassian. Jira is a trademark of Atlassian.

## Requirements

- Node.js 22.22.2 or later
- Jira Data Center or Jira Server, and a personal access token. To create one in Jira, open your profile picture, then **Personal Access Tokens** > **Create token**.

## Quick start

1. Save your Jira address and token:

   ```bash
   npx -y mcp-jira-dc setup
   ```

   On macOS the token goes to the Keychain. Everything else goes to `~/.atlassian-dc-mcp/jira.env` (on Windows, `%USERPROFILE%\.atlassian-dc-mcp\jira.env`), which only your user can read.

2. Add the server to your MCP client.

   Claude Code:

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

To skip `setup` and pass settings directly, add an `env` block to that entry:

```json
"env": { "JIRA_HOST": "jira.example.com", "JIRA_API_TOKEN": "<personal access token>" }
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `JIRA_HOST` | Host name and optional port, without `https://`. Example: `jira.example.com` |
| `JIRA_API_BASE_PATH` | Full REST base URL, used instead of `JIRA_HOST`. Example: `https://example.com/jira/rest` |
| `JIRA_API_TOKEN` | Personal access token |
| `JIRA_DEFAULT_PAGE_SIZE` | Page size for list tools. Default 25. |
| `ATLASSIAN_DC_MCP_CONFIG_FILE` | Absolute path to a dotenv file holding any of these settings, for example one file shared by several tools |

Each setting comes from the first of these places that has it:
1. environment variables;
2. the dotenv file (`ATLASSIAN_DC_MCP_CONFIG_FILE`, or `.env` in the working directory);
3. the file `setup` writes;
4. the macOS Keychain.

In scripts and CI, `setup` also runs without prompts:

```bash
npx -y mcp-jira-dc setup --non-interactive --host jira.example.com --token "$JIRA_TOKEN"
```

`npx -y mcp-jira-dc setup --help` lists every option.

## Choosing which tools are listed

| Variable | Effect |
| --- | --- |
| `TOOLSETS` | Comma-separated toolset names, `default`, or `all`. Example: `default,jira_agile` |
| `READ_ONLY_MODE` | `true` lists only tools that never change Jira. |
| `ENABLED_TOOLS` | Comma-separated tool names. Replaces `TOOLSETS`; read-only mode still applies. |
| `TOOL_GATEWAY` | On by default: tools outside the selected toolsets, apart from destructive ones, are offered through three gateway tools instead of being left out. `off` leaves them out. The gateway is also off while `ENABLED_TOOLS` is set. |
| `CODE_EXECUTION` | On by default: adds `jira_runCode`, which runs JavaScript in a sandbox that can call the read tools. `off` removes it. It is also off while `ENABLED_TOOLS` is set. |
| `PERMISSION_FILTER` | On by default: at startup the server asks Jira for your permissions and hides tools you can't use. `off` turns this off. |
| `JIRA_PERMISSION_PROJECTS` | Comma-separated project keys. Without it, a permission you hold in any project counts. With it, only these projects count. |

Hiding tools saves tokens and avoids calls that would fail. It is not access control: Jira still checks your permissions on every call.

### The tool gateway

Listing every tool costs tokens on every request, so only everyday tools are listed directly. The rest are reached through three small tools:

- `jira_searchTools` finds tools by keyword (for example "sprint issues") and returns their descriptions and input schemas. Its own description names the toolsets it can reach.
- `jira_runReadTool` runs a found tool that only reads Jira.
- `jira_runWriteTool` runs a found tool that changes Jira. Clients can ask before running it, as they do for any write tool.

The gateway applies the same rules as the tool list: read-only mode, the permission filter and the opt-in settings. It never offers destructive tools; turn on their toolset with `TOOLSETS` to use them. A toolset named in `TOOLSETS` is listed directly instead.

### Running code (`jira_runCode`)

Some questions take many tool calls, for example checking every issue in a sprint. `jira_runCode` lets the model write a short JavaScript snippet that makes those calls and returns only the answer, so the intermediate results don't fill the context:

```js
const sprint = await tools.jira_getSprintIssues({ sprintId: 42 });
const blocked = sprint.issues.filter((issue) => issue.status === 'Blocked');
return blocked.map((issue) => issue.key);
```

- **Read tools only:** code can call the read tools the server offers, listed or through the gateway. Tools that change Jira are not available to code, so a client's approval prompts still see every write. Each call goes through the same checks as calling the tool directly.
- **Sandboxed:** the code runs in QuickJS, a JavaScript engine compiled to WebAssembly, inside a separate worker thread. It has no network, file, process or timer access, only `tools`, `callTool` and `console`.
- **Limits:** 30 seconds per run, 50 tool calls with at most 4 at a time, 64 MB of memory, and a 100,000-character result. If the code crashes the engine, only the worker stops; the server keeps running.
- **Install:** the sandbox is two small npm packages (about 1.4 MB) with no native build, so `npx` installs stay as before.

Set `CODE_EXECUTION=off` to remove the tool.

In the table below, **on** toolsets are listed directly, **gateway** toolsets are reached through the gateway, and **off** toolsets need `TOOLSETS`.

| Toolset | Default | Tools |
| --- | --- | --- |
| `jira_issues`: search, read, create and update issues | on | `jira_searchIssues`, `jira_getIssue`, `jira_createIssue`, `jira_updateIssue` |
| `jira_comments`: read, add and edit issue comments | on | `jira_getIssueComments`, `jira_postIssueComment`, `jira_updateIssueComment` |
| `jira_transitions`: list and run workflow transitions | on | `jira_getTransitions`, `jira_transitionIssue` |
| `jira_links`: issue link types, link and unlink issues | gateway | `jira_getIssueLinkTypes`, `jira_linkIssues`, `jira_unlinkIssues` (destructive) |
| `jira_watchers`: watch and unwatch issues as yourself | gateway | `jira_watchIssue`, `jira_unwatchIssue` |
| `jira_versions`: project versions (releases) | gateway | `jira_getProjectVersions`, `jira_getVersion`, `jira_createVersion`, `jira_updateVersion`, `jira_deleteVersion` (destructive, opt-in) |
| `jira_development`: branches, commits and pull requests linked to issues | gateway | `jira_getIssueDevelopmentInfo` |
| `jira_attachments`: download and upload issue attachments | on | `jira_downloadAttachment`, `jira_uploadAttachment` (opt-in) |
| `jira_issue_management`: list a project's issues, bulk-create, assign and delete issues | gateway | `jira_getProjectIssues`, `jira_batchCreateIssues`, `jira_assignIssue`, `jira_deleteIssue` (destructive) |
| `jira_watcher_management`: list an issue's watchers and add or remove other users | gateway | `jira_getIssueWatchers`, `jira_addWatcher`, `jira_removeWatcher` |
| `jira_users`: look up user profiles and assignable users | gateway | `jira_getUserProfile`, `jira_searchAssignableUsers` |
| `jira_fields`: find fields, issue-type create schemas and allowed values | gateway | `jira_searchFields`, `jira_getFieldOptions`, `jira_getCreateFields`, `jira_getProjectIssueTypes`, `jira_getProjectFields` |
| `jira_projects`: list and search projects, list components, create versions in bulk | gateway | `jira_getAllProjects`, `jira_searchProjects`, `jira_getProjectComponents`, `jira_batchCreateVersions` |
| `jira_agile`: boards and sprints, their issues, sprint planning | gateway | `jira_getAgileBoards`, `jira_getBoardIssues`, `jira_getSprintsFromBoard`, `jira_getSprintIssues`, `jira_createSprint`, `jira_updateSprint`, `jira_addIssuesToSprint`, `jira_moveIssuesToBacklog` |
| `jira_worklog`: read and log work time | gateway | `jira_getWorklog`, `jira_addWorklog` |
| `jira_remote_links`: add web links to issues and move issues into epics | gateway | `jira_createRemoteIssueLink`, `jira_linkToEpic` |
| `jira_service_desk`: Jira Service Management desks, queues, request types and requests | off | `jira_getServiceDeskForProject`, `jira_getServiceDeskQueues`, `jira_getQueueIssues`, `jira_getRequestTypes`, `jira_getRequestTypeFields`, `jira_createCustomerRequest` |
| `jira_analytics`: issue timelines, SLAs, epic hierarchy, cross-project links, development info in bulk | gateway | `jira_getIssueDates`, `jira_getIssueSla`, `jira_getProjectEpicHierarchy`, `jira_getCrossProjectDependencies`, `jira_getIssuesDevelopmentInfo` |

### Tools that need an extra setting

- **Deleting versions:** `jira_deleteVersion` is listed only with `JIRA_VERSION_DELETE_ENABLED=true`.
- **Attachments on disk:** `jira_uploadAttachment`, and saving downloaded attachments to disk, work only inside folders you name. Without these settings, `jira_downloadAttachment` returns file contents inline and never touches the disk.

| Variable | Purpose |
| --- | --- |
| `JIRA_ATTACHMENTS_UPLOAD_ENABLED`, `JIRA_ATTACHMENTS_DOWNLOAD_ENABLED` | Turn each direction on. Default off. |
| `JIRA_ATTACHMENTS_UPLOAD_ROOTS`, `JIRA_ATTACHMENTS_DOWNLOAD_ROOTS` | Folders allowed for each direction, separated like your OS `PATH` |
| `JIRA_ATTACHMENTS_DIR` | One folder used for both directions |
| `JIRA_ATTACHMENTS_MAX_UPLOAD_BYTES`, `JIRA_ATTACHMENTS_MAX_DOWNLOAD_BYTES` | Size limits. Default 25 MiB. |

## Security notes

- **Clients can ask before risky calls.** Every tool tells the client whether it only reads, changes data, or deletes.
- **Treat Jira content as data, not instructions.** Issue text, comments and attachments are written by other people. `jira_downloadAttachment` shows an image to the model only when asked to, with `returnContent: 'image'`.

## Related projects

- [mcp-confluence-dc](https://www.npmjs.com/package/mcp-confluence-dc) and [mcp-bitbucket-dc](https://www.npmjs.com/package/mcp-bitbucket-dc): the same approach for Confluence and Bitbucket Data Center.
- [Atlassian's official MCP server](https://github.com/atlassian/atlassian-mcp-server): a remote server for Atlassian Cloud.
- [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian): a Python server for Jira and Confluence, Cloud and Data Center.
- [jira-dc-mcp](https://www.npmjs.com/package/jira-dc-mcp): another Jira Data Center server, with semantic search.

## Acknowledgments

mcp-jira-dc builds on two MIT-licensed projects: [b1ff/atlassian-dc-mcp](https://github.com/b1ff/atlassian-dc-mcp), and [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian), whose Data Center tools were adapted for this server. Their copyright notices are in [LICENSE](LICENSE).

## License

MIT
