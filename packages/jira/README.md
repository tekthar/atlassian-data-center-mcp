# mcp-jira-dc

An MCP server for **Jira Data Center and Jira Server**. It lets Claude and other MCP clients search, create, update and transition issues, and, when you turn them on, work with sprints, worklogs, service desk queues, users, fields and more.

- **63 tools in 18 toolsets.** By default you get 20 everyday issue tools; turn on the rest when you need them.
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
| `PERMISSION_FILTER` | On by default: at startup the server asks Jira for your permissions and hides tools you can't use. `off` turns this off. |
| `JIRA_PERMISSION_PROJECTS` | Comma-separated project keys. Without it, a permission you hold in any project counts. With it, only these projects count. |

Hiding tools saves tokens and avoids calls that would fail. It is not access control: Jira still checks your permissions on every call.

| Toolset | Default | Tools |
| --- | --- | --- |
| `jira_issues`: search, read, create and update issues | on | `jira_searchIssues`, `jira_getIssue`, `jira_createIssue`, `jira_updateIssue` |
| `jira_comments`: read, add and edit issue comments | on | `jira_getIssueComments`, `jira_postIssueComment`, `jira_updateIssueComment` |
| `jira_transitions`: list and run workflow transitions | on | `jira_getTransitions`, `jira_transitionIssue` |
| `jira_links`: issue link types, link and unlink issues | on | `jira_getIssueLinkTypes`, `jira_linkIssues`, `jira_unlinkIssues` (destructive) |
| `jira_watchers`: watch and unwatch issues as yourself | on | `jira_watchIssue`, `jira_unwatchIssue` |
| `jira_versions`: project versions (releases) | on | `jira_getProjectVersions`, `jira_getVersion`, `jira_createVersion`, `jira_updateVersion`, `jira_deleteVersion` (destructive, opt-in) |
| `jira_development`: branches, commits and pull requests linked to issues | on | `jira_getIssueDevelopmentInfo` |
| `jira_attachments`: download and upload issue attachments | on | `jira_downloadAttachment`, `jira_uploadAttachment` (opt-in) |
| `jira_issue_management`: list a project's issues, bulk-create, assign and delete issues | off | `jira_getProjectIssues`, `jira_batchCreateIssues`, `jira_assignIssue`, `jira_deleteIssue` (destructive) |
| `jira_watcher_management`: list an issue's watchers and add or remove other users | off | `jira_getIssueWatchers`, `jira_addWatcher`, `jira_removeWatcher` |
| `jira_users`: look up user profiles and assignable users | off | `jira_getUserProfile`, `jira_searchAssignableUsers` |
| `jira_fields`: find fields, issue-type create schemas and allowed values | off | `jira_searchFields`, `jira_getFieldOptions`, `jira_getCreateFields`, `jira_getProjectIssueTypes`, `jira_getProjectFields` |
| `jira_projects`: list and search projects, list components, create versions in bulk | off | `jira_getAllProjects`, `jira_searchProjects`, `jira_getProjectComponents`, `jira_batchCreateVersions` |
| `jira_agile`: boards and sprints, their issues, sprint planning | off | `jira_getAgileBoards`, `jira_getBoardIssues`, `jira_getSprintsFromBoard`, `jira_getSprintIssues`, `jira_createSprint`, `jira_updateSprint`, `jira_addIssuesToSprint`, `jira_moveIssuesToBacklog` |
| `jira_worklog`: read and log work time | off | `jira_getWorklog`, `jira_addWorklog` |
| `jira_remote_links`: add web links to issues and move issues into epics | off | `jira_createRemoteIssueLink`, `jira_linkToEpic` |
| `jira_service_desk`: Jira Service Management desks, queues, request types and requests | off | `jira_getServiceDeskForProject`, `jira_getServiceDeskQueues`, `jira_getQueueIssues`, `jira_getRequestTypes`, `jira_getRequestTypeFields`, `jira_createCustomerRequest` |
| `jira_analytics`: issue timelines, SLAs, epic hierarchy, cross-project links, development info in bulk | off | `jira_getIssueDates`, `jira_getIssueSla`, `jira_getProjectEpicHierarchy`, `jira_getCrossProjectDependencies`, `jira_getIssuesDevelopmentInfo` |

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
