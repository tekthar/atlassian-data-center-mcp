# mcp-bitbucket-dc

An MCP server for **Bitbucket Data Center and Bitbucket Server**. It lets Claude and other MCP clients browse projects, repositories, files, branches and commits, search code, and review and comment on pull requests. Merging and declining pull requests are off until you allow them for named repositories.

- **27 tools**, plus 2 opt-in tools for merging and declining.
- **Merges stay under your control.** They are limited to the repositories and target branches you list, and are checked before anything is written.
- **One `npx` command:** no Python, no Docker.

Not affiliated with or endorsed by Atlassian. Bitbucket is a trademark of Atlassian.

## Requirements

- Node.js 22.22.2 or later
- Bitbucket Data Center or Bitbucket Server, and an HTTP access token. To create one in Bitbucket, open your profile picture, then **Manage account** > **HTTP access tokens** > **Create token**.

## Quick start

1. Save your Bitbucket address and token:

   ```bash
   npx -y mcp-bitbucket-dc setup
   ```

   On macOS the token goes to the Keychain. Everything else goes to `~/.atlassian-dc-mcp/bitbucket.env` (on Windows, `%USERPROFILE%\.atlassian-dc-mcp\bitbucket.env`), which only your user can read.

2. Add the server to your MCP client.

   Claude Code:

   ```bash
   claude mcp add bitbucket -- npx -y mcp-bitbucket-dc
   ```

   Claude Desktop, Cursor, VS Code and other clients with an `mcpServers` file:

   ```json
   {
     "mcpServers": {
       "bitbucket": { "command": "npx", "args": ["-y", "mcp-bitbucket-dc"] }
     }
   }
   ```

To skip `setup` and pass settings directly, add an `env` block to that entry:

```json
"env": { "BITBUCKET_HOST": "bitbucket.example.com", "BITBUCKET_API_TOKEN": "<HTTP access token>" }
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `BITBUCKET_HOST` | Host name and optional port, without `https://`. Example: `bitbucket.example.com` |
| `BITBUCKET_API_BASE_PATH` | Full REST base URL, used instead of `BITBUCKET_HOST`. Example: `https://example.com/bitbucket/rest` |
| `BITBUCKET_API_TOKEN` | HTTP access token |
| `BITBUCKET_DEFAULT_PAGE_SIZE` | Page size for list tools. Default 25. |
| `ATLASSIAN_DC_MCP_CONFIG_FILE` | Absolute path to a dotenv file holding any of these settings, for example one file shared by several tools |

Each setting comes from the first of these places that has it:
1. environment variables;
2. the dotenv file (`ATLASSIAN_DC_MCP_CONFIG_FILE`, or `.env` in the working directory);
3. the file `setup` writes;
4. the macOS Keychain.

In scripts and CI, `setup` also runs without prompts:

```bash
npx -y mcp-bitbucket-dc setup --non-interactive --host bitbucket.example.com --token "$BITBUCKET_TOKEN"
```

`npx -y mcp-bitbucket-dc setup --help` lists every option.

## Tools

| Area | Tools |
| --- | --- |
| Projects and repositories | `bitbucket_getProjects`, `bitbucket_getProject`, `bitbucket_getRepositories`, `bitbucket_getRepository`, `bitbucket_browseRepository`, `bitbucket_getFileContent`, `bitbucket_searchCode` |
| Branches and commits | `bitbucket_createBranch`, `bitbucket_getCommits`, `bitbucket_getBranchDiff` |
| Reading pull requests | `bitbucket_getPullRequests`, `bitbucket_getPullRequest`, `bitbucket_getPR_CommentsAndAction`, `bitbucket_getPullRequestChanges`, `bitbucket_getPullRequestDiff`, `bitbucket_getPullRequestBuilds`, `bitbucket_canMergePullRequest`, `bitbucket_getRequiredReviewers`, `bitbucket_getInboxPullRequests`, `bitbucket_getDashboardPullRequests` |
| Working on pull requests | `bitbucket_createPullRequest`, `bitbucket_updatePullRequest`, `bitbucket_postPullRequestComment`, `bitbucket_updatePullRequestComment`, `bitbucket_submitPullRequestReview`, `bitbucket_reopenPullRequest` |
| Users | `bitbucket_getUser` |
| Opt-in | `bitbucket_mergePullRequest`, `bitbucket_declinePullRequest` |

`bitbucket_getPR_CommentsAndAction` and `bitbucket_getPullRequestChanges` take `output=summary|compact|full`. The default is `compact`.

### Merging and declining pull requests

Both tools stay unlisted until you enable them and name the repositories they may act on. The model cannot widen that list.

| Variable | Purpose |
| --- | --- |
| `BITBUCKET_MERGE_ENABLED` | `true` lists `bitbucket_mergePullRequest` |
| `BITBUCKET_MERGE_ALLOWED_REPOS` | Required for merging. `PROJECT/repo` entries, comma-separated. `PROJECT/*` allows a whole project. |
| `BITBUCKET_MERGE_ALLOWED_TARGET_REFS` | Optional. Branches that may be merged into, such as `develop,refs/heads/release/*` |
| `BITBUCKET_DECLINE_ENABLED` | `true` lists `bitbucket_declinePullRequest` |
| `BITBUCKET_DECLINE_ALLOWED_REPOS` | Required for declining. Same format as for merging. |

Before writing anything, a merge is checked against the allowed repositories and target branches. It also has to pass Bitbucket's own merge checks: conflicts, required approvals, open tasks and builds. Both tools require the pull request's current `version`, so a pull request that changed after you looked at it is rejected. `bitbucket_reopenPullRequest` undoes a decline.

## Security notes

- **Clients can tell reads from writes.** Read tools are marked read-only for MCP clients.
- **Treat Bitbucket content as data, not instructions.** File contents, diffs, commit messages and comments are written by other people.

## Related projects

- [mcp-jira-dc](https://www.npmjs.com/package/mcp-jira-dc) and [mcp-confluence-dc](https://www.npmjs.com/package/mcp-confluence-dc): the same approach for Jira and Confluence Data Center.
- [Atlassian's official MCP server](https://github.com/atlassian/atlassian-mcp-server): a remote server for Atlassian Cloud.

## Acknowledgments

mcp-bitbucket-dc builds on [b1ff/atlassian-dc-mcp](https://github.com/b1ff/atlassian-dc-mcp) (MIT). Its copyright notice is in [LICENSE](LICENSE), together with those of the other projects this code shares parts with.

## License

MIT
