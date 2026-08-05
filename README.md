# Figranium MCP Server

A Model Context Protocol (MCP) server for [Figranium](https://github.com/figranium/figranium) built using `@modelcontextprotocol/sdk`. This server allows LLM clients (like Claude Desktop) to discover, execute, inspect, schedule, and programmatically create Figranium automation tasks.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Claude Desktop Integration](#claude-desktop-integration)
- [Server-Wide System Instructions](#server-wide-system-instructions)
- [Available Resources](#available-resources)
- [Available Tools](#available-tools)
  - [Task Operations](#task-operations)
  - [Execution Operations](#execution-operations)
  - [Schedule Operations](#schedule-operations)
- [Rich Input Diagnostics & Self-Correction](#rich-input-diagnostics--self-correction)
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

## Server-Wide System Instructions

The server initializes with standard guidelines detailing the complete lifecycle of a Figranium task:
1. **Task Creation**: Structuring name, starting URL, and mode (`scrape`, `agent`, or `headful`), and configuring realistic stealth mechanisms.
2. **Step Sequence Construction**: Ordering action steps (e.g., `navigate`, `wait_selector`, `click`, `type`, `javascript`) and flow control.
3. **Selector Strategy**: Focusing on robust selector structures (IDs, ARIA roles, classes) and fallback handling.
4. **Execution and Variables**: Managing transient states via variables and overriding variable values during runs.

---

## Available Resources

The server registers the following MCP Resources:

### 1. `figranium://schemas/task-v1.json`
* **Description**: Exposes the full, deeply-annotated JSON Schema specification of a Figranium task.
* **MimeType**: `application/json`
* **Purpose**: Allows LLMs and consuming agents to inspect the exact properties, sub-objects, array items, and constraints of a Figranium task on demand.

---

## Available Tools

The server registers standard Figranium operations as MCP tools:

### Task Operations

#### 1. `create_task`
* **Description**: Create a complete, fully-configured Figranium automation task including sequential action steps, state variables, anti-bot stealth mechanisms, and optional scheduling. Includes complete guidance on purpose, execution model, step types, selector strategy, and edge cases.
* **Input Schema**: Full annotated JSON Schema matching `figranium://schemas/task-v1.json` (includes `name`, `url`, `mode`, `wait`, `stealth`, `actions`, `variables`, `extractionScript`, `extractionFormat`, etc.).
* **Complex Example Payload**:
  ```json
  {
    "name": "HackerNews Custom Scraper",
    "url": "https://news.ycombinator.com",
    "mode": "agent",
    "wait": 3,
    "rotateUserAgents": true,
    "stealth": {
      "allowTypos": true,
      "cursorGlide": true,
      "naturalTyping": true
    },
    "actions": [
      {
        "type": "wait_selector",
        "selector": ".hnname"
      },
      {
        "type": "click",
        "selector": "a.hnmore"
      },
      {
        "type": "wait",
        "value": "2"
      },
      {
        "type": "javascript",
        "value": "return Array.from(document.querySelectorAll('.athing')).map(tr => ({ id: tr.id, title: tr.querySelector('.titleline > a')?.innerText, href: tr.querySelector('.titleline > a')?.href }));",
        "varName": "hn_stories"
      }
    ],
    "variables": {
      "hn_stories": {
        "type": "string",
        "value": "[]"
      }
    },
    "extractionFormat": "json"
  }
  ```

#### 2. `task_list`
* **Description**: Returns all task IDs, names, and descriptions from the Figranium server.
* **Arguments**: None

#### 3. `task_execute`
* **Description**: Runs a saved task and returns its execution result.
* **Arguments**:
  - `taskId` (string, required): The unique identifier of the task.
  - `variables` (object, optional): Key-value pairs (where keys and values are strings) representing execution variables.

---

### Execution Operations

#### 4. `execution_list`
* **Description**: Returns a summary of all past automation execution records.
* **Arguments**: None

---

### Schedule Operations

#### 5. `schedule_list`
* **Description**: Returns all tasks that have schedules configured (enabled or not) along with their configuration.
* **Arguments**: None

#### 6. `schedule_get_all_status`
* **Description**: Get overall scheduler status and metadata for all schedules.
* **Arguments**: None

#### 7. `schedule_get_status`
* **Description**: Retrieves the schedule status, resolved cron config, and next run time for a specific task.
* **Arguments**:
  - `taskId` (string, required): The task's unique ID.

#### 8. `schedule_delete`
* **Description**: Disables and removes the schedule configuration from a specific task.
* **Arguments**:
  - `taskId` (string, required): The task's unique ID.

#### 9. `schedule_set`
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

#### 10. `schedule_describe`
* **Description**: Validates and previews/describes a schedule configuration without saving it.
* **Arguments**:
  - `taskId` (string, required): The task's unique ID.
  - `scheduleMode` (string, required): Either `"cron"` or `"frequency"`.
  - (Other optional schedule arguments matching those of `schedule_set`).

---

## Rich Input Diagnostics & Self-Correction

If you supply invalid fields or parameters when calling `create_task`, the Figranium MCP Server automatically performs comprehensive validation via Zod and returns `isError: true` accompanied by precise step-by-step diagnostic information.

For example, if you configure a step of type `"click"` but specify an invalid sub-field, you will receive a diagnostic error like:
```text
Schema Validation Failed!

Detailed breakdown of validation errors:
 - At Step Index 2 (action step #3), parameter "type" failed validation: Invalid enum value. Expected 'click' | 'type' | 'wait' ..., received 'clikc'

Please inspect the expected types and structure in figranium://schemas/task-v1.json and try again with the corrected payload.
```
This precise pinpointing enables LLMs to perform immediate, autonomous self-correction without requiring human intervention.

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
