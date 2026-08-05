Here is the full, updated README wrapped in 4-backtick fences so all internal code blocks render cleanly without breaking Markdown formatting:

```markdown
# Figranium MCP Server

[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.figranium%2Ffigranium--mcp-blue)](https://registry.modelcontextprotocol.io)
[![GHCR Container](https://img.shields.io/badge/GHCR-ghcr.io%2Ffigranium%2Ffigranium--mcp-green)](https://github.com/figranium/figranium-mcp/pkgs/container/figranium-mcp)

A Model Context Protocol (MCP) server for [Figranium](https://github.com/figranium/figranium) built using `@modelcontextprotocol/sdk`. This server allows LLM clients (like Claude Desktop, Cursor, and Manus AI) to discover, execute, inspect, schedule, and programmatically create Figranium automation tasks via standard STDIO transport.

## Table of Contents
- [Quick Start (Docker / OCI)](#quick-start-docker--oci)
- [Client Integration](#client-integration)
  - [Claude Desktop](#claude-desktop)
  - [Cursor IDE](#cursor-ide)
  - [Manus AI / Registry Clients](#manus-ai--registry-clients)
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

```bash
docker pull ghcr.io/figranium/figranium-mcp:latest
```

---

## Client Integration

### Claude Desktop

Add the container configuration to your `claude_desktop_config.json`:

* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "figranium": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "ghcr.io/figranium/figranium-mcp:latest"
      ],
      "env": {
        "FIGRANIUM_BASE_URL": "[http://host.docker.internal:11345](http://host.docker.internal:11345)",
        "FIGRANIUM_API_KEY": "your_figranium_api_key_here"
      }
    }
  }
}
```

> **Note for Local Hosts**: If your Figranium instance runs locally on your host machine, use `http://host.docker.internal:11345` so the Docker container can reach your host network.

---

### Cursor IDE

Add via **Settings > Features > MCP > Add New MCP Server**:

* **Name**: `figranium`
* **Type**: `command`
* **Command**: `docker run -i --rm -e FIGRANIUM_BASE_URL=http://host.docker.internal:11345 -e FIGRANIUM_API_KEY=your_key ghcr.io/figranium/figranium-mcp:latest`

---

### Manus AI / Registry Clients

For environments supporting direct MCP Registry resolution, register using the server's official registry namespace:

```text
io.github.figranium/figranium-mcp
```

Clients reading from the registry will resolve the `ghcr.io` OCI identifier automatically.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `FIGRANIUM_BASE_URL` | Base URL of your running Figranium instance | `http://localhost:11345` |
| `FIGRANIUM_API_KEY` | API Key generated in Figranium Settings | *(Required)* |

---

## Server-Wide System Instructions

The server initializes with embedded guidelines for LLM agents detailing the task lifecycle:
1. **Task Creation**: Structuring name, starting URL, execution mode (`scrape`, `agent`, or `headful`), and stealth mechanisms.
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
npx @modelcontextprotocol/inspector node dist/index.js
```

```
