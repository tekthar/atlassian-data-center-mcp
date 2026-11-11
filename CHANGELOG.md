# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## Unreleased

### Features

* **jira:** ScriptRunner for Jira support. Twelve read tools, reached through `jira_searchTools` when ScriptRunner is installed:
  * the script editor's roots and files;
  * built-in scripts, and the parameters each asks for;
  * script listeners, scripted fields, scheduled jobs, REST endpoints, UI fragments and workflow functions;
  * the JQL functions ScriptRunner adds;
  * behaviours.

  ScriptRunner decides who may use them, mostly Jira administrators. Built from ScriptRunner 9.46.0. See [Supported apps](docs/supported-apps.md#scriptrunner).
* **jira:** opt-in ScriptRunner tools that run or save code. Each is off until its own setting is `true`:
  * `scriptrunner_runConsoleScript` runs Groovy in the script console (`JIRA_SCRIPTRUNNER_CONSOLE_ENABLED`);
  * `scriptrunner_runBuiltInScript` runs a built-in script (`JIRA_SCRIPTRUNNER_BUILTIN_RUN_ENABLED`);
  * `scriptrunner_saveScriptFile` creates a script file, or replaces one when asked (`JIRA_SCRIPTRUNNER_FILE_SAVE_ENABLED`).

  They are destructive and shown only to Jira administrators. Each is listed only when `TOOLSETS` names its toolset, and the tool search and `jira_runCode` never offer them.

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
