# mcp-confluence-dc

**Connect Claude, Cursor and any other MCP client to Confluence Data Center and Confluence Server, signed in as you.**

The server runs on your machine. Your MCP client starts it and talks to it over stdio; it calls Confluence's REST API
with your personal access token, lists the everyday page tools, and keeps 17 more one search away. Confluence's own
permissions decide what you can do: the server can hide tools, never unlock them.

```bash
npx -y mcp-confluence-dc setup                          # saves your Confluence address and token
claude mcp add confluence -- npx -y mcp-confluence-dc   # connects Claude Code
```

> Not affiliated with or endorsed by Atlassian. Confluence is a trademark of Atlassian.

## Why run it on your machine?

| | A hosted MCP connector | **mcp-confluence-dc** |
|---|---|---|
| Works with Confluence Data Center and Server | depends on the service | **yes** |
| Reaches a Confluence behind your firewall or VPN | only if Confluence is exposed to the service | **yes**: wherever your machine can reach |
| Where your token lives | with the service | **on your machine**: your OS keychain, or a file only your user can read |
| Who decides which tools the agent sees | the service | **you**, with a few settings |
| Something to host, approve or pay for | the service | **nothing**: `npx` runs it |

[Atlassian's official MCP server](https://github.com/atlassian/atlassian-mcp-server) is a hosted server for Atlassian
Cloud.

## Install

You need Node.js 22.22.2 or later, Confluence Data Center or Confluence Server, and a personal access token. To create
one, open your profile picture in Confluence, then **Settings** > **Personal Access Tokens** > **Create token**.

**1. Save your address and token.** `setup` asks for them, checks them with one request to Confluence, and saves them:

```bash
npx -y mcp-confluence-dc setup
```

The token goes to your OS keychain: the macOS Keychain, Windows Credential Manager, or on Linux the desktop
keyring (GNOME Keyring or KWallet). Everything else goes to `~/.atlassian-dc-mcp/confluence.env`
(`%USERPROFILE%\.atlassian-dc-mcp\confluence.env` on Windows), which only your user can read. Without a keychain, such as
on a Linux server, the token goes in that file too.

**2. Connect your client.** `install` registers the server with Claude Code or Claude Desktop for you:

```bash
npx -y mcp-confluence-dc install --claude-code      # runs claude mcp add
npx -y mcp-confluence-dc install --claude-desktop   # edits Claude Desktop's config, after backing it up
```

Cursor, VS Code and other clients with an `mcpServers` file:

```json
{
  "mcpServers": {
    "confluence": { "command": "npx", "args": ["-y", "mcp-confluence-dc"] }
  }
}
```

To skip `setup`, put the settings in that entry instead:
`"env": { "CONFLUENCE_HOST": "confluence.example.com", "CONFLUENCE_API_TOKEN": "<personal access token>" }`.

## Commands

| Command | Does |
|---|---|
| `npx -y mcp-confluence-dc` | Serves Confluence over stdio. This is what your MCP client runs. |
| `npx -y mcp-confluence-dc setup` | Asks for your address and token, checks them against Confluence, and saves them. |
| `setup --non-interactive --host <host> --token <token>` | The same from flags, for scripts and CI. Exits non-zero if the token doesn't work. Values you leave out come from your existing settings. |
| `setup --help` | Lists every option. |
| `npx -y mcp-confluence-dc install --claude-code [--scope user\|project\|local]` | Registers the server with Claude Code by running `claude mcp add`. |
| `npx -y mcp-confluence-dc install --claude-desktop` | Adds the server to Claude Desktop's configuration, after backing it up. |
| `npx -y mcp-confluence-dc doctor` | Checks Node.js, where each setting comes from, the keychain, signing in, and the tools your client will see, and says how to fix what's wrong. The token is masked. |

## What the agent sees

The tool list holds the everyday tools for pages, spaces and attachments, plus four more:

| Tool | What it's for |
|---|---|
| `confluence_searchTools` | Finds any other tool by keyword, such as "page history" or "labels", and returns its description and input schema. Its own description names every toolset it can reach. |
| `confluence_runReadTool` | Runs a found tool that only reads Confluence. |
| `confluence_runWriteTool` | Runs a found tool that changes Confluence. Your client can ask you first, as for any write. |
| `confluence_runCode` | Runs a short JavaScript snippet that combines several read calls and returns only the answer. |

For a question that takes many calls, `confluence_runCode` keeps the intermediate results out of the context:

```js
const found = await tools.confluence_searchContent({ cql: 'space = OPS and label = runbook', limit: 50 });
console.log(`found ${found.results.length} runbooks`);
return found.results.map((result) => result.title);
```

The snippet runs in QuickJS, a JavaScript engine compiled to WebAssembly, in its own worker thread. It sees only
`tools`, `callTool` and `console`: no network, files, processes or timers. It can call read tools only, and stops after
30 seconds or 50 tool calls (4 at a time), at 64 MB of memory, or with a result over 100,000 characters. If it crashes
the engine, only that run fails.

## Toolsets

**On** toolsets are listed directly. **Gateway** toolsets are reached through `confluence_searchTools`.

| Toolset | Default | Tools |
|---|---|---|
| `confluence_pages`: search, read, create and update pages | on | `confluence_getContent`, `confluence_searchContent`, `confluence_createContent`, `confluence_updateContent` |
| `confluence_spaces`: search spaces | on | `confluence_searchSpace` |
| `confluence_attachments`: download and upload page attachments | on | `confluence_downloadAttachment`, `confluence_uploadAttachment` (opt-in) |
| `confluence_page_tree`: child pages and a space's page hierarchy | gateway | `confluence_getPageChildren`, `confluence_getSpacePageTree` |
| `confluence_page_admin`: move, copy and delete (trash) pages | gateway | `confluence_deletePage` (destructive), `confluence_movePage`, `confluence_copyPage` |
| `confluence_history`: past page versions and a diff of two versions | gateway | `confluence_getPageHistory`, `confluence_getPageDiff` |
| `confluence_labels`: read and add content labels | gateway | `confluence_getLabels`, `confluence_addLabel` |
| `confluence_restrictions`: read and set page view and edit restrictions | gateway | `confluence_getPageRestrictions`, `confluence_setPageRestrictions` |
| `confluence_comments`: read, add and reply to page and inline comments | gateway | `confluence_getComments`, `confluence_getInlineComments`, `confluence_addComment`, `confluence_replyToComment`, `confluence_addInlineComment` |
| `confluence_attachment_management`: list attachment details and delete attachments | gateway | `confluence_getAttachments`, `confluence_deleteAttachment` (destructive) |
| `confluence_users`: search users by name or username | gateway | `confluence_searchUser` |

The tool search never offers a destructive tool. To use one, turn on its toolset with `TOOLSETS`. Page bodies are read
and written in Confluence storage format (XHTML).

## Supported apps

The server also works with Confluence apps from the Atlassian Marketplace. An app's tools are offered only when the app
is installed. At startup the server makes one request per app to check, and leaves out the apps that aren't there.
Their toolsets are off by default, so their tools are reached through `confluence_searchTools` and cost nothing until
used.

| App | Versions | Status |
|---|---|---|
| draw.io, diagrams | 16 | Beta, read-only |

**draw.io** tools, in the `drawio_diagrams` toolset:

| Tool | What it's for |
|---|---|
| `drawio_searchDiagrams` | Finds diagrams by name, space or who changed them last, with the page each is on. |
| `drawio_listPageDiagrams` | Lists the diagrams a page shows, including ones embedded from other pages. |
| `drawio_getDiagram` | Reads a diagram. By default it returns each of its pages as the shapes it holds and the connections between them, by label; `format: "xml"` returns draw.io's XML instead. |

Creating and editing diagrams isn't offered yet: draw.io saves need a preview image that this server can't render.
The Jira server, `mcp-jira-dc`, has tools for Xray, Zephyr, ScriptRunner, BigPicture, Jira Service Management and draw.io.
[Supported apps](https://github.com/tekthar/atlassian-data-center-mcp/blob/main/docs/supported-apps.md) lists every
app with the versions its tools were built from.

## Settings

Every setting is an environment variable. Each comes from the first of these that has it: the environment, the dotenv
file named by `ATLASSIAN_DC_MCP_CONFIG_FILE`, the file `setup` writes, then the OS
keychain.

**Connecting**

| Variable | Use |
|---|---|
| `CONFLUENCE_HOST` | Host name and optional port, without `https://`, e.g. `confluence.example.com`. |
| `CONFLUENCE_API_BASE_PATH` | Full REST API URL, used instead of `CONFLUENCE_HOST`, e.g. `https://example.com/wiki/rest/api`. |
| `CONFLUENCE_API_TOKEN` | Personal access token. |
| `CONFLUENCE_DEFAULT_PAGE_SIZE` | Page size for search and list tools. Default 25. |
| `ATLASSIAN_DC_MCP_CONFIG_FILE` | Absolute path to a dotenv file with any of these settings, e.g. one file shared by several servers. |
| `ATLASSIAN_DC_MCP_REQUEST_TIMEOUT_MS` | How long a request to Confluence may take. Default 30000. |
| `ATLASSIAN_DC_MCP_KEYCHAIN` | `off` keeps the token out of the OS keychain: `setup` saves it in the file instead, and the server doesn't look in the keychain. |

**Choosing tools**

| Variable | Use |
|---|---|
| `TOOLSETS` | Toolsets to list directly: names, `default`, or `all`, e.g. `default,confluence_page_tree`. |
| `READ_ONLY_MODE` | `true` offers only tools that never change Confluence. |
| `ENABLED_TOOLS` | An exact list of tool names. Replaces `TOOLSETS`, and turns the tool search and `confluence_runCode` off. |
| `TOOL_GATEWAY` | `off` turns the tool search off: tools outside the selected toolsets are left out. |
| `CODE_EXECUTION` | `off` removes `confluence_runCode`. |
| `CONFLUENCE_APPS` | Which [apps](#supported-apps) to offer. Unset or `auto` checks which are installed; a list such as `drawio` offers those without checking; `off` offers none. |

**Attachments on disk**

| Variable | Use |
|---|---|
| `CONFLUENCE_ATTACHMENTS_UPLOAD_ENABLED`, `CONFLUENCE_ATTACHMENTS_DOWNLOAD_ENABLED` | `true` lets attachments be uploaded from, or saved to, your disk. Default off: downloads come back inline and never touch the disk. |
| `CONFLUENCE_ATTACHMENTS_UPLOAD_ROOTS`, `CONFLUENCE_ATTACHMENTS_DOWNLOAD_ROOTS` | Folders allowed for each direction, separated like your OS `PATH`. |
| `CONFLUENCE_ATTACHMENTS_DIR` | One folder used for both directions. |
| `CONFLUENCE_ATTACHMENTS_MAX_UPLOAD_BYTES`, `CONFLUENCE_ATTACHMENTS_MAX_DOWNLOAD_BYTES` | Size limits. Default 25 MiB. |

**Audit log**

| Variable | Use |
|---|---|
| `ATLASSIAN_DC_MCP_AUDIT` | `1` writes one JSON line per tool call: the time, server, tool, outcome and duration, never the arguments or results. A tool run through the tool search or from `confluence_runCode` is recorded too, with `"via"`. |
| `ATLASSIAN_DC_MCP_AUDIT_FILE` | Where to write it. Default `~/.atlassian-dc-mcp/audit/mcp-confluence-dc.jsonl` (mode 0600 on macOS and Linux). It rotates at 5 MB, keeping three old files. |

## What it guarantees

- **It never widens access.** Every request carries your token, so Confluence decides what you can do. Hiding a tool
  trims what the agent sees; it never unlocks anything.
- **Writes stay visible.** Every tool tells your client whether it reads, changes or deletes, so the client can ask you
  first. `confluence_runCode` can only call read tools.
- **Deleting is always your decision.** Delete tools appear only in toolsets you turn on, never through the tool search
  or `confluence_runCode`.
- **It never retries a call on its own.** If a request fails, the agent sees Confluence's error and decides what to do.
- **It stays out of your files.** Attachments are read from and saved to only the folders you name, and a saved file
  never overwrites an existing one.

Pages, comments and attachments are written by other people, so treat them as data, not instructions.
`confluence_downloadAttachment` shows an image to the model only when asked to, with `returnContent: 'image'`.

## Related projects

- [mcp-jira-dc](https://www.npmjs.com/package/mcp-jira-dc) and
  [mcp-bitbucket-dc](https://www.npmjs.com/package/mcp-bitbucket-dc): the same approach for Jira and Bitbucket Data
  Center.
- [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian): a Python server for Jira and Confluence, Cloud
  and Data Center.

## Acknowledgments

mcp-confluence-dc builds on two MIT-licensed projects: [b1ff/atlassian-dc-mcp](https://github.com/b1ff/atlassian-dc-mcp),
and [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian), whose Data Center tools were adapted for this
server. Their copyright notices are in [LICENSE](LICENSE).

## License

MIT. Part of [Atlassian Data Center MCP](https://github.com/tekthar/atlassian-data-center-mcp), with
[mcp-jira-dc](https://www.npmjs.com/package/mcp-jira-dc) and
[mcp-bitbucket-dc](https://www.npmjs.com/package/mcp-bitbucket-dc).
