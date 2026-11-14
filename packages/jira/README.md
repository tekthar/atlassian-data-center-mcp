# mcp-jira-dc

**Connect Claude, Cursor and any other MCP client to Jira Data Center and Jira Server, signed in as you.**

The server runs on your machine. Your MCP client starts it and talks to it over stdio; it calls Jira's REST API with
your personal access token, lists the everyday issue tools, and keeps 43 more one search away, plus the tools of
supported Jira apps such as Xray, Zephyr, ScriptRunner, BigPicture and draw.io when they're installed. Jira's own
permissions decide what you can do: the server can hide tools, never unlock them.

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
| Where your token lives | with the service | **on your machine**: your OS keychain, or a file only your user can read |
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

The token goes to your OS keychain: the macOS Keychain, Windows Credential Manager, or on Linux the desktop
keyring (GNOME Keyring or KWallet). Everything else goes to `~/.atlassian-dc-mcp/jira.env`
(`%USERPROFILE%\.atlassian-dc-mcp\jira.env` on Windows), which only your user can read. Without a keychain, such as
on a Linux server, the token goes in that file too.

**2. Connect your client.** `install` registers the server with Claude Code or Claude Desktop for you:

```bash
npx -y mcp-jira-dc install --claude-code      # runs claude mcp add
npx -y mcp-jira-dc install --claude-desktop   # edits Claude Desktop's config, after backing it up
```

Cursor, VS Code and other clients with an `mcpServers` file:

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
| `npx -y mcp-jira-dc install --claude-code [--scope user\|project\|local]` | Registers the server with Claude Code by running `claude mcp add`. |
| `npx -y mcp-jira-dc install --claude-desktop` | Adds the server to Claude Desktop's configuration, after backing it up. |
| `npx -y mcp-jira-dc doctor` | Checks Node.js, where each setting comes from, the keychain, signing in, and the tools your client will see, and says how to fix what's wrong. The token is masked. |

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

## Jira apps

The server also works with Jira apps from the Atlassian Marketplace. An app's tools are offered only when the app is
installed: at startup the server makes one request per app to check, and leaves out the apps that aren't there. Their
toolsets are off by default, so their tools are reached through `jira_searchTools` and cost nothing until used. Jira
Service Management's tools are the `jira_service_desk` toolset in [Toolsets](#toolsets), which you turn on with
`TOOLSETS`.

| App | Versions | Status |
|---|---|---|
| Xray, test management | 8 | Beta |
| ScriptRunner, scripting and automation | 9 | Beta |
| draw.io, diagrams | 11 | Beta, read-only |
| Zephyr, test management | 12 | Beta |
| BigPicture, portfolio and project management | 8 | Beta |
| Jira Service Management | not recorded | Beta |

Beta means built and checked, but not yet run against a live instance of the app. [Supported apps](https://github.com/tekthar/atlassian-data-center-mcp/blob/main/docs/supported-apps.md) lists the
exact versions each app's tools were built from and how they were checked.

**Xray** tools:

| Toolset | Tools |
|---|---|
| `xray_tests`: tests, their steps and relations, test statuses | `xray_getTests`, `xray_getTestSteps`, `xray_getTestRelations`, `xray_getTestStatuses` |
| `xray_test_executions`: a test execution's tests and runs | `xray_getTestExecutionTests`, `xray_addTestsToTestExecution` |
| `xray_test_plans`: a test plan's tests and executions | `xray_getTestPlanTests`, `xray_getTestPlanExecutions`, `xray_addTestsToTestPlan`, `xray_addTestExecutionsToTestPlan` |
| `xray_test_sets`: a test set's tests | `xray_getTestSetTests`, `xray_addTestsToTestSet` |
| `xray_test_runs`: test results | `xray_getTestRun`, `xray_searchTestRuns`, `xray_updateTestRun` |

With `jira_runCode`, one question like *"which tests failed in QA-20, and what defects did they raise?"* becomes one
script: list the execution's tests, then read the failed runs. Adding tests needs Edit Issues on the execution, plan or
set. Xray's own settings decide who may record test results. Removing tests isn't offered yet, because removing a test
from an execution deletes its results.

**ScriptRunner** tools:

| Toolset | Tools |
|---|---|
| `scriptrunner_script_editor`: the script roots and their files | `scriptrunner_listScriptFiles`, `scriptrunner_getScriptFile`, `scriptrunner_saveScriptFile` (destructive, opt-in) |
| `scriptrunner_builtin_scripts`: built-in scripts and the parameters they ask for | `scriptrunner_listBuiltInScripts`, `scriptrunner_getBuiltInScriptParams`, `scriptrunner_runBuiltInScript` (destructive, opt-in) |
| `scriptrunner_features`: listeners, scripted fields, scheduled jobs, REST endpoints, fragments, workflow functions, and the JQL functions ScriptRunner adds | `scriptrunner_getListeners`, `scriptrunner_getScriptedFields`, `scriptrunner_getScheduledJobs`, `scriptrunner_getRestEndpoints`, `scriptrunner_getFragments`, `scriptrunner_getWorkflowFunctions`, `scriptrunner_getJqlFunctions` |
| `scriptrunner_behaviours`: behaviours and where they apply | `scriptrunner_getBehaviours`, `scriptrunner_saveBehaviour`, `scriptrunner_setBehaviourEnabled`, `scriptrunner_mapBehaviour`, `scriptrunner_unmapBehaviour` (all four destructive, opt-in) |
| `scriptrunner_console`: run Groovy on the Jira server | `scriptrunner_runConsoleScript` (destructive, opt-in) |

ScriptRunner decides who may use these: mostly Jira administrators, or the users its own permission settings allow.
Anyone else gets a 403 that says so. Only the JQL function docs are open to every user.

Running Groovy, running a built-in script, saving a script file and changing behaviours can change anything on your
Jira, or everyone's screens, and nothing undoes them. Each of those tools is off until its own setting in [Turning on risky tools](#settings) is `true`,
appears only when `TOOLSETS` names its toolset, and is shown only to Jira administrators. The tool search and
`jira_runCode` never offer them, and your client can ask you before each run.

**draw.io** tools, in the `drawio_diagrams` toolset:

| Tool | What it's for |
|---|---|
| `drawio_listIssueDiagrams` | Lists the draw.io diagrams attached to an issue. |
| `drawio_getDiagram` | Reads one. By default it returns each of its pages as the shapes it holds and the connections between them, by label; `format: "xml"` returns draw.io's XML instead. |

Creating and editing diagrams isn't offered yet: draw.io saves need a preview image that this server can't render.

**Zephyr** tools:

| Toolset | Tools |
|---|---|
| `zephyr_test_cases`: test cases, their latest result, and the ones covering an issue | `zephyr_getTestCase`, `zephyr_searchTestCases`, `zephyr_getLatestTestResult`, `zephyr_getIssueTestCases`, `zephyr_createTestCase` |
| `zephyr_test_cycles`: test cycles, their results, and a project's environments | `zephyr_getTestCycle`, `zephyr_searchTestCycles`, `zephyr_getTestCycleResults`, `zephyr_getEnvironments`, `zephyr_createTestCycle`, `zephyr_recordTestResult` |
| `zephyr_test_plans`: test plans | `zephyr_getTestPlan`, `zephyr_searchTestPlans`, `zephyr_createTestPlan` |

Zephyr's own project permissions decide who may record results and create tests.

Searches take TQL, Zephyr's query language, such as `projectKey = "QA" AND folder = "/Regression"`. Zephyr's API calls a
test cycle a test run, so cycle keys look like `QA-R4`.

**BigPicture** tools:

| Toolset | Tools |
|---|---|
| `bigpicture_boxes`: portfolios, programs, projects and iterations | `bigpicture_getBoxHierarchy`, `bigpicture_getBox`, `bigpicture_getBoxTypesAndStatuses`, `bigpicture_addBox` |
| `bigpicture_issues`: a Jira issue's boxes and BigPicture fields | `bigpicture_getIssueBoxes`, `bigpicture_getIssueFields`, `bigpicture_getAvailableFields`, `bigpicture_updateIssueField` |
| `bigpicture_teams`: teams and their members | `bigpicture_getBoxTeams`, `bigpicture_getGlobalTeams`, `bigpicture_getTeamMembers`, `bigpicture_addTeamMember`, `bigpicture_updateTeamMember`, `bigpicture_removeTeamMember` (destructive) |

BigPicture's own permissions decide who may add boxes and change teams. Setting an issue's BigPicture fields is offered
only to people who can edit issues.

## Settings

Every setting is an environment variable. Each comes from the first of these that has it: the environment, the dotenv
file named by `ATLASSIAN_DC_MCP_CONFIG_FILE`, the file `setup` writes, then the OS
keychain.

**Connecting**

| Variable | Use |
|---|---|
| `JIRA_HOST` | Host name and optional port, without `https://`, e.g. `jira.example.com`. |
| `JIRA_API_BASE_PATH` | Full REST base URL, used instead of `JIRA_HOST`, e.g. `https://example.com/jira/rest`. |
| `JIRA_API_TOKEN` | Personal access token. |
| `JIRA_DEFAULT_PAGE_SIZE` | Page size for list tools. Default 25. |
| `ATLASSIAN_DC_MCP_CONFIG_FILE` | Absolute path to a dotenv file with any of these settings, e.g. one file shared by several servers. |
| `ATLASSIAN_DC_MCP_REQUEST_TIMEOUT_MS` | How long a request to Jira may take. Default 30000. |
| `ATLASSIAN_DC_MCP_KEYCHAIN` | `off` keeps the token out of the OS keychain: `setup` saves it in the file instead, and the server doesn't look in the keychain. |

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
| `JIRA_APPS` | Which [Jira apps](#jira-apps) to offer. Unset or `auto` checks which are installed; a list such as `xray,zephyr,scriptrunner,drawio,bigpicture` offers those without checking; `off` offers none. |

**Turning on risky tools**

| Variable | Use |
|---|---|
| `JIRA_VERSION_DELETE_ENABLED` | `true` lists `jira_deleteVersion`. |
| `JIRA_SCRIPTRUNNER_CONSOLE_ENABLED` | `true` turns on `scriptrunner_runConsoleScript`, which runs Groovy on the Jira server. Also name `scriptrunner_console` in `TOOLSETS`. |
| `JIRA_SCRIPTRUNNER_BUILTIN_RUN_ENABLED` | `true` turns on `scriptrunner_runBuiltInScript`. Also name `scriptrunner_builtin_scripts` in `TOOLSETS`. |
| `JIRA_SCRIPTRUNNER_FILE_SAVE_ENABLED` | `true` turns on `scriptrunner_saveScriptFile`, which creates or replaces script files. Also name `scriptrunner_script_editor` in `TOOLSETS`. |
| `JIRA_SCRIPTRUNNER_BEHAVIOURS_EDIT_ENABLED` | `true` turns on the four tools that create, replace, switch on or off, and map behaviours. Also name `scriptrunner_behaviours` in `TOOLSETS`. |
| `JIRA_ATTACHMENTS_UPLOAD_ENABLED`, `JIRA_ATTACHMENTS_DOWNLOAD_ENABLED` | `true` lets attachments be uploaded from, or saved to, your disk. Default off: downloads come back inline and never touch the disk. |
| `JIRA_ATTACHMENTS_UPLOAD_ROOTS`, `JIRA_ATTACHMENTS_DOWNLOAD_ROOTS` | Folders allowed for each direction, separated like your OS `PATH`. |
| `JIRA_ATTACHMENTS_DIR` | One folder used for both directions. |
| `JIRA_ATTACHMENTS_MAX_UPLOAD_BYTES`, `JIRA_ATTACHMENTS_MAX_DOWNLOAD_BYTES` | Size limits. Default 25 MiB. |

**Audit log**

| Variable | Use |
|---|---|
| `ATLASSIAN_DC_MCP_AUDIT` | `1` writes one JSON line per tool call: the time, server, tool, outcome and duration, never the arguments or results. A tool run through the tool search or from `jira_runCode` is recorded too, with `"via"`. |
| `ATLASSIAN_DC_MCP_AUDIT_FILE` | Where to write it. Default `~/.atlassian-dc-mcp/audit/mcp-jira-dc.jsonl` (mode 0600 on macOS and Linux). It rotates at 5 MB, keeping three old files. |

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

MIT. Part of [Atlassian Data Center MCP](https://github.com/tekthar/atlassian-data-center-mcp), with
[mcp-confluence-dc](https://www.npmjs.com/package/mcp-confluence-dc) and
[mcp-bitbucket-dc](https://www.npmjs.com/package/mcp-bitbucket-dc).
