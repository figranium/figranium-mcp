# Figranium MCP Server

[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.figranium%2Ffigranium--mcp-blue)](https://registry.modelcontextprotocol.io)
[![GHCR Container](https://img.shields.io/badge/GHCR-ghcr.io%2Ffigranium%2Ffigranium--mcp-green)](https://github.com/figranium/figranium-mcp/pkgs/container/figranium-mcp)

A Model Context Protocol (MCP) server for [Figranium](https://github.com/figranium/figranium), built with `@modelcontextprotocol/sdk` and the official `@figranium/sdk` API client. This server allows LLM clients (like Cline, Claude Desktop, Cursor, and Manus AI) to discover, execute, inspect, schedule, and programmatically create Figranium automation tasks via standard STDIO transport.

## Table of Contents
- [Quick Start (Docker / OCI)](#quick-start-docker--oci)
- [Client Integration](#client-integration)
  - [Cline](#cline)
  - [Claude Desktop](#claude-desktop)
  - [Cursor IDE](#cursor-ide)
  - [Manus AI / Registry Clients](#manus-ai--registry-clients)
- [Automated AI Setup (`llms-install.md`)](#automated-ai-setup-llms-installmd)
- [Environment Variables](#environment-variables)
- [Server-Wide System Instructions](#server-wide-system-instructions)
- [Available Resources](#available-resources)
- [Available Tools](#available-tools)
  - [Task Operations](#task-operations)
  - [Execution Operations](#execution-operations)
  - [Schedule Operations](#schedule-operations)
- [Rich Input Diagnostics & Self-Correction](#rich-input-diagnostics--self-correction)
- [Local Development & Source Build](#local-development--source-build)

---

## Quick Start (Docker / OCI)

No Node.js runtime or repository clone is required. The official container image is published on GitHub Container Registry (`ghcr.io`).

Zero-config npm usage is also supported:

```bash
npx -y figranium-mcp
```

For local development:

```bash
git clone https://github.com/figranium/figranium-mcp
dcd figranium-mcp
npm install
npm run build
```

```bash
docker pull ghcr.io/figranium/figranium-mcp:latest
```

## Environment Variables

The server requires the following environment variables to interact with your Figranium instance:

* `FIGRANIUM_BASE_URL`: The base URL of your Figranium server. Defaults to `http://localhost:11345`.
* `FIGRANIUM_API_KEY`: The API key generated from Figranium settings to authorize requests. This variable is required for startup.

If `FIGRANIUM_API_KEY` is missing, the server prints a clear setup message and exits gracefully.

---

## Client Integration

### Cline

Add the following to your `cline_mcp_settings.json`:

* **macOS**: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
* **Windows**: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
* **Linux**: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "figranium": {
      "command": "npx",
      "args": ["-y", "figranium-mcp"],
      "env": {
        "FIGRANIUM_BASE_URL": "http://localhost:11345",
        "FIGRANIUM_API_KEY": "your_figranium_api_key_here"
      }
    }
  }
}
```

Alternatively, if running directly from a cloned source repository:

```json
{
  "mcpServers": {
    "figranium": {
      "command": "node",
      "args": ["/path/to/figranium-mcp/dist/index.js"],
      "env": {
        "FIGRANIUM_BASE_URL": "http://localhost:11345",
        "FIGRANIUM_API_KEY": "your_figranium_api_key_here"
      }
    }
  }
}
```

> **Automated Setup for Cline**: Give Cline a link or reference to [`llms-install.md`](./llms-install.md) and Cline will perform the setup and configuration automatically.

---

### Claude Desktop

Add the container configuration to your `claude_desktop_config.json`:

* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "figranium": {
      "command": "npx",
      "args": ["-y", "figranium-mcp"],
      "env": {
        "FIGRANIUM_BASE_URL": "http://localhost:11345",
        "FIGRANIUM_API_KEY": "your_figranium_api_key_here"
      }
    }
  }
}
```

> **Note for Local Hosts**: If your Figranium instance runs locally on your host machine,
> use `http://localhost:11345` when running via `npx`.

---

### Cursor Integration

Add the following to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "figranium": {
      "command": "npx",
      "args": ["-y", "figranium-mcp"],
      "env": {
        "FIGRANIUM_BASE_URL": "http://localhost:11345",
        "FIGRANIUM_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

This lets Claude Desktop and Cursor launch the package directly without requiring a local build or a Docker bridge.

---

## Automated AI Setup (`llms-install.md`)

AI assistants (including Cline, Cursor, Claude Desktop, and Roo Code) can automatically read [`llms-install.md`](./llms-install.md) to set up and configure the Figranium MCP server without manual intervention.

---

## Server-Wide System Instructions

The server initializes with embedded guidelines for LLM agents detailing the task lifecycle:
1. **Task Creation**: Structuring name, starting URL, execution mode, and stealth mechanisms. Agents should default to `agent` mode, including for scraping tasks. `scrape` mode does not support action blocks and is reserved for exceptional cases requiring extremely fast, action-free scraping; `headful` is intended for visible interactive debugging.
2. **Step Sequence Construction**: Ordering action steps (`navigate`, `wait_selector`, `click`, `type`, `javascript`) and execution flow.
3. **Selector Strategy**: Preferring robust ARIA, ID, and semantic class selectors with fallback strategies.
4. **Execution & Variables**: Injecting and overriding runtime context variables.

---

## Available Resources

### `figranium://schemas/task-v1.json`
* **MIME Type**: `application/json`
* **Description**: Exposes the complete JSON Schema specification of a Figranium task. Allows agents to dynamically inspect valid parameters and payload shapes.

---

## Available Tools

### Task Operations

* **`create_task`**: Create a complete, fully-configured Figranium automation task including sequential action steps, state variables, anti-bot stealth mechanisms, and optional scheduling.
* **`task_list`**: List all task IDs, names, and descriptions registered on the Figranium server.
* **`task_execute`**: Run a saved task by `taskId` with optional variable overrides.

### Execution Operations

* **`execution_list`**: Retrieve a summary of past task execution logs and statuses.

### Schedule Operations

* **`schedule_list`**: List all tasks with configured schedules.
* **`schedule_get_all_status`**: Retrieve overall scheduler state and metadata.
* **`schedule_get_status`**: Get active schedule details and next run time for a specific `taskId`.
* **`schedule_set`**: Create or update a cron or frequency schedule on a task.
* **`schedule_delete`**: Disable and remove a task schedule.
* **`schedule_describe`**: Validate and preview a schedule configuration without applying it.

---

## Rich Input Diagnostics & Self-Correction

If an invalid parameter payload is supplied to `create_task`, the server returns structured Zod diagnostic output (`isError: true`). This allows connected LLMs to analyze schema errors and attempt immediate self-correction.

Example response:
```text
Schema Validation Failed!

Detailed breakdown of validation errors:
 - At Step Index 2 (action step #3), parameter "type" failed validation: Invalid enum value. Expected 'click' | 'type' | 'wait' ..., received 'clikc'
```

---

## Local Development & Source Build

If you wish to modify the source code or run without Docker:

### Prerequisites
* Node.js v18+
* npm v9+

### Build & Run

```bash
# Clone repository
git clone [https://github.com/figranium/figranium-mcp.git](https://github.com/figranium/figranium-mcp.git)
cd figranium-mcp

# Install dependencies and compile TypeScript
npm install
npm run build

# Watch mode for active development
npm run watch
```

### Testing with MCP Inspector

Inspect server tools and resources using the official MCP debugging suite:

```bash
npx @modelcontextprotocol/inspector npx -y figranium-mcp
```
