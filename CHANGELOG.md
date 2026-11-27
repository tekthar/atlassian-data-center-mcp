# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## Unreleased

### Features

* **jira:** Tempo Capacity Planner (formerly Tempo Planner), the next popular Data Center app, read-only for now:
  * `tempoplanner_getPlans` gets plans for a period, for people, a Tempo team, an issue or a project, or your own: what each is for, its dates, hours a day and in total, and its approval;
  * `tempoplanner_getPlan` gets one plan;
  * `tempoplanner_getPlansForReview` lists the plans awaiting your approval, or the ones you approved or rejected.

  Tempo Timesheets serves the same planning API, so the tools are offered with either app. See [Supported apps](docs/supported-apps.md#tempo-capacity-planner).
* **jira:** Tempo Capacity Planner plan changes:
  * `tempoplanner_updatePlan` changes a plan's dates, hours a day (a person's plan) or percent of the team (a team's plan), description, or whether it covers non-working days, keeping the rest;
  * `tempoplanner_deletePlan` deletes a plan. It is destructive, so it is listed only when `TOOLSETS` names the toolset.

  Creating plans waits until the scope a new plan needs is confirmed on a live instance. See [Supported apps](docs/supported-apps.md#tempo-capacity-planner).
* **jira:** Tempo Capacity Planner capacity: `tempoplanner_getCapacity` gives the hours people or a Tempo team have, have planned and have free in a period, with each day's required and planned hours and holidays. Like Tempo, the totals count from today on. See [Supported apps](docs/supported-apps.md#tempo-capacity-planner).

* **jira:** Zephyr Essential cycles, folders and coverage. Three more read tools:
  * `zephyressential_getCycles` lists a version's test cycles, with their build, environment and dates, and how many executions each has, how many ran and how they ended;
  * `zephyressential_getCycleFolders` lists a cycle's folders, with their executions by status;
  * `zephyressential_getRequirementCoverage` checks which tests cover a story or other requirement, with their executions by status and their defects.

  See [Supported apps](docs/supported-apps.md#zephyr-essential).
* **jira:** Zephyr Essential test results. Two write tools:
  * `zephyressential_recordResult` sets an execution's status, such as PASS or FAIL, with a comment and the defects to link;
  * `zephyressential_recordStepResult` does the same for one step of an execution.

  Statuses are taken by name, including ones an administrator added. `zephyressential_getStepResults` now gives each step result's id. See [Supported apps](docs/supported-apps.md#zephyr-essential).
* **jira:** Zephyr Essential cycles you can build. Two more write tools:
  * `zephyressential_createCycle` creates a test cycle in a version, with its build, environment and dates;
  * `zephyressential_addTestsToCycle` adds tests to a cycle or one of its folders, and says which were added and why any were not.

  See [Supported apps](docs/supported-apps.md#zephyr-essential).

## [0.48.0](https://github.com/tekthar/atlassian-data-center-mcp/releases/tag/v0.48.0) (2026-11-24)

**Your agent now works with the Marketplace apps your teams run on Data Center.** The Jira and Confluence servers find
the apps installed on your instance at startup and add their tools: 126 tools for 11 apps, reached through the tool
search so they cost nothing until used.

| What your teams use | Apps | What the agent can do |
|---|---|---|
| Test management | Xray, Zephyr, Zephyr Essential | Find tests, runs and executions, read steps and results, record results, and plan and track test cycles |
| Automation | ScriptRunner, JMWE | Read scripts, listeners, jobs, behaviours and workflow extensions, and their logs. Running or saving code is off unless you turn it on |
| Time tracking | Tempo Timesheets, Timesheet Tracking | Search worklogs with totals, log time, review timesheets, and read planned work and running timers |
| Planning | Structure, BigPicture | Read and reorganize structures and their history, and read and plan boxes, teams, capacity and resources |
| Diagrams | draw.io (Jira and Confluence), Gliffy | Find diagrams and read them as shapes and connections, with their history |

Each app's tools were built from its newest Data Center build and checked as [Supported apps](docs/supported-apps.md)
records. They are beta: not yet run against a live instance of every app. [Open an issue](https://github.com/tekthar/atlassian-data-center-mcp/issues)
with your app's version if something doesn't work.

### Dependencies

* `@inquirer/prompts` 8.8.0, which needs Node.js 22.22.2 or later, as the servers already do; `dotenv` 18.0.10.

### Bug fixes

* **jira:** the Xray tools that add tests or test executions (`xray_addTestsToTestExecution`, `xray_addTestsToTestPlan`, `xray_addTestsToTestSet` and `xray_addTestExecutionsToTestPlan`) reported every key as added. Xray answers success even when it leaves keys out, such as ones that aren't tests, and lists a message for each. The tools now return `requested`, `allAdded`, and `notAdded` with those messages, in place of `added` and `response`.

### Features

* **jira:** Zephyr Essential (formerly Zephyr Squad) support, starting with reading. Three tools, reached through `jira_searchTools` when the app is installed:
  * test executions found with ZQL, a page at a time: each one's test, cycle, version, status, who ran it and when, and its defects;
  * a test's steps, with their data and expected results;
  * an execution's step results, with each status by name.

  It is a different app from Zephyr (formerly Zephyr Scale). Built from Zephyr Essential 11.1.0. See [Supported apps](docs/supported-apps.md#zephyr-essential).
* **jira:** Timesheet Tracking for Jira support, starting with reading. Three tools, reached through `jira_searchTools` when the app is installed:
  * a person's planned work between two days, with hours and the total, optionally narrowed by JQL;
  * the work planned on one issue, by anyone;
  * running timers, everyone's for Jira administrators, or the timers on one issue.

  Built from Timesheet Tracking 9.3.8-jira-11. See [Supported apps](docs/supported-apps.md#timesheet-tracking).
* **confluence:** Gliffy Diagrams support, starting with reading. Four tools, reached through `confluence_searchTools` when Gliffy is installed:
  * find diagrams by name, space or creator;
  * list the diagrams a page shows, including ones from other pages;
  * read a diagram, by its id or by page and name, as its shapes and the connections between them by label, or as Gliffy's own JSON, at the latest or an earlier version;
  * a diagram's versions, with who saved each and when.

  Built from Gliffy 13.5.0. See [Supported apps](docs/supported-apps.md#gliffy).
* **jira:** Structure by Tempo support. Ten tools, reached through `jira_searchTools` when Structure is installed:
  * find the structures shared with you by name, and get one with its owner and sharing rules;
  * read a structure's hierarchy a page at a time: each row's depth, item type and values such as the issue key, summary and status, for the whole structure, one row's subtree or down to a depth, with the rows you may not read marked;
  * a structure's change history, newest first: who added, copied, moved or removed rows, or which synchronizer, and the issues they were;
  * list the structures an issue is in;
  * create a structure, owned by you, and add folders to group its rows;
  * add issues to a structure and move rows, under a row or at the top level, after a row or last; and remove rows, which is destructive, so the tool search never offers it. In a structure built by generators these can also change issues, and the tools return what Structure did.

  Built from Structure 9.14.1. See [Supported apps](docs/supported-apps.md#structure).
* **jira:** JMWE (Jira Misc Workflow Extensions) support. Seven read tools, reached through `jira_searchTools` when JMWE is installed, and one opt-in tool:
  * the workflows that use JMWE, and one workflow's JMWE post-functions, conditions and validators by transition;
  * shared actions, conditions, validators and scripts;
  * event-based and scheduled actions, and how the scheduled ones last ran;
  * execution logs by issue, extension or user, errors and warnings by default;
  * `jmwe_runScheduledAction` starts a scheduled action now (`JIRA_JMWE_SCHEDULED_ACTION_RUN_ENABLED`). Like ScriptRunner's tools that run code, it is destructive, shown only to Jira administrators, listed only when `TOOLSETS` names `jmwe_actions`, and never offered by the tool search or `jira_runCode`.

  JMWE's run route for scheduled actions is a `GET`, so the read tools never call it. Built from JMWE 10.1.3. See [Supported apps](docs/supported-apps.md#jmwe).
* **jira:** Tempo Timesheets support. Nineteen tools, reached through `jira_searchTools` when Tempo is installed:
  * worklogs between two dates, by person, issue, project, epic, Tempo team, account or saved filter, with the total and billable hours of every match;
  * one worklog;
  * timesheet periods, and timesheet approval statuses for a person, a team or a reviewer;
  * logging and changing time on an issue, in hours, as you or someone else, and deleting a worklog, which is destructive, so the tool search never offers it;
  * submitting a timesheet to a reviewer Tempo suggests, and approving, rejecting or reopening one;
  * Tempo accounts, and the account of an issue; Tempo teams, their members with roles and availability, and the teams a person is in.

  Built from Tempo 20.0.1. See [Supported apps](docs/supported-apps.md#tempo-timesheets).
* **jira:** `xray_getTests` takes a saved Jira filter as `filterId`, as well as keys and JQL.

* **jira:** BigPicture support (Appfire). Twenty-three tools, reached through `jira_searchTools` when BigPicture is installed:
  * the box hierarchy of portfolios, programs, projects and iterations, without archived boxes unless asked;
  * one box and the Jira issues it plans, box types and statuses, and adding a box;
  * the boxes a Jira issue is in, and reading and setting its BigPicture fields;
  * teams and their members, and adding and changing team members. Removing one is destructive, so the tool search
    never offers it;
  * resource planning: skills, people's skills and absences, holiday and workload plans and who they apply to, and
    people's capacity between two dates.

  Built from BigPicture 8.70.11.6. See [Supported apps](docs/supported-apps.md#bigpicture).
* **jira:** Zephyr support (SmartBear, formerly Zephyr Scale). Fifteen tools, reached through `jira_searchTools` when Zephyr is installed:
  * test cases, found with TQL, with their latest result, and the test cases covering a Jira issue;
  * test cycles and their execution results, and a project's environments;
  * test plans;
  * recording a test result (with step results and linked defects), or many at once, such as an automated run, and creating test cases, test cycles and test plans.

  Built from Zephyr 12.12.1. See [Supported apps](docs/supported-apps.md#zephyr).
* **jira:** draw.io for Jira, with two read tools reached through `jira_searchTools`:
  * `drawio_listIssueDiagrams` lists an issue's diagrams;
  * `drawio_getDiagram` reads one as its shapes and connections, by label, or as XML.

  The draw.io file decoding and the summary are now in the common package and shared with the Confluence server. Built from draw.io for Jira 11.2.1. Creating and editing diagrams isn't offered for either product yet, because draw.io saves need a preview image this server can't render. See [Supported apps](docs/supported-apps.md#drawio-for-jira).
* **confluence:** app support, as the Jira server has. Apps are found at startup, and `CONFLUENCE_APPS` names the ones to offer without checking. The first app is draw.io, with three read tools reached through `confluence_searchTools`:
  * `drawio_searchDiagrams` finds diagrams by name, space or who changed them last;
  * `drawio_listPageDiagrams` lists the diagrams a page shows, including embedded ones;
  * `drawio_getDiagram` reads a diagram as its shapes and connections, by label, or as draw.io XML.

  It reads compressed diagrams too. Files and page bodies are read in one pass, so a crafted diagram can't stall the server. Reading never writes: draw.io saves a backup attachment when its editor opens an older revision, and the tool turns that off. Built from draw.io 16.1.12. See [Supported apps](docs/supported-apps.md#drawio-for-confluence).
* **jira:** ScriptRunner for Jira support. Twelve read tools, reached through `jira_searchTools` when ScriptRunner is installed:
  * the script editor's roots and files;
  * built-in scripts, and the parameters each asks for;
  * script listeners, scripted fields, scheduled jobs, REST endpoints, UI fragments and workflow functions;
  * the JQL functions ScriptRunner adds;
  * behaviours.

  ScriptRunner decides who may use them, mostly Jira administrators. Built from ScriptRunner 9.46.0. See [Supported apps](docs/supported-apps.md#scriptrunner).
* **jira:** opt-in ScriptRunner tools that run or save code. Each is off until its own setting is `true`:
  * `scriptrunner_runConsoleScript` runs Groovy in the script console (`JIRA_SCRIPTRUNNER_CONSOLE_ENABLED`);
  * `scriptrunner_runBuiltInScript` runs a built-in script, and `scriptrunner_validateBuiltInScript` and `scriptrunner_previewBuiltInScript` check the values and show what it would do first, as ScriptRunner's own page does (`JIRA_SCRIPTRUNNER_BUILTIN_RUN_ENABLED`);
  * `scriptrunner_saveScriptFile` creates a script file, or replaces one when asked (`JIRA_SCRIPTRUNNER_FILE_SAVE_ENABLED`);
  * `scriptrunner_saveBehaviour`, `scriptrunner_setBehaviourEnabled`, `scriptrunner_mapBehaviour` and `scriptrunner_unmapBehaviour` create or replace a behaviour, switch it on or off, and add or remove where it applies (`JIRA_SCRIPTRUNNER_BEHAVIOURS_EDIT_ENABLED`). Replacing a behaviour requires its fields, so it can't lose its rules by accident, and removing a mapping names exactly one.

  They are destructive and shown only to Jira administrators. Each is listed only when `TOOLSETS` names its toolset, and the tool search and `jira_runCode` never offer them.

### Documentation

* [Supported apps](docs/supported-apps.md#checking-newer-builds) records the newest Data Center build each app's tools were checked against, route by route. ScriptRunner's tools match ScriptRunner 10.20, the line for Jira 11, as well as 9.46 for Jira 10. Xray 8.6.1 and draw.io for Confluence 16.1.13 changed none of the routes the tools call.

## [0.47.1](https://github.com/tekthar/atlassian-data-center-mcp/releases/tag/v0.47.1) (2026-11-06)

Two security fixes from a security review. **Upgrade promptly**, and see the first entry if you kept settings in a `.env` file.

### Security

* **configuration:** a `.env` in the working directory is no longer read. MCP clients often start servers inside the project you have open, so the author of a project's `.env` could set the host while the token came from your keychain or home file, and the Jira server sent that token to their host when it started. Settings now come only from the environment, a file named by `ATLASSIAN_DC_MCP_CONFIG_FILE`, the file `setup` writes, and the OS keychain. **If you relied on `.env`:** set `ATLASSIAN_DC_MCP_CONFIG_FILE` to its absolute path in your MCP client's configuration; a server that finds an ignored `.env` with product settings says so.
* **tool search:** with saving downloaded attachments to disk turned on, and the attachments toolset reached through the tool search rather than listed, `jira_downloadAttachment` and `confluence_downloadAttachment` ran through `<product>_runReadTool`, which tells the client it only reads. A client that approves read-only tools without asking could save a file without asking. They now run through `<product>_runWriteTool`, as the directly listed tool already declared. Files were never written outside the configured folders, and never over an existing file.

## [0.47.0](https://github.com/tekthar/atlassian-data-center-mcp/releases/tag/v0.47.0) (2026-11-06)

The first release since the repository went public. The token moves into the OS keychain on every platform and is masked in everything the servers write; `doctor` checks a setup step by step, `install` registers a server with Claude Code or Claude Desktop, and an opt-in audit log records every tool call. The Jira server gains support for Jira apps, starting with Xray. There is no 0.46.0.

**Upgrading on Windows or Linux:** run `npx -y mcp-jira-dc setup` (and the Confluence and Bitbucket equivalents) again to move your token from the home file into the keychain. Until you do, everything keeps working with the token where it is, and `doctor` reminds you.

### Security

* **credentials:** `setup` stores the token in Windows Credential Manager on Windows and in the desktop keyring (Secret Service) on Linux, as it already did in the macOS Keychain. On Linux the token is never put in the kernel keyring, which is cleared at every reboot: without a Secret Service, it stays in the home file. Run `setup` again to move an existing token into the keychain. `ATLASSIAN_DC_MCP_KEYCHAIN=off` keeps the keychain out of it.
* **credentials:** on Windows, the home file is limited to your account (`icacls`), instead of inheriting the profile folder's permissions. `setup` doesn't save the token in a file it couldn't limit.
* **credentials:** each server masks its token in every tool result and in everything written to stderr, including a token an error message echoes back.

### Features

* **install:** `npx -y mcp-jira-dc install --claude-code` runs `claude mcp add` for you, and `--claude-desktop` adds the server to Claude Desktop's configuration after backing it up. A configuration it can't parse is left untouched. The client starts the server with `npx`; nothing secret goes into its configuration.
* **audit log:** `ATLASSIAN_DC_MCP_AUDIT=1` writes one JSON line per tool call, with the time, server, tool, outcome and duration, and never the arguments or results, to `~/.atlassian-dc-mcp/audit/<server>.jsonl` (or `ATLASSIAN_DC_MCP_AUDIT_FILE`). Tools run through the tool search or from code are recorded with `via`. It rotates at 5 MB, and a failed write never fails a tool call.
* **doctor:** `npx -y mcp-jira-dc doctor` (and the Confluence and Bitbucket equivalents) checks the setup one step at a time and says how to fix the first problem: the Node.js version, where each setting comes from, the OS keychain, signing in, and the tools an MCP client will see. It starts the server as a client would, so the tool count, context size, tool search, code tool and any startup warnings (such as tools the permission filter hid) are what the agent really gets. The token is masked. `setup` now also says who the token signs in as.
* **jira apps:** the Jira server can now use Jira apps from the Atlassian Marketplace. An app's tools are offered only when it is installed: at startup the server makes one request per app to check, in parallel with the permission check, and skips it when no app tool could be offered. `JIRA_APPS` names apps to offer without checking, or `off` turns apps off. App toolsets are off by default and reached through the tool search.
* **xray:** 15 tools for Xray test management in five toolsets: tests, test executions, test plans, test sets and test runs. Read tests, steps and relations; list and add tests to executions, plans and sets; read, search and record test runs. Paths and request bodies come from the Xray 8.6 Data Center app's own REST resources.

### Documentation

* the repository is now [tekthar/atlassian-data-center-mcp](https://github.com/tekthar/atlassian-data-center-mcp); old links redirect
* [Supported apps](docs/supported-apps.md) lists the Jira apps with tools, the exact version each was built from, and how it was checked; each README shows a short table
* the README opens with the project's positioning, and credits the projects its code comes from

### Project

* a security policy ([SECURITY.md](SECURITY.md)) with private vulnerability reporting, a [Code of Conduct](CODE_OF_CONDUCT.md), issue forms for bugs, features and Jira app support, a pull request template and code owners
* CodeQL code scanning, dependency review on pull requests, the OpenSSF Scorecard, and Dependabot for npm and GitHub Actions with a 7-day cooldown
* every GitHub Action is pinned to a commit SHA, checkouts don't keep the token, and CI runs with read-only permissions
* the test and development tools use `glob` 14.0.3 and `minimatch` 11.0.3 (npm overrides), fixing GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249 in the versions Jest and nodemon pull in. Neither package ships with the servers

## [0.45.0](https://github.com/tekthar/atlassian-data-center-mcp/releases/tag/v0.45.0) (2026-11-06)

Jira and Confluence list fewer tools and reach more: everyday tools are listed directly, the rest are one search away, and a sandbox lets the model combine many reads into one answer. The default Jira tool list changes; see **Breaking changes** to keep the old one.

### Features

* **tool gateway:** Jira and Confluence list only their everyday tools directly. The other tools are reached through `<product>_searchTools`, `<product>_runReadTool` and `<product>_runWriteTool`, so their schemas cost tokens only when the model looks them up. This makes 43 more Jira tools and 17 more Confluence tools available without turning on their toolsets. `TOOL_GATEWAY=off` turns the gateway off, and it is also off while `ENABLED_TOOLS` is set. The gateway never offers destructive tools.

* **code execution:** `<product>_runCode` runs model-written JavaScript in a sandbox that can call the server's read tools, so a question that takes many calls returns only its answer. The sandbox is QuickJS (WebAssembly) in a worker thread, with no network, file or process access, a 30-second limit and a 50-call limit. Tools that change Jira or Confluence cannot be called from code. On by default; `CODE_EXECUTION=off` removes it.

### Breaking changes

* **jira:** `jira_links`, `jira_watchers`, `jira_versions` and `jira_development` are no longer listed directly by default; they are reached through the gateway. `jira_unlinkIssues` is destructive, so it now needs `TOOLSETS`. To list these tools directly as before, set `TOOLSETS=default,jira_links,jira_watchers,jira_versions,jira_development`.
* **jira:** `jira_service_desk` is still off by default and is not offered through the gateway. Turn it on with `TOOLSETS`.

### Documentation

* the repository README is now a landing page for the three servers; maintainer notes moved to `CONTRIBUTING.md`, and the full configuration reference to `docs/configuration.md`
* the three server READMEs on npm are restyled, with a Commands table, settings grouped by purpose and a "What it guarantees" section
* **confluence:** the README's tool search section no longer uses Jira examples or mentions a permission filter Confluence doesn't have
* `ATLASSIAN_DC_MCP_REQUEST_TIMEOUT_MS` is documented in each server's README

### Build

* each server depends on `quickjs-emscripten-core` and `@jitl/quickjs-wasmfile-release-sync` (about 1.4 MB, WebAssembly, no native build). Bitbucket lists them too because it bundles the same shared code, though it has no code tool
* the release waits for npm to serve a new version before registering it with the MCP Registry

## [0.44.1](https://github.com/tekthar/atlassian-data-center-mcp/releases/tag/v0.44.1) (2026-11-06)

First release from this repository's Release workflow, published with npm trusted publishing. The servers' code is unchanged from 0.44.0.

### Build

* publish to npm, GitHub releases and the MCP Registry when a version bump is merged to `main`
* remove the Lerna release tooling; `scripts/set-version.js` sets the version of all three servers
* point every package's repository, homepage and issue links at tekthar/atlassian-data-center-mcp

## [0.44.0](https://www.npmjs.com/package/mcp-jira-dc/v/0.44.0) (2026-11-06)

First release as `mcp-jira-dc`, `mcp-confluence-dc` and `mcp-bitbucket-dc`: the DC tools ported from sooperset/mcp-atlassian, toolset and read-only filtering, and Jira permission-aware tool lists.

## Earlier versions

Versions 0.43.2 and earlier were released as `@atlassian-dc-mcp/*` by [b1ff/atlassian-dc-mcp](https://github.com/b1ff/atlassian-dc-mcp), which parts of these servers' code come from. Those versions are listed in [its changelog](https://github.com/b1ff/atlassian-dc-mcp/blob/master/CHANGELOG.md).
