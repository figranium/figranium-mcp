# Figranium MCP Server

A Model Context Protocol (MCP) server for [Figranium](https://github.com/figranium/figranium) built using `@modelcontextprotocol/sdk`. This server allows LLM clients (like Claude Desktop) to discover, execute, inspect, and schedule Figranium automation tasks.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Claude Desktop Integration](#claude-desktop-integration)
- [Available Tools](#available-tools)
  - [Tasks](#tasks)
  - [Executions](#executions)
  - [Schedules](#schedules)
- [Development](#development)

---

## Prerequisites
- Node.js (v18 or higher recommended)
- Figranium instance up and running.
- A Figranium API Key (can be configured in your Figranium Settings page).

## Installation

To clone and install dependencies:

```bash
git clone <repository-url>
cd figranium-mcp-server
npm install
npm run build
```

## Environment Variables

The server requires the following environment variables to interact with your Figranium instance:

* `FIGRANIUM_BASE_URL`: The base URL of your Figranium server. Defaults to `http://localhost:11345`.
* `FIGRANIUM_API_KEY`: The API key generated from Figranium settings to authorize requests.

---

## Claude Desktop Integration

To use this server with Claude Desktop, add the following configuration block to your `claude_desktop_config.json` file.

### Finding your configuration file:
* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Configuration Block:

```json
{
  "mcpServers": {
    "figranium": {
      "command": "node",
      "args": [
        "/absolute/path/to/figranium-mcp-server/dist/index.js"
      ],
      "env": {
        "FIGRANIUM_BASE_URL": "http://localhost:11345",
        "FIGRANIUM_API_KEY": "your_figranium_api_key_here"
      }
    }
  }
}
```

Make sure to replace `/absolute/path/to/figranium-mcp-server/dist/index.js` with the correct absolute path to the compiled `index.js` file on your machine, and configure your actual `FIGRANIUM_API_KEY` and `FIGRANIUM_BASE_URL`.

---

## Available Tools

The server registers standard Figranium operations as MCP tools:

### Tasks

#### 1. `task_list`
* **Description**: Returns all task IDs, names, and descriptions from the Figranium server.
* **Arguments**: None

#### 2. `task_execute`
* **Description**: Runs a saved task and returns its execution result.
* **Arguments**:
  - `taskId` (string, required): The unique identifier of the task.
  - `variables` (object, optional): Key-value pairs (where keys and values are strings) representing execution variables.

---

### Executions

#### 3. `execution_list`
* **Description**: Returns a summary of all past automation execution records.
* **Arguments**: None

---

### Schedules

#### 4. `schedule_list`
* **Description**: Returns all tasks that have schedules configured (enabled or not) along with their configuration.
* **Arguments**: None

#### 5. `schedule_get_all_status`
* **Description**: Get overall scheduler status and metadata for all schedules.
* **Arguments**: None

#### 6. `schedule_get_status`
* **Description**: Retrieves the schedule status, resolved cron config, and next run time for a specific task.
* **Arguments**:
  - `taskId` (string, required): The task's unique ID.

#### 7. `schedule_delete`
* **Description**: Disables and removes the schedule configuration from a specific task.
* **Arguments**:
  - `taskId` (string, required): The task's unique ID.

#### 8. `schedule_set`
* **Description**: Creates or updates a schedule on a task.
* **Arguments**:
  - `taskId` (string, required): The task's unique ID.
  - `enabled` (boolean, required): Whether the schedule is active.
  - `scheduleMode` (string, required): Either `"cron"` or `"frequency"`.
  - `cronExpression` (string, optional): A standard 5-field cron expression (minute hour day month weekday). Required if `scheduleMode` is `"cron"`.
  - `frequency` (string, optional): One of `"interval"`, `"daily"`, `"weekly"`, or `"monthly"`. Required if `scheduleMode` is `"frequency"`.
  - `intervalMinutes` (number, optional): Run interval in minutes (required if frequency is `"interval"`).
  - `scheduleHour` (number, optional): Hour of execution (0–23) for daily/weekly/monthly frequencies.
  - `scheduleMinute` (number, optional): Minute of execution (0–59) for daily/weekly/monthly frequencies.
  - `daysOfWeek` (array of numbers, optional): Days of the week (0 = Sunday, 1 = Monday, etc.) for weekly frequency.
  - `dayOfMonth` (number, optional): Day of the month (1–31) for monthly frequency.

#### 9. `schedule_describe`
* **Description**: Validates and previews/describes a schedule configuration without saving it.
* **Arguments**:
  - `taskId` (string, required): The task's unique ID.
  - `scheduleMode` (string, required): Either `"cron"` or `"frequency"`.
  - (Other optional schedule arguments matching those of `schedule_set`).

---

## Development

To run the server in development mode with auto-recompile:

```bash
npm run watch
```

You can test interaction using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
