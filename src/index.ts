import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";

const BASE_URL = (process.env.FIGRANIUM_BASE_URL || "http://localhost:11345").replace(/\/+$/, "");
const API_KEY = process.env.FIGRANIUM_API_KEY || "";

// Create pre-configured Axios instance
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "x-api-key": API_KEY,
    "Content-Type": "application/json",
  },
});

/**
 * Initialize MCP Server
 */
const server = new Server(
  {
    name: "figranium-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Define available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "task_list",
        description: "List all task IDs, names, and descriptions from Figranium.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "task_execute",
        description: "Execute/run a saved automation task by ID and return its result.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "The unique ID of the task to execute.",
            },
            variables: {
              type: "object",
              description: "Key-value pairs representing the execution variables (optional).",
              additionalProperties: {
                type: "string"
              }
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "execution_list",
        description: "List a summary of all past execution records.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "schedule_list",
        description: "List all tasks that have schedules configured (enabled or not).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "schedule_get_all_status",
        description: "Get overall scheduler status and metadata for all schedules.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "schedule_get_status",
        description: "Get the detailed schedule status, cron configuration, and next run time for a specific task.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "The unique ID of the task to check.",
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "schedule_set",
        description: "Create or update a schedule for a specific task.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "The unique ID of the task to configure.",
            },
            enabled: {
              type: "boolean",
              description: "Whether the schedule is active.",
            },
            scheduleMode: {
              type: "string",
              enum: ["cron", "frequency"],
              description: "Whether to define the schedule using 'cron' or structured 'frequency' fields.",
            },
            cronExpression: {
              type: "string",
              description: "Standard 5-field cron expression. Used if scheduleMode is 'cron'.",
            },
            frequency: {
              type: "string",
              enum: ["interval", "daily", "weekly", "monthly"],
              description: "The frequency mode. Used if scheduleMode is 'frequency'.",
            },
            intervalMinutes: {
              type: "number",
              description: "Interval in minutes if frequency is 'interval'.",
            },
            scheduleHour: {
              type: "number",
              description: "Hour of execution (0-23) if frequency is 'daily', 'weekly', or 'monthly'.",
            },
            scheduleMinute: {
              type: "number",
              description: "Minute of execution (0-59) if frequency is 'daily', 'weekly', or 'monthly'.",
            },
            daysOfWeek: {
              type: "array",
              items: {
                type: "number",
                description: "Day of the week (0=Sunday, 1=Monday, ..., 6=Saturday).",
              },
              description: "Array of days of the week if frequency is 'weekly'.",
            },
            dayOfMonth: {
              type: "number",
              description: "Day of the month (1-31) if frequency is 'monthly'.",
            },
          },
          required: ["taskId", "enabled", "scheduleMode"],
        },
      },
      {
        name: "schedule_delete",
        description: "Disable and remove the schedule configuration from a specific task.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "The unique ID of the task whose schedule to delete.",
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "schedule_describe",
        description: "Validate and preview/describe a schedule configuration without saving it.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "The unique ID of the task.",
            },
            scheduleMode: {
              type: "string",
              enum: ["cron", "frequency"],
              description: "Whether to define the schedule using 'cron' or structured 'frequency' fields.",
            },
            cronExpression: {
              type: "string",
              description: "Standard 5-field cron expression. Used if scheduleMode is 'cron'.",
            },
            frequency: {
              type: "string",
              enum: ["interval", "daily", "weekly", "monthly"],
              description: "The frequency mode. Used if scheduleMode is 'frequency'.",
            },
            intervalMinutes: {
              type: "number",
              description: "Interval in minutes if frequency is 'interval'.",
            },
            scheduleHour: {
              type: "number",
              description: "Hour of execution (0-23) if frequency is 'daily', 'weekly', or 'monthly'.",
            },
            scheduleMinute: {
              type: "number",
              description: "Minute of execution (0-59) if frequency is 'daily', 'weekly', or 'monthly'.",
            },
            daysOfWeek: {
              type: "array",
              items: {
                type: "number",
              },
              description: "Array of days of the week if frequency is 'weekly'.",
            },
            dayOfMonth: {
              type: "number",
              description: "Day of the month (1-31) if frequency is 'monthly'.",
            },
          },
          required: ["taskId", "scheduleMode"],
        },
      },
    ],
  };
});

/**
 * Handle incoming tool executions
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "task_list": {
        const response = await api.get("/api/tasks/list");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "task_execute": {
        const { taskId, variables } = (args || {}) as {
          taskId: string;
          variables?: Record<string, string>;
        };

        if (!taskId) {
          throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        }

        const response = await api.post(`/api/tasks/${encodeURIComponent(taskId)}/api`, {
          variables: variables || {},
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "execution_list": {
        const response = await api.get("/api/executions/list");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "schedule_list": {
        const response = await api.get("/api/schedules");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "schedule_get_all_status": {
        const response = await api.get("/api/schedules/status/all");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "schedule_get_status": {
        const { taskId } = (args || {}) as { taskId: string };
        if (!taskId) {
          throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        }

        const response = await api.get(`/api/schedules/${encodeURIComponent(taskId)}/status`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "schedule_delete": {
        const { taskId } = (args || {}) as { taskId: string };
        if (!taskId) {
          throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        }

        const response = await api.delete(`/api/schedules/${encodeURIComponent(taskId)}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "schedule_set": {
        const {
          taskId,
          enabled,
          scheduleMode,
          cronExpression,
          frequency,
          intervalMinutes,
          scheduleHour,
          scheduleMinute,
          daysOfWeek,
          dayOfMonth,
        } = (args || {}) as {
          taskId: string;
          enabled: boolean;
          scheduleMode: "cron" | "frequency";
          cronExpression?: string;
          frequency?: "interval" | "daily" | "weekly" | "monthly";
          intervalMinutes?: number;
          scheduleHour?: number;
          scheduleMinute?: number;
          daysOfWeek?: number[];
          dayOfMonth?: number;
        };

        if (!taskId) {
          throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        }

        const body: Record<string, any> = { enabled };

        if (scheduleMode === "cron") {
          body.cron = cronExpression;
        } else {
          body.frequency = frequency;
          if (frequency === "interval") {
            body.intervalMinutes = intervalMinutes;
          } else if (frequency === "weekly") {
            body.hour = scheduleHour;
            body.minute = scheduleMinute;
            body.daysOfWeek = daysOfWeek;
          } else if (frequency === "monthly") {
            body.hour = scheduleHour;
            body.minute = scheduleMinute;
            body.dayOfMonth = dayOfMonth;
          } else {
            // daily
            body.hour = scheduleHour;
            body.minute = scheduleMinute;
          }
        }

        const response = await api.post(`/api/schedules/${encodeURIComponent(taskId)}`, body);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "schedule_describe": {
        const {
          taskId,
          scheduleMode,
          cronExpression,
          frequency,
          intervalMinutes,
          scheduleHour,
          scheduleMinute,
          daysOfWeek,
          dayOfMonth,
        } = (args || {}) as {
          taskId: string;
          scheduleMode: "cron" | "frequency";
          cronExpression?: string;
          frequency?: "interval" | "daily" | "weekly" | "monthly";
          intervalMinutes?: number;
          scheduleHour?: number;
          scheduleMinute?: number;
          daysOfWeek?: number[];
          dayOfMonth?: number;
        };

        if (!taskId) {
          throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        }

        const body: Record<string, any> = {};

        if (scheduleMode === "cron") {
          body.cron = cronExpression;
        } else {
          body.frequency = frequency;
          if (frequency === "interval") {
            body.intervalMinutes = intervalMinutes;
          } else if (frequency === "weekly") {
            body.hour = scheduleHour;
            body.minute = scheduleMinute;
            body.daysOfWeek = daysOfWeek;
          } else if (frequency === "monthly") {
            body.hour = scheduleHour;
            body.minute = scheduleMinute;
            body.dayOfMonth = dayOfMonth;
          } else {
            // daily
            body.hour = scheduleHour;
            body.minute = scheduleMinute;
          }
        }

        const response = await api.post(`/api/schedules/${encodeURIComponent(taskId)}/describe`, body);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: any) {
    let errorMessage = error.message || "An unknown error occurred";
    if (axios.isAxiosError(error) && error.response) {
      errorMessage = `API Error [${error.response.status}]: ${JSON.stringify(error.response.data)}`;
    }
    return {
      content: [
        {
          type: "text",
          text: `Error executing tool ${name}: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start the MCP Server using stdio transport
 */
async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Figranium MCP Server is running...");
}

start().catch((error) => {
  console.error("Failed to start Figranium MCP Server:", error);
  process.exit(1);
});
