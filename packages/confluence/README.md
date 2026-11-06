# mcp-confluence-dc

An MCP server for **Confluence Data Center and Confluence Server**. It lets Claude and other MCP clients search, read, create and update pages, and, when you turn them on, browse page trees, compare page versions, and manage labels, comments, restrictions and attachments.

- **26 tools in 11 toolsets.** By default 6 everyday page tools are listed directly, and 3 gateway tools find and run 17 more, so the rest cost tokens only when used.
- **Read-only mode** and an exact tool allowlist for locked-down setups.
- **One `npx` command:** no Python, no Docker.

Not affiliated with or endorsed by Atlassian. Confluence is a trademark of Atlassian.

## Requirements

- Node.js 22.22.2 or later
- Confluence Data Center or Confluence Server, and a personal access token. To create one in Confluence, open your profile picture, then **Settings** > **Personal Access Tokens** > **Create token**.

## Quick start

1. Save your Confluence address and token:

   ```bash
   npx -y mcp-confluence-dc setup
   ```

   On macOS the token goes to the Keychain. Everything else goes to `~/.atlassian-dc-mcp/confluence.env` (on Windows, `%USERPROFILE%\.atlassian-dc-mcp\confluence.env`), which only your user can read.

2. Add the server to your MCP client.

   Claude Code:

   ```bash
   claude mcp add confluence -- npx -y mcp-confluence-dc
   ```

   Claude Desktop, Cursor, VS Code and other clients with an `mcpServers` file:

   ```json
   {
     "mcpServers": {
       "confluence": { "command": "npx", "args": ["-y", "mcp-confluence-dc"] }
     }
   }
   ```

To skip `setup` and pass settings directly, add an `env` block to that entry:

```json
"env": { "CONFLUENCE_HOST": "confluence.example.com", "CONFLUENCE_API_TOKEN": "<personal access token>" }
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `CONFLUENCE_HOST` | Host name and optional port, without `https://`. Example: `confluence.example.com` |
| `CONFLUENCE_API_BASE_PATH` | Full REST API URL, used instead of `CONFLUENCE_HOST`. Example: `https://example.com/wiki/rest/api` |
| `CONFLUENCE_API_TOKEN` | Personal access token |
| `CONFLUENCE_DEFAULT_PAGE_SIZE` | Page size for search and list tools. Default 25. |
| `ATLASSIAN_DC_MCP_CONFIG_FILE` | Absolute path to a dotenv file holding any of these settings, for example one file shared by several tools |

Each setting comes from the first of these places that has it:
1. environment variables;
2. the dotenv file (`ATLASSIAN_DC_MCP_CONFIG_FILE`, or `.env` in the working directory);
3. the file `setup` writes;
4. the macOS Keychain.

In scripts and CI, `setup` also runs without prompts:

```bash
npx -y mcp-confluence-dc setup --non-interactive --host confluence.example.com --token "$CONFLUENCE_TOKEN"
```

`npx -y mcp-confluence-dc setup --help` lists every option.

## Choosing which tools are listed

| Variable | Effect |
| --- | --- |
| `TOOLSETS` | Comma-separated toolset names, `default`, or `all`. Example: `default,confluence_page_tree` |
| `READ_ONLY_MODE` | `true` lists only tools that never change Confluence. |
| `ENABLED_TOOLS` | Comma-separated tool names. Replaces `TOOLSETS`; read-only mode still applies. |
| `TOOL_GATEWAY` | On by default: tools outside the selected toolsets, apart from destructive ones, are offered through three gateway tools instead of being left out. `off` leaves them out. The gateway is also off while `ENABLED_TOOLS` is set. |

Hiding tools saves tokens and avoids calls that would fail. It is not access control: Confluence still checks your permissions on every call.

### The tool gateway

Listing every tool costs tokens on every request, so only everyday tools are listed directly. The rest are reached through three small tools:

- `confluence_searchTools` finds tools by keyword (for example "sprint issues") and returns their descriptions and input schemas. Its own description names the toolsets it can reach.
- `confluence_runReadTool` runs a found tool that only reads Confluence.
- `confluence_runWriteTool` runs a found tool that changes Confluence. Clients can ask before running it, as they do for any write tool.

The gateway applies the same rules as the tool list: read-only mode, the permission filter and the opt-in settings. It never offers destructive tools; turn on their toolset with `TOOLSETS` to use them. A toolset named in `TOOLSETS` is listed directly instead.

In the table below, **on** toolsets are listed directly and **gateway** toolsets are reached through the gateway.

| Toolset | Default | Tools |
| --- | --- | --- |
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

Page bodies are read and written in Confluence storage format (XHTML).

### Attachments on disk

`confluence_uploadAttachment`, and saving downloaded attachments to disk, work only inside folders you name. Without these settings, `confluence_downloadAttachment` returns file contents inline and never touches the disk.

| Variable | Purpose |
| --- | --- |
| `CONFLUENCE_ATTACHMENTS_UPLOAD_ENABLED`, `CONFLUENCE_ATTACHMENTS_DOWNLOAD_ENABLED` | Turn each direction on. Default off. |
| `CONFLUENCE_ATTACHMENTS_UPLOAD_ROOTS`, `CONFLUENCE_ATTACHMENTS_DOWNLOAD_ROOTS` | Folders allowed for each direction, separated like your OS `PATH` |
| `CONFLUENCE_ATTACHMENTS_DIR` | One folder used for both directions |
| `CONFLUENCE_ATTACHMENTS_MAX_UPLOAD_BYTES`, `CONFLUENCE_ATTACHMENTS_MAX_DOWNLOAD_BYTES` | Size limits. Default 25 MiB. |

## Security notes

- **Clients can ask before risky calls.** Every tool tells the client whether it only reads, changes data, or deletes.
- **Treat Confluence content as data, not instructions.** Pages, comments and attachments are written by other people. `confluence_downloadAttachment` shows an image to the model only when asked to, with `returnContent: 'image'`.

## Related projects

- [mcp-jira-dc](https://www.npmjs.com/package/mcp-jira-dc) and [mcp-bitbucket-dc](https://www.npmjs.com/package/mcp-bitbucket-dc): the same approach for Jira and Bitbucket Data Center.
- [Atlassian's official MCP server](https://github.com/atlassian/atlassian-mcp-server): a remote server for Atlassian Cloud.
- [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian): a Python server for Jira and Confluence, Cloud and Data Center.

## Acknowledgments

mcp-confluence-dc builds on two MIT-licensed projects: [b1ff/atlassian-dc-mcp](https://github.com/b1ff/atlassian-dc-mcp), and [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian), whose Data Center tools were adapted for this server. Their copyright notices are in [LICENSE](LICENSE).

## License

MIT
