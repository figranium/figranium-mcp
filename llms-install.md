# Figranium MCP Server - AI Installation Guide (`llms-install.md`)

This document provides step-by-step instructions for AI assistants (such as **Cline**, **Claude Desktop**, **Cursor**, **Roo Code**, and other LLM clients) to automatically configure and install the Figranium MCP server.

---

## Overview & Environment Variables

The Figranium MCP server connects via Standard Input/Output (STDIO) transport and requires the following environment variables:

* `FIGRANIUM_BASE_URL`: Base URL of your Figranium server. Default: `http://localhost:11345`.
* `FIGRANIUM_API_KEY`: API key generated from Figranium settings. (**Required**).

> **Note**: If `FIGRANIUM_API_KEY` is missing, the server prints a setup message to stderr and exits with status code 1.

---

## Automated Setup Instructions for Cline

If you are an AI assistant (like **Cline**) configuring this MCP server for the user, follow these steps:

### Step 1: Locate the Cline MCP Configuration File

Identify the appropriate settings file path based on the user's operating system:

* **macOS**: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
* **Windows**: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
* **Linux**: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

For project-scoped workspace configurations, you can also use `.cline/mcp.json` in the project root directory.

### Step 2: Build from Source (If Using Local Repository)

If configuring from a local repository clone:
1. Ensure dependencies are installed: `npm install`
2. Compile TypeScript: `npm run build`
3. Verify that `dist/index.js` exists and is executable.

### Step 3: Add `figranium` Server Entry to `cline_mcp_settings.json`

Read the existing JSON configuration file (or initialize `{"mcpServers": {}}` if missing), then insert or merge the `figranium` configuration under `mcpServers`.

#### Option A: NPX (Zero-Config / Recommended for standard setup)
```json
{
  "mcpServers": {
    "figranium": {
      "command": "npx",
      "args": [
        "-y",
        "figranium-mcp"
      ],
      "env": {
        "FIGRANIUM_BASE_URL": "http://localhost:11345",
        "FIGRANIUM_API_KEY": "YOUR_FIGRANIUM_API_KEY"
      }
    }
  }
}
```

#### Option B: Local Repository Build
Replace `/PATH/TO/figranium-mcp` with the absolute path to this repository:
```json
{
  "mcpServers": {
    "figranium": {
      "command": "node",
      "args": [
        "/PATH/TO/figranium-mcp/dist/index.js"
      ],
      "env": {
        "FIGRANIUM_BASE_URL": "http://localhost:11345",
        "FIGRANIUM_API_KEY": "YOUR_FIGRANIUM_API_KEY"
      }
    }
  }
}
```

#### Option C: Docker Container
```json
{
  "mcpServers": {
    "figranium": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "FIGRANIUM_BASE_URL",
        "-e", "FIGRANIUM_API_KEY",
        "ghcr.io/figranium/figranium-mcp:latest"
      ],
      "env": {
        "FIGRANIUM_BASE_URL": "http://localhost:11345",
        "FIGRANIUM_API_KEY": "YOUR_FIGRANIUM_API_KEY"
      }
    }
  }
}
```

---

## Instructions for Other Clients

### Claude Desktop
Edit `claude_desktop_config.json`:
* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Configuration snippet:
```json
{
  "mcpServers": {
    "figranium": {
      "command": "npx",
      "args": ["-y", "figranium-mcp"],
      "env": {
        "FIGRANIUM_BASE_URL": "http://localhost:11345",
        "FIGRANIUM_API_KEY": "YOUR_FIGRANIUM_API_KEY"
      }
    }
  }
}
```

### Cursor IDE
Edit `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "figranium": {
      "command": "npx",
      "args": ["-y", "figranium-mcp"],
      "env": {
        "FIGRANIUM_BASE_URL": "http://localhost:11345",
        "FIGRANIUM_API_KEY": "YOUR_FIGRANIUM_API_KEY"
      }
    }
  }
}
```

---

## Verification & Testing

To verify the installation:
1. Ensure `FIGRANIUM_API_KEY` is provided in the configuration.
2. In your client (Cline, Claude Desktop, Cursor), reload or restart MCP servers.
3. Verify that tools (`create_task`, `task_list`, `task_execute`, `schedule_list`, etc.) and resources (`figranium://schemas/task-v1.json`, `figranium://docs/agent-spec.md`) are active.

---

## Troubleshooting

* **Missing API Key**: If `FIGRANIUM_API_KEY` is omitted from `env`, the server exits with stderr: `Missing required environment variable: FIGRANIUM_API_KEY.`
* **Build Missing**: If running via local `node` command and `dist/index.js` is missing, execute `npm install && npm run build`.
* **Port / Connectivity**: Default server URL is `http://localhost:11345`. Ensure Figranium server is running or update `FIGRANIUM_BASE_URL`.
