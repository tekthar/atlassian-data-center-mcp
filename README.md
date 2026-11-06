# MCP servers for Jira, Confluence and Bitbucket Data Center

[Model Context Protocol](https://modelcontextprotocol.io) servers that let Claude and other MCP clients work with **Atlassian Data Center and Server** products: Jira, Confluence and Bitbucket. Each runs locally with one `npx` command.

| Package | What it covers | Tools |
| --- | --- | --- |
| [`mcp-jira-dc`](https://www.npmjs.com/package/mcp-jira-dc) | Issues, comments, transitions, links, versions, sprints, worklogs, service desk, fields, users, analytics | 63 in 18 toolsets, 20 by default |
| [`mcp-confluence-dc`](https://www.npmjs.com/package/mcp-confluence-dc) | Pages, spaces, page trees, history and diffs, labels, comments, restrictions, attachments | 26 in 11 toolsets, 6 by default |
| [`mcp-bitbucket-dc`](https://www.npmjs.com/package/mcp-bitbucket-dc) | Projects, repositories, files, branches, commits, code search, pull request review | 27, plus opt-in merge and decline |

Not affiliated with or endorsed by Atlassian. Jira, Confluence and Bitbucket are trademarks of Atlassian.

## Quick start

You need Node.js 22.22.2 or later and a personal access token for each product.

1. Save your address and token (the same command exists for each package):

   ```bash
   npx -y mcp-jira-dc setup
   ```

2. Add the servers to your MCP client. For Claude Code:

   ```bash
   claude mcp add jira -- npx -y mcp-jira-dc
   claude mcp add confluence -- npx -y mcp-confluence-dc
   claude mcp add bitbucket -- npx -y mcp-bitbucket-dc
   ```

   For Claude Desktop, Cursor, VS Code and other clients with an `mcpServers` file:

   ```json
   {
     "mcpServers": {
       "jira": { "command": "npx", "args": ["-y", "mcp-jira-dc"] },
       "confluence": { "command": "npx", "args": ["-y", "mcp-confluence-dc"] },
       "bitbucket": { "command": "npx", "args": ["-y", "mcp-bitbucket-dc"] }
     }
   }
   ```

Each package's README covers its settings and tools in full: [Jira](packages/jira/README.md), [Confluence](packages/confluence/README.md), [Bitbucket](packages/bitbucket/README.md).

## Features

- **You choose which tools the model sees.** Jira and Confluence group their tools into toolsets: `TOOLSETS` picks them, `READ_ONLY_MODE=true` keeps only tools that never change anything, and `ENABLED_TOOLS` names tools one by one. Fewer tools means fewer tokens per request.
- **Jira hides tools your account can't use.** At startup the server reads your Jira permissions and drops, for example, the delete tools if you can't delete issues. `JIRA_PERMISSION_PROJECTS` narrows the check to the projects you work in.
- **Risky actions are opt-in.** Deleting Jira versions, reading or writing attachments on disk, and merging or declining Bitbucket pull requests each need their own setting. Merges and declines are also limited to the repositories you name.
- **Clients can tell reads from writes.** Tools carry MCP hints saying whether they only read data, and Jira and Confluence also mark the destructive ones, so clients can ask before running them.
- **Settings live outside your MCP config.** `setup` stores the token in the macOS Keychain or in a file in `~/.atlassian-dc-mcp/` that only you can read. Environment variables and a shared dotenv file work too.

Hiding a tool is not access control: Jira, Confluence and Bitbucket still check the token owner's permissions on every call.

## Development

This is an npm workspaces monorepo. Development needs Node.js 22.22.2 or later and npm 11.10 or later within npm 11. If your global npm is older, run every npm command through `npx -y npm@11.21.1`.

| Folder | Contents |
| --- | --- |
| `packages/common` | Configuration, `setup`, tool policy and permission filter, response helpers. Private: it is bundled into each server, never published. |
| `packages/jira`, `packages/confluence`, `packages/bitbucket` | One server each, with a generated REST client in `src/*-client` |
| `scripts/bundle-server.mjs` | Builds each server's `dist/` with `common` inlined |

```bash
npm ci
npm run build          # type-checks sources and tests
npm test               # unit tests for every package
npm run dev:jira       # run a server from source (also dev:confluence, dev:bitbucket)
```

**Adding a tool:**
1. Put it in a module under `packages/<product>/src/tools/`, with a catalog entry giving its toolset and access level (`read`, `write` or `destructive`).
2. For Jira, also list the permission keys in `anyOfPermissions` when the tool changes data.
3. Register it through `tools.registerTool`.

Catalog tests fail if a registered tool has no entry, or if a Jira tool that changes data names no permission.

**Packaging and releases:** each server's `prepack` script builds the workspace, bundles `dist/` and copies the root `LICENSE` into the package. To release, raise the version in the package's `package.json` and `server.json`, then run `npm publish` in that package folder. CI builds, bundles and tests every pull request on Ubuntu and Windows.

## Security

Please report vulnerabilities privately through **Report a vulnerability** on this repository's Security tab, not in a public issue.

## Acknowledgments

This project builds on two MIT-licensed projects:
- [b1ff/atlassian-dc-mcp](https://github.com/b1ff/atlassian-dc-mcp), the original TypeScript servers;
- [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian), whose Data Center tools were adapted for Jira and Confluence.

Their copyright notices are in [LICENSE](LICENSE).

## Related projects

- [Atlassian's official MCP server](https://github.com/atlassian/atlassian-mcp-server): a remote server for Atlassian Cloud.
- [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian): a Python server for Jira and Confluence, Cloud and Data Center.

## License

[MIT](LICENSE)
