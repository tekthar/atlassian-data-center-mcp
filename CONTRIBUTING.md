# Contributing

Thanks for helping. This guide is for people changing the code. To use the servers, start with the [README](README.md).

Questions, ideas and bug reports are welcome as [issues](https://github.com/tekthar/atlassian-data-center-mcp/issues). For a larger change, open an issue first so we can agree on the approach before you write it.

- **Code of conduct:** everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Security problems:** please don't open a public issue. [SECURITY.md](SECURITY.md) explains how to report one privately.
- **Licence:** contributions are accepted under the project's [MIT licence](LICENSE). By opening a pull request, you agree that your change is released under it.
- **Reviews:** every pull request needs a maintainer's approval, and CI (build, bundle and tests on Ubuntu and Windows, CodeQL and dependency review) must pass. The pull request template lists what reviewers check.
- **Jira apps:** to ask for an app, or to report how a supported app works with your version, use the **Jira app support** issue form. Testing tools against a live instance is one of the most useful contributions.

## Project basics

- **Credits:** parts of the code come from two MIT-licensed projects, [b1ff/atlassian-dc-mcp](https://github.com/b1ff/atlassian-dc-mcp) and [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian). Their notices in [LICENSE](LICENSE) must stay, and a tool ported from sooperset/mcp-atlassian keeps a comment naming what it was ported from.
- **CI:** `.github/workflows/ci.yml` builds, bundles and tests on Ubuntu and Windows. `.github/workflows/release.yml` publishes to npm and the MCP Registry (see [Releasing](#releasing)).
- **Code style:** [CLAUDE.md](CLAUDE.md) and [AI-CONVENTIONS.md](AI-CONVENTIONS.md) have the conventions every change follows.

## Development

This project is structured as an npm monorepo using workspaces. The workspaces are organized in the `packages/` directory, with separate packages for each Atlassian product integration.

CI builds and tests on the minimum supported Node.js version, 22.22.2, with npm 11.21.1. Builds use TypeScript 7 and check
both source files and tests. Jest uses SWC to transform TypeScript tests.
Development and inspector commands use `tsx` to run TypeScript.

Dependency versions are pinned in every `package.json`. The project `.npmrc`
uses `save-exact=true` for future additions and `min-release-age=7` to require
third-party releases to be at least seven days old. Install npm 11 before
installing dependencies:

```bash
npm install --global npm@11.21.1
```

### Installing Dependencies

To install all dependencies for all packages in the monorepo:

```bash
npm install
```

This will install:
- Root-level dependencies defined in the root `package.json`
- All dependencies for each package in the workspaces

To install a dependency for a specific package:

```bash
npm install <package-name> --workspace=packages/jira
```

To install a dependency at the root level:

```bash
npm install <package-name> -W
```

### Building the Project

To build all packages:

```bash
npm run build
```

To build a specific package:

```bash
npm run build --workspace=packages/jira
```

### Running in Development Mode

To run a specific package in development mode:

```bash
npm run dev:jira     # For Jira
npm run dev:confluence  # For Confluence
npm run dev:bitbucket   # For Bitbucket
```

### Settings for local development

For local development, create a `.env` file in the root directory, or a shared dotenv-style file anywhere on disk and point `ATLASSIAN_DC_MCP_CONFIG_FILE` to it, with the following variables:

```
# Jira configuration - choose one of these options:
JIRA_HOST=jira.example.com
# OR
JIRA_API_BASE_PATH=https://jira.example.com/rest
# Note: part /api/2/search/ is added automatically, do not include it
JIRA_API_TOKEN=your-api-token

# Confluence configuration - choose one of these options:
CONFLUENCE_HOST=jira.example.com
# OR
CONFLUENCE_API_BASE_PATH=https://jira.example.com/confluence
# Note: part /rest/api is added automatically, do not include it
CONFLUENCE_API_TOKEN=your-api-token

# Bitbucket configuration - choose one of these options:
BITBUCKET_HOST=jira.example.com
# OR
BITBUCKET_API_BASE_PATH=https://jira.example.com/rest
# Note: part /api/latest/ is added automatically, do not include it
BITBUCKET_API_TOKEN=your-api-token
```

Resolution order for each key is `process.env` → `ATLASSIAN_DC_MCP_CONFIG_FILE` (or `./.env`) → home file (`~/.atlassian-dc-mcp/<product>.env` on macOS/Linux, `%USERPROFILE%\.atlassian-dc-mcp\<product>.env` on Windows) → OS keychain. See the [configuration reference](docs/configuration.md#configuration-sources--precedence).

### Before you open a pull request

```bash
npm run build
npm test
```

Add a test that would have caught the bug you fixed, and an entry under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice. A new tool needs an entry in its server's tool catalog, with a toolset and an access level; the server refuses to start without one.

## Releasing

The three servers are released together with one version. A release is a merged version bump:

1. In a PR, run `node scripts/set-version.js X.Y.Z`. It updates each server's `package.json` and `server.json` and `package-lock.json`. Add an entry to `CHANGELOG.md`.
2. Merge to `main`. `.github/workflows/release.yml` sees an unpublished version, then builds, tests and publishes the three packages to npm, creates the `vX.Y.Z` GitHub release, and publishes the servers to the MCP Registry.

Pushes that don't change the version publish nothing, and packages already on npm are skipped, so running the workflow by hand (Actions → Release → Run workflow on `main`) only publishes what is missing on npm, then retries the GitHub release and the MCP Registry. A prerelease version (`1.0.0-rc.1`) goes to the `next` dist-tag and is marked as a prerelease.

npm auth is [trusted publishing](https://docs.npmjs.com/trusted-publishers): each package trusts `tekthar/atlassian-data-center-mcp` with the workflow `release.yml` and no environment, and there is no `NPM_TOKEN` secret. The trust lasts until someone changes it, so keep the workflow's file name and the repository name. Renaming either means updating the trusted publisher of all three packages on npmjs.com.

## Package names

| Server | npm package and command | MCP registry name |
| --- | --- | --- |
| Jira | `mcp-jira-dc` | `io.github.tekthar/mcp-jira-dc` |
| Confluence | `mcp-confluence-dc` | `io.github.tekthar/mcp-confluence-dc` |
| Bitbucket | `mcp-bitbucket-dc` | `io.github.tekthar/mcp-bitbucket-dc` |

The servers read `~/.atlassian-dc-mcp/<product>.env`, the same files the `@atlassian-dc-mcp/*` packages use, so switching from those packages means changing only the package name in the MCP client config. The MIT notices ship in each package's `LICENSE`, copied from the root `LICENSE` at bundle time.

**How common ships:** `@atlassian-dc-mcp/common` is a private workspace and is never published. That npm scope belongs to another project, so depending on it would install their shared code instead of ours. Each server's `prepack` script builds the workspace and runs `scripts/bundle-server.mjs`, which writes `dist/` with common inlined and every npm dependency left external. The bundle script stops if a server doesn't list one of common's runtime dependencies.

**To try a package before it is published:**

```bash
cd packages/jira
npm pack
npm install -g ./mcp-jira-dc-*.tgz
```

The bundled `dist/` starts in about 0.3 seconds. `npm start` runs the unbundled `build/` instead.

## How tool selection works (Jira and Confluence)

Each server reads these optional environment variables at startup. Unset, a server lists its everyday tools directly and offers the rest through the tool gateway, minus any Jira tools your account lacks the permissions for (see the next section).

| Variable | Effect |
| --- | --- |
| `TOOLSETS` | Comma-separated toolset names, `default`, or `all`. Example: `default,jira_agile`. An unknown name is ignored with a warning; if every name is unknown, no tools are exposed. |
| `READ_ONLY_MODE` | `true` exposes only tools that never change Jira or Confluence. |
| `ENABLED_TOOLS` | Comma-separated exact tool names. Replaces `TOOLSETS`; `READ_ONLY_MODE` still applies. |
| `CODE_EXECUTION` | On by default. Adds `<product>_runCode`, which runs JavaScript in a sandbox that can call the read tools. `off` removes it; `ENABLED_TOOLS` also turns it off. |
| `TOOL_GATEWAY` | On by default. Tools outside the selected toolsets are offered through `<product>_searchTools`, `<product>_runReadTool` and `<product>_runWriteTool` instead of being left out. `off` leaves them out; `ENABLED_TOOLS` also turns it off. |

Opt-in flags such as `JIRA_VERSION_DELETE_ENABLED` and the attachment upload settings still gate their tools as before.

Toolsets and each tool's access level (read, write or destructive) are listed in `packages/jira/src/tool-catalog.ts` and `packages/confluence/src/tool-catalog.ts`. The access level also sets each tool's MCP `readOnlyHint` and `destructiveHint`.

Hiding a tool reduces what the model sees and the tokens it costs. It is not access control: Jira and Confluence still enforce the token owner's permissions on every call.

### The tool gateway

Every listed tool's schema is sent with every request, so a long tool list costs tokens even when the tools go unused. The gateway lists three tools instead of the long tail: a keyword search that returns tools with their input schemas, and a read and a write tool that run what the search found. It is built in `packages/common/src/tool-gateway.ts` and `gateway-tools.ts`, and `createPolicyRegistrar` routes each tool:

- **Listed directly:** its toolset is selected (`TOOLSETS`, or a toolset marked `default: true`).
- **Through the gateway:** otherwise, unless the tool is destructive, read-only mode excludes it, or its toolset sets `gateway: false` (Jira service desk). The permission filter and opt-in settings still apply.
- **Not offered:** everything else.

The read and write run tools keep the read and write split visible to clients, so a client can still ask before a write. New tool modules and future app (plugin) integrations only need catalog entries: unless their toolset is marked `default: true`, their tools go to the gateway.

### Code execution

`<product>_runCode` runs model-written JavaScript that calls read tools with `await tools.<name>(args)`. The code gets each tool's `data`, and a failed call throws with its error. The run returns only what the code returns, plus `console.log` output.

- **Engine:** QuickJS, through `quickjs-emscripten-core` and `@jitl/quickjs-wasmfile-release-sync`. It is WebAssembly, so there is no native build.
- **Isolation:** QuickJS runs inside a `worker_thread` (`packages/common/src/code-sandbox.ts`). The worker source is plain JavaScript in `code-sandbox-worker-source.ts`, run with `eval: true`, so tsc, swc and esbuild never rewrite it. The worker loads QuickJS with dynamic `import()` from paths the parent resolves, which works the same from `src/` under Jest, from `build/` and from the bundled `dist/`.
- **Why a worker:** some operations, such as `JSON.stringify` of a deeply nested array, overflow the native stack inside WebAssembly, past QuickJS's own stack limit. In the main thread that would crash the server. In a worker it fails only that run, and the parent also terminates the worker at the time limit, even while the code waits on a promise that never settles.
- **What code can reach:** only tools that are read-only after their annotations are applied. For example, `jira_downloadAttachment` is left out when saving to disk is enabled. Every call goes through the same argument validation as `runReadTool`.
- **Limits:** set in `DEFAULT_SANDBOX_LIMITS`.

### The Jira permission filter

At startup the Jira server asks Jira for the token owner's permissions (`GET /rest/api/2/mypermissions`) and hides tools that need a permission the account doesn't have. For example, `jira_deleteIssue` needs Delete Issues, and the version tools need project admin or Jira admin. Each tool's required permissions are listed as `anyOfPermissions` in the tool catalogs, and the account needs any one of them.

| Variable | Effect |
| --- | --- |
| `PERMISSION_FILTER` | On by default. `off` lists tools without checking permissions. |
| `JIRA_PERMISSION_PROJECTS` | Comma-separated project keys, for example `ACS,BPO`. Without it, Jira counts a project permission as held if the account has it in any project. With it, only these projects count. |

- **What is checked:** only tools that change Jira. Read tools and watching an issue yourself are always listed.
- **Startup log:** the server writes the tools it hid to stderr.
- **Cost:** one request at startup, which is skipped when nothing could be hidden (for example in `READ_ONLY_MODE`).
- **If Jira doesn't answer within 5 seconds, or the call fails:** the server hides only the admin tools and lists the rest.
- **Confluence:** not filtered. No Confluence tool needs an admin permission yet, and Confluence has no single call that reports a user's permissions.

## Adding a Jira app

Jira apps (Marketplace plugins) live in `packages/jira/src/apps/`, one folder per app. Xray (`apps/xray/`) is the
example to copy:

- **`catalog.ts`**: the app's toolsets and tools. Toolsets are `default: false`, so the tools are reached through the
  tool search. Writes name the Jira permission they need in `anyOfPermissions`, unless the app decides who may make
  them (then add the tool to `UNGATED_WRITE_TOOLS` in the catalog test, with the reason).
- **`client.ts`**: calls the app's REST API through the generated Jira client's `request` core, relative to `/rest`.
- **`operations.ts`**, **`read-tools.ts`**, **`write-tools.ts`**: one function per call, and the tool registrations.
- **An entry in `JIRA_APPS`** in `apps/index.ts`: the id used in the `JIRA_APPS` setting, the catalog, a `probe`
  (one cheap request that fails with 404 when the app isn't installed) and `register`.

The catalog test finds every `registerTool` call under `apps/`, so a tool without a catalog entry fails the build.

**Finding an app's REST API.** Apps rarely publish an OpenAPI spec, so read the API from the app itself. Download
the Data Center artifact from the Marketplace, then, without running it:

1. Read `atlassian-plugin.xml` for the version and the `<rest>` modules: each gives the path and version the API is
   served under, and the Java packages it serves.
2. Extract those packages' class files and run `javap -v -p` on them. JAX-RS annotations (`jakarta.ws.rs.Path`, `GET`,
   `QueryParam` and so on) give every route and query parameter, even when class names are obfuscated.
3. `javap -p` on the request bean classes gives the JSON body fields.

Write the app version you read into the catalog's comments and the README, so a later app version can be checked
against it.

