# Configuration reference

Each server's README has a short configuration guide: [Jira](../packages/jira/README.md), [Confluence](../packages/confluence/README.md) and [Bitbucket](../packages/bitbucket/README.md). This page has the details: every `setup` flag, where credentials are stored, the order settings are read in, and complete client configurations.

The examples use all three servers. Keep only the ones you need.

## Saving credentials with `setup`

Each package ships an interactive `setup` subcommand that stores your credentials in the most secure place available on your OS. Run it once per product:

```bash
npx -y mcp-jira-dc setup
npx -y mcp-confluence-dc setup
npx -y mcp-bitbucket-dc setup
```

The setup CLI prompts for host, API base path, default page size, and API token. Before saving, it validates obvious input mistakes and performs a timed authenticated request to the selected Atlassian product, so a bad host, base path, or token is caught during setup.

### CLI flags and non-interactive mode

Setup accepts flags so you can prefill values or skip prompts entirely (useful for scripted bootstrap, CI, or remote sessions). Run `npx -y mcp-<product>-dc setup --help` for the full list.

| Flag | Short | Description |
|------|-------|-------------|
| `--host <value>` | `-H` | Host, e.g. `jira.example.com` |
| `--api-base-path <value>` | `-b` | API base path or full URL |
| `--token <value>` | `-t` | API token |
| `--default-page-size <n>` | `-s` | Default page size (positive integer) |
| `--non-interactive` | `-n` | Skip prompts; fail if a required value cannot be resolved |
| `--help` | `-h` | Show usage and exit |

In interactive mode, any flag you pass prefills its prompt (so e.g. `--host` skips the host prompt but still asks for the rest). In `--non-interactive` mode, setup resolves anything missing from existing configuration (process env, `~/.atlassian-dc-mcp/<product>.env`, or the OS keychain) and exits non-zero if a host (or full-URL `--api-base-path`) and token cannot be found. An existing token is reused when `--token` is omitted.

```bash
# Scripted, no prompts, write everything from flags
npx -y mcp-jira-dc setup --non-interactive \
  --host jira.example.com \
  --token "$JIRA_TOKEN"

# Re-validate the existing token without re-entering it
npx -y mcp-jira-dc setup --non-interactive --host jira.example.com
```

Credential validation behaves differently between modes: interactive mode offers retry/save-anyway prompts on failure, while `--non-interactive` exits with code 1 on the first validation failure so it can be used as a CI gate.

Token storage:

The token goes to the OS keychain, always under service `atlassian-dc-mcp` and account `<product>-token`:

- **macOS**: the login Keychain, through `/usr/bin/security`.
- **Windows**: Windows Credential Manager.
- **Linux**: the desktop keyring through the Secret Service (GNOME Keyring, KWallet). A machine without one, such as a server, a container or WSL, has no keychain to use. The token is never put in the kernel keyring, which loses its contents at every reboot.

Windows and Linux use the [`@napi-rs/keyring`](https://www.npmjs.com/package/@napi-rs/keyring) package, which installs a prebuilt binary for your platform. If there is no keychain, or no binary for your platform, or `ATLASSIAN_DC_MCP_KEYCHAIN=off` is set, the token goes to the home file instead:

- **macOS and Linux**: mode `0600`, readable and writable by your user only.
- **Windows**: the mode is ignored, so `setup` replaces the file's permissions with full control for your account only (`icacls`, by your account's SID, so Entra ID and domain accounts work). If that fails, `setup` doesn't save the token in the file.

Non-secret fields (host, API base path, default page size) are always written to the home file: `~/.atlassian-dc-mcp/<product>.env` on macOS and Linux, `%USERPROFILE%\.atlassian-dc-mcp\<product>.env` on Windows. After a successful keychain write, the token line is removed from the home file, so there is never a second copy somewhere less secure. **Upgrading from 0.45 or earlier on Windows or Linux:** run `setup` again to move the token from the file into the keychain.

Once setup has run, the MCP servers can boot with no environment variables at all:

```json
{
  "mcpServers": {
    "atlassian-jira-dc": { "command": "npx", "args": ["-y", "mcp-jira-dc"] },
    "atlassian-confluence-dc": { "command": "npx", "args": ["-y", "mcp-confluence-dc"] },
    "atlassian-bitbucket-dc": { "command": "npx", "args": ["-y", "mcp-bitbucket-dc"] }
  }
}
```

You can still pass credentials via environment variables or `ATLASSIAN_DC_MCP_CONFIG_FILE` as shown in the sections below — they take precedence over values saved by setup.

## Configuration Sources & Precedence

At startup, each MCP server resolves each config key by walking sources in this order and taking the first non-empty value:

| Priority | Source | Reads | Written by setup |
|---------:|--------|-------|------------------|
| 100 | `process.env` (`JIRA_*`, `CONFLUENCE_*`, `BITBUCKET_*`) | all keys | — |
| 80  | env file — `ATLASSIAN_DC_MCP_CONFIG_FILE` | all keys | — |
| 60  | home file — `~/.atlassian-dc-mcp/<product>.env` on macOS/Linux, `%USERPROFILE%\.atlassian-dc-mcp\<product>.env` on Windows (mode `0600` on macOS and Linux; on Windows, `setup` limits it to your account) | all keys | host, apiBasePath, defaultPageSize (always); token (non-darwin or keychain fallback) |
| 40  | OS keychain — service `atlassian-dc-mcp`, account `<product>-token` (macOS Keychain, Windows Credential Manager, Linux Secret Service) | token only | token, when a keychain is available |

Notes:

- Process env wins over everything, so you can always override a stored credential for one session.
- `ATLASSIAN_DC_MCP_CONFIG_FILE` must be an absolute path; if set and missing, the server fails fast.
- A `.env` in the working directory is never read. MCP clients often start servers inside the project you have open, and a project's `.env` is written by whoever wrote the project: if it could set the host, the server would send your token there. Versions before 0.47.1 read it; a server that finds one with product settings says it is ignored. To keep using such a file, set `ATLASSIAN_DC_MCP_CONFIG_FILE` to its absolute path in your MCP client's configuration.
- The keychain is read once, when a server starts, and only if no higher source has the token. Tool calls never touch it.
- Each server masks its token in every tool result and everything it writes to stderr.
- If a higher-priority source shadows the value setup is about to save, setup prints a warning naming the env var so you can unset it.
- Atlassian API requests time out after 30 seconds by default. Set `ATLASSIAN_DC_MCP_REQUEST_TIMEOUT_MS` to a positive millisecond value to override it.

## Claude Desktop Configuration

[Official Anthropic quick start guide](https://modelcontextprotocol.io/docs/getting-started/intro)

To use these MCP connectors with Claude Desktop, add the following to your Claude Desktop configuration.

Set `*_HOST` variables only to domain + port without protocol (e.g., `jira.example.com`). The https protocol is assumed.

Alternatively, you can use `*_API_BASE_PATH` variables instead of `*_HOST` to specify the complete API base URL including protocol (e.g., `https://jira.example.com/rest`). Note that the `/api/latest/` part is static and added automatically in the code, so you don't need to include it in the `*_API_BASE_PATH` values.

You can leave only the services you need in the configuration.

macOS:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

Windows:
```
%APPDATA%\Claude\claude_desktop_config.json
```


```json
{
  "mcpServers": {
    "atlassian-jira-dc": {
      "command": "npx",
      "args": ["-y", "mcp-jira-dc"],
      "env": {
        "JIRA_HOST": "your-jira-host",
        "JIRA_API_TOKEN": "your-token"
      }
    },
    "atlassian-confluence-dc": {
      "command": "npx",
      "args": ["-y", "mcp-confluence-dc"],
      "env": {
        "CONFLUENCE_HOST": "your-confluence-host",
        "CONFLUENCE_API_TOKEN": "your-token"
      }
    },
    "atlassian-bitbucket-dc": {
      "command": "npx",
      "args": ["-y", "mcp-bitbucket-dc"],
      "env": {
        "BITBUCKET_HOST": "your-bitbucket-host",
        "BITBUCKET_API_TOKEN": "your-token"
      }
    }
  }
}
```

You can also use the alternative API base path configuration:

```json
{
  "mcpServers": {
    "atlassian-jira-dc": {
      "command": "npx",
      "args": ["-y", "mcp-jira-dc"],
      "env": {
        "JIRA_API_BASE_PATH": "https://your-jira-host/rest",
        "JIRA_API_TOKEN": "your-token"
      }
    },
    "atlassian-confluence-dc": {
      "command": "npx",
      "args": ["-y", "mcp-confluence-dc"],
      "env": {
        "CONFLUENCE_API_BASE_PATH": "https://your-confluence-host/rest",
        "CONFLUENCE_API_TOKEN": "your-token"
      }
    },
    "atlassian-bitbucket-dc": {
      "command": "npx",
      "args": ["-y", "mcp-bitbucket-dc"],
      "env": {
        "BITBUCKET_API_BASE_PATH": "https://your-bitbucket-host/rest",
        "BITBUCKET_API_TOKEN": "your-token"
      }
    }
  }
}
```

## Shared External Config File

If you want multiple MCP hosts or tools on one machine to reuse the same Atlassian credentials, put the existing `JIRA_*`, `CONFLUENCE_*`, and `BITBUCKET_*` variables into one dotenv-style file and point each MCP server at it with `ATLASSIAN_DC_MCP_CONFIG_FILE`.

The path must be absolute. Direct environment variables still override values from the shared file.

Example shared file:

```dotenv
JIRA_HOST=your-jira-host
JIRA_API_TOKEN=your-jira-token
JIRA_DEFAULT_PAGE_SIZE=50

CONFLUENCE_HOST=your-confluence-host
CONFLUENCE_API_TOKEN=your-confluence-token

BITBUCKET_HOST=your-bitbucket-host
BITBUCKET_API_TOKEN=your-bitbucket-token
BITBUCKET_DEFAULT_PAGE_SIZE=50
```

Claude Desktop example using one shared file:

```json
{
  "mcpServers": {
    "atlassian-jira-dc": {
      "command": "npx",
      "args": ["-y", "mcp-jira-dc"],
      "env": {
        "ATLASSIAN_DC_MCP_CONFIG_FILE": "/Users/your-user/.config/atlassian-dc-mcp.env"
      }
    },
    "atlassian-confluence-dc": {
      "command": "npx",
      "args": ["-y", "mcp-confluence-dc"],
      "env": {
        "ATLASSIAN_DC_MCP_CONFIG_FILE": "/Users/your-user/.config/atlassian-dc-mcp.env"
      }
    },
    "atlassian-bitbucket-dc": {
      "command": "npx",
      "args": ["-y", "mcp-bitbucket-dc"],
      "env": {
        "ATLASSIAN_DC_MCP_CONFIG_FILE": "/Users/your-user/.config/atlassian-dc-mcp.env"
      }
    }
  }
}
```

Windows example path:

```json
{
  "mcpServers": {
    "atlassian-jira-dc": {
      "command": "npx",
      "args": ["-y", "mcp-jira-dc"],
      "env": {
        "ATLASSIAN_DC_MCP_CONFIG_FILE": "C:\\\\Users\\\\your-user\\\\AppData\\\\Roaming\\\\atlassian-dc-mcp.env"
      }
    }
  }
}
```

## Claude Code CLI Configuration

To use these MCP connectors with [Claude Code](https://docs.anthropic.com/en/docs/claude-code), add MCP servers using the `claude mcp add` command.

You can add servers at the project scope (stored in `.mcp.json`) or user scope (`-s user`). Adjust the scope and included services to your needs.

```bash
# Jira
claude mcp add atlassian-jira-dc \
  -e JIRA_HOST=your-jira-host \
  -e JIRA_API_TOKEN=your-token \
  -- npx -y mcp-jira-dc

# Confluence
claude mcp add atlassian-confluence-dc \
  -e CONFLUENCE_HOST=your-confluence-host \
  -e CONFLUENCE_API_TOKEN=your-token \
  -- npx -y mcp-confluence-dc

# Bitbucket
claude mcp add atlassian-bitbucket-dc \
  -e BITBUCKET_HOST=your-bitbucket-host \
  -e BITBUCKET_API_TOKEN=your-token \
  -- npx -y mcp-bitbucket-dc
```

You can also use `*_API_BASE_PATH` instead of `*_HOST` (same as the Claude Desktop examples above):

```bash
claude mcp add atlassian-jira-dc \
  -e JIRA_API_BASE_PATH=https://your-jira-host/rest \
  -e JIRA_API_TOKEN=your-token \
  -- npx -y mcp-jira-dc
```

To add servers at user scope (available across all projects):

```bash
claude mcp add -s user atlassian-jira-dc \
  -e JIRA_HOST=your-jira-host \
  -e JIRA_API_TOKEN=your-token \
  -- npx -y mcp-jira-dc
```

To use the shared config file instead of passing credentials inline:

```bash
claude mcp add atlassian-jira-dc \
  -e ATLASSIAN_DC_MCP_CONFIG_FILE=/Users/your-user/.config/atlassian-dc-mcp.env \
  -- npx -y mcp-jira-dc
```

Windows PowerShell example:

```powershell
claude mcp add atlassian-jira-dc `
  -e ATLASSIAN_DC_MCP_CONFIG_FILE=C:\Users\your-user\AppData\Roaming\atlassian-dc-mcp.env `
  -- npx -y mcp-jira-dc
```

### Generating API Tokens

For Data Center installations, you'll need to generate Personal Access Tokens (PAT) for each service:

#### Jira Data Center
1. Log in to your Jira instance
2. Go to Profile > Personal Access Tokens
3. Click "Create token"
4. Give it a meaningful name and set appropriate permissions
5. Copy the generated token immediately (it won't be shown again)

#### Confluence Data Center
1. Log in to your Confluence instance
2. Go to Settings > Personal Access Tokens
3. Click "Create token"
4. Name your token and set required permissions
5. Save and copy the token (only shown once)

#### Bitbucket Data Center
1. Log in to Bitbucket
2. Go to Manage Account > HTTP access tokens
3. Click "Create token"
4. Set a name and permissions
5. Generate and copy the token immediately

Store these tokens securely and use them in your Claude Desktop configuration as shown above.
