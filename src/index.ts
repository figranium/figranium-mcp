#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import { z } from "zod";

const BASE_URL = (process.env.FIGRANIUM_BASE_URL || "http://localhost:11345").replace(/\/+$/, "");
const API_KEY = process.env.FIGRANIUM_API_KEY;

if (!API_KEY) {
  console.error("Missing required environment variable: FIGRANIUM_API_KEY.");
  console.error("Set FIGRANIUM_API_KEY before running, or configure your editor integration.");
  console.error("Example: FIGRANIUM_API_KEY=YOUR_API_KEY npx -y figranium-mcp");
  process.exit(1);
}

// Create pre-configured Axios instance
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "x-api-key": API_KEY,
    "Content-Type": "application/json",
  },
});

const SYSTEM_INSTRUCTIONS = `
=========================================
FIGRANIUM TASK LIFECYCLE SYSTEM INSTRUCTIONS
=========================================
As the Figranium MCP Server, you oversee and orchestrate the complete lifecycle of browser automation tasks.
Every task follows a strict execution pipeline that you must carefully construct and validate:

1. TASK CREATION:
   - A task must have a 'name', an initial starting 'url', and an execution 'mode' ('scrape', 'agent', or 'headful').
   - Fast, non-interactive tasks should use 'scrape' mode. Detailed, multi-step scenarios requiring mouse/keyboard simulation should use 'agent' mode. Visible, interactive debug sessions should use 'headful' mode.
   - Configure anti-bot stealth parameters under the 'stealth' object to simulate organic human browsing patterns (typos, curved mouse glides, randomize clicks).

2. STEP SEQUENCE CONSTRUCTION (ACTIONS):
   - You must organize automation steps sequentially in the 'actions' array.
   - Supported actions include page navigation ('navigate'), waiting ('wait', 'wait_selector'), element interaction ('click', 'type', 'hover', 'press'), script execution ('javascript'), control flow ('if', 'else', 'end', 'while', 'repeat', 'foreach'), and extraction ('csv', 'get_content').
   - For interactive elements, ensure a 'wait_selector' is performed BEFORE click/type actions to guarantee the DOM is ready.

3. TARGET SELECTOR RESOLUTION:
   - Prefer highly resilient selector strategies: ID-based selectors (e.g. '#login-btn'), robust CSS classes, XPath, ARIA roles, or reliable text matchers.
   - Avoid brittle, highly nested selectors (like 'div > div > span > button') which break easily.
   - For nested elements, check if they reside inside Shadow DOMs, and ensure 'includeShadowDom' is set to true.

4. EXECUTION HANDLING & MONITORING:
   - Dynamic parameters and transient states must be declared in 'variables' record object.
   - Execute tasks via 'task_execute' tool, passing variable values to override defaults.
   - Track executions using 'execution_list' or stream results. If an execution fails, inspect the step sequence, adjust the target selector or increase the 'wait' duration, and retry.
=========================================
`;

/**
 * Initialize MCP Server with server-wide system instructions
 */
const server = new Server(
  {
    name: "figranium-mcp-server",
    version: "1.0.0",
    description: "Figranium MCP Server - Facilitates complete task creation, execution, schedule, and automation tracking.\n\n" + SYSTEM_INSTRUCTIONS,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

/**
 * Zod Schemas with comprehensive descriptions for validation and diagnostics
 */
const StealthConfigSchema = z.object({
  allowTypos: z.boolean().default(false).describe("Allow realistic keyboard typos to evade bot detection. Expected type: boolean. Example: true"),
  idleMovements: z.boolean().default(false).describe("Perform subtle mouse movements when idle to simulate human attention. Expected type: boolean. Example: false"),
  overscroll: z.boolean().default(false).describe("Scroll past boundaries slightly and adjust to emulate organic reading. Expected type: boolean. Example: true"),
  deadClicks: z.boolean().default(false).describe("Perform occasional clicks on neutral/non-interactive areas to mimic human exploration. Expected type: boolean. Example: false"),
  fatigue: z.boolean().default(false).describe("Gradually slow down action speed over time to mimic human fatigue. Expected type: boolean. Example: true"),
  naturalTyping: z.boolean().default(false).describe("Vary delays between individual keystrokes based on standard typing hand movements. Expected type: boolean. Example: true"),
  cursorGlide: z.boolean().default(false).describe("Move the mouse pointer along bezier/organic curves rather than in straight lines. Expected type: boolean. Example: true"),
  randomizeClicks: z.boolean().default(false).describe("Vary the precise coordinates of clicks within target elements. Expected type: boolean. Example: true")
}).describe("Configures realistic stealth, anti-bot, and human behavior simulation on the browser instance.");

const ActionSchema = z.object({
  id: z.string().optional().describe("Unique identifier for this action step. Generated automatically if omitted. Expected type: string. Example: 'act_101'"),
  type: z.enum([
    'click', 'type', 'wait', 'wait_selector', 'press', 'scroll', 'javascript',
    'csv', 'hover', 'merge', 'screenshot', 'if', 'else', 'end', 'while',
    'repeat', 'foreach', 'stop', 'set', 'on_error', 'navigate', 'wait_downloads',
    'start', 'http_request', 'get_content'
  ]).describe("The action type to perform. Expected type: string enum. Example: 'click'"),
  selector: z.string().optional().describe("CSS selector, XPath, or ARIA locator for the target element. Required for click, type, hover, wait_selector. Expected type: string. Example: '#username'"),
  value: z.string().optional().describe("Input value or configuration value for this action. Used for typing text, script contents, or wait durations. Expected type: string. Example: 'hello@world.com'"),
  key: z.string().optional().describe("The key name to press for 'press' actions, or config variable keys. Expected type: string. Example: 'Enter'"),
  disabled: z.boolean().optional().default(false).describe("Skip execution of this step if set to true. Expected type: boolean. Example: false"),
  varName: z.string().optional().describe("Variable name to store output data or extracted content in. Expected type: string. Example: 'extractedTitle'"),
  conditionVar: z.string().optional().describe("Variable to evaluate for conditional steps (if, while). Expected type: string. Example: 'isLoggedIn'"),
  conditionVarType: z.enum(['string', 'number', 'boolean']).optional().describe("The type of the condition variable to evaluate. Expected type: string enum. Example: 'boolean'"),
  conditionOp: z.string().optional().describe("Operator for conditional comparison (e.g., '==', '!=', 'contains', '>', '<'). Expected type: string. Example: '=='"),
  conditionValue: z.string().optional().describe("Value to compare the condition variable against. Expected type: string. Example: 'true'"),
  typeMode: z.enum(['append', 'replace']).optional().default('replace').describe("Whether to append text or clear/replace existing text during 'type' actions. Expected type: string enum. Example: 'replace'"),
  method: z.string().optional().describe("HTTP method for 'http_request' actions. Expected type: string. Example: 'GET'"),
  headers: z.string().optional().describe("JSON stringified headers for 'http_request'. Expected type: string. Example: '{\"Authorization\": \"Bearer x\"}'"),
  body: z.string().optional().describe("Payload body for 'http_request' actions. Expected type: string. Example: '{\"query\": \"sales\"}'")
}).describe("Represents a discrete automation step or flow-control operation executed in sequence.");

const VariableSchema = z.object({
  type: z.enum(['string', 'number', 'boolean']).describe("The data type of the stored variable. Expected type: string enum. Example: 'string'"),
  value: z.any().describe("The initial value of the variable. Expected type: any. Example: 'John Doe'"),
  autoCreated: z.boolean().optional().default(false).describe("Indicates if the variable was automatically declared by the system. Expected type: boolean. Example: false")
}).describe("Configures state variables accessible throughout the task execution.");

const TaskScheduleSchema = z.object({
  enabled: z.boolean().describe("Whether the task schedule is active. Expected type: boolean. Example: true"),
  frequency: z.enum(['interval', 'hourly', 'daily', 'weekly', 'monthly']).optional().describe("The repetition frequency. Expected type: string enum. Example: 'daily'"),
  intervalMinutes: z.number().optional().describe("Interval duration in minutes. Used if frequency is 'interval'. Expected type: number. Example: 30"),
  hour: z.number().optional().describe("Hour of the day to execute (0-23). Used for daily/weekly/monthly schedules. Expected type: number. Example: 9"),
  minute: z.number().optional().describe("Minute of the hour to execute (0-59). Expected type: number. Example: 15"),
  daysOfWeek: z.array(z.number()).optional().describe("Days of the week (0=Sunday, 1=Monday, ..., 6=Saturday). Expected type: number array. Example: [1, 3, 5]"),
  dayOfMonth: z.number().optional().describe("Day of the month (1-31). Used for monthly schedules. Expected type: number. Example: 1")
}).describe("Optional schedule settings to run this task automatically.");

const CreateTaskSchema = z.object({
  name: z.string().describe("Descriptive name of the automation task. Expected type: string. Example: 'Lead Extractor'"),
  description: z.string().optional().describe("Detailed description of what the task automates. Expected type: string. Example: 'Logs in and extracts weekly leads'"),
  url: z.string().describe("Initial URL to navigate to when the task starts. Expected type: string. Example: 'https://news.ycombinator.com'"),
  mode: z.enum(['scrape', 'agent', 'headful']).describe("Execution mode. 'scrape' is fast and headless; 'agent' uses automated browser interaction; 'headful' runs in a visible browser window. Expected type: string enum. Example: 'agent'"),
  wait: z.number().default(3).describe("Standard delay in seconds to wait after navigation and page loads. Expected type: number. Example: 5"),
  selector: z.string().optional().describe("Default CSS selector to wait for on the page load before starting actions. Expected type: string. Example: '.main-content'"),
  rotateUserAgents: z.boolean().default(false).describe("Rotate user agents across requests to avoid pattern blocking. Expected type: boolean. Example: true"),
  rotateProxies: z.boolean().default(false).describe("Rotate through configured proxy IPs. Expected type: boolean. Example: false"),
  rotateViewport: z.boolean().default(false).describe("Vary viewport resolutions randomly to simulate multiple devices. Expected type: boolean. Example: true"),
  humanTyping: z.boolean().default(false).describe("Vary typing speeds to simulate organic human typing. Expected type: boolean. Example: true"),
  stealth: StealthConfigSchema.optional().describe("Realistic human behavior configurations. Expected type: object."),
  actions: z.array(ActionSchema).default([]).describe("Sequential list of browser actions/control flow steps to execute. Expected type: array of action objects."),
  variables: z.record(VariableSchema).default({}).describe("Task variables to store state and dynamic values. Expected type: record object of variable configurations."),
  extractionScript: z.string().optional().describe("Optional post-execution script to extract data. Expected type: string. Example: 'return Array.from(document.querySelectorAll(\"a\")).map(el => el.href)'"),
  extractionFormat: z.enum(['json', 'csv']).optional().default('json').describe("Target export format of any extracted data. Expected type: string enum. Example: 'json'"),
  includeHtml: z.boolean().optional().default(false).describe("Whether to include the raw page HTML in the execution response. Expected type: boolean. Example: false"),
  includeShadowDom: z.boolean().optional().default(true).describe("Whether to parse and resolve target elements residing in Shadow DOMs. Expected type: boolean. Example: true"),
  disableRecording: z.boolean().optional().default(false).describe("Disable video/VNC recording of this task to save storage. Expected type: boolean. Example: true"),
  statelessExecution: z.boolean().optional().default(false).describe("If set to true, clear browser cookies and session states between runs. Expected type: boolean. Example: false"),
  schedule: TaskScheduleSchema.optional().describe("Task automatic execution schedule. Expected type: object.")
}).describe("Reflects the full schema of a Figranium task creation payload.");

/**
 * Rich formatted JSON Schema of a Figranium Task
 */
const TASK_JSON_SCHEMA = {
  type: "object",
  description: "Exhaustive task creation structure for Figranium automation tasks.",
  properties: {
    name: {
      type: "string",
      description: "Descriptive name of the automation task. Expected type: string. Example: 'HackerNews Scraper'"
    },
    description: {
      type: "string",
      description: "Detailed description of what the task automates. Expected type: string. Example: 'Logs in and extracts weekly leads'"
    },
    url: {
      type: "string",
      description: "Initial URL to navigate to when the task starts. Expected type: string. Example: 'https://news.ycombinator.com'"
    },
    mode: {
      type: "string",
      enum: ["scrape", "agent", "headful"],
      description: "Execution mode. 'scrape' is fast and headless; 'agent' uses automated browser interaction; 'headful' runs in a visible browser window with human oversight. Expected type: string enum. Example: 'agent'"
    },
    wait: {
      type: "number",
      default: 3,
      description: "Standard delay in seconds to wait after navigation and page loads to let dynamic scripts complete. Expected type: number. Example: 5"
    },
    selector: {
      type: "string",
      description: "Default CSS selector to wait for on the page load before starting actions. Expected type: string. Example: '.main-content'"
    },
    rotateUserAgents: {
      type: "boolean",
      default: false,
      description: "Rotate user agents across requests to avoid pattern blocking and fingerprinting. Expected type: boolean. Example: true"
    },
    rotateProxies: {
      type: "boolean",
      default: false,
      description: "Rotate through configured proxy IPs to prevent IP-based rate limiting. Expected type: boolean. Example: false"
    },
    rotateViewport: {
      type: "boolean",
      default: false,
      description: "Vary viewport resolutions randomly to simulate multiple desktop and mobile devices. Expected type: boolean. Example: true"
    },
    humanTyping: {
      type: "boolean",
      default: false,
      description: "Vary typing speeds and insert tiny delays to simulate organic human typing. Expected type: boolean. Example: true"
    },
    stealth: {
      type: "object",
      description: "Configures realistic stealth, anti-bot, and human behavior simulation on the browser instance.",
      properties: {
        allowTypos: {
          type: "boolean",
          default: false,
          description: "Allow realistic keyboard typos to evade bot detection. Expected type: boolean. Example: true"
        },
        idleMovements: {
          type: "boolean",
          default: false,
          description: "Perform subtle mouse movements when idle to simulate human attention. Expected type: boolean. Example: false"
        },
        overscroll: {
          type: "boolean",
          default: false,
          description: "Scroll past boundaries slightly and adjust to emulate organic reading. Expected type: boolean. Example: true"
        },
        deadClicks: {
          type: "boolean",
          default: false,
          description: "Perform occasional clicks on neutral/non-interactive areas to mimic human exploration. Expected type: boolean. Example: false"
        },
        fatigue: {
          type: "boolean",
          default: false,
          description: "Gradually slow down action speed over time to mimic human fatigue. Expected type: boolean. Example: true"
        },
        naturalTyping: {
          type: "boolean",
          default: false,
          description: "Vary delays between individual keystrokes based on standard typing hand movements. Expected type: boolean. Example: true"
        },
        cursorGlide: {
          type: "boolean",
          default: false,
          description: "Move the mouse pointer along bezier/organic curves rather than in straight lines. Expected type: boolean. Example: true"
        },
        randomizeClicks: {
          type: "boolean",
          default: false,
          description: "Vary the precise coordinates of clicks within target elements. Expected type: boolean. Example: true"
        }
      }
    },
    actions: {
      type: "array",
      description: "Sequential list of browser actions/control flow steps to execute.",
      items: {
        type: "object",
        description: "Represents a discrete automation step or flow-control operation executed in sequence.",
        properties: {
          id: {
            type: "string",
            description: "Unique identifier for this action step. Generated automatically if omitted. Expected type: string. Example: 'act_101'"
          },
          type: {
            type: "string",
            enum: [
              "click", "type", "wait", "wait_selector", "press", "scroll", "javascript",
              "csv", "hover", "merge", "screenshot", "if", "else", "end", "while",
              "repeat", "foreach", "stop", "set", "on_error", "navigate", "wait_downloads",
              "start", "http_request", "get_content"
            ],
            description: "The action type to perform. Expected type: string enum. Example: 'click'"
          },
          selector: {
            type: "string",
            description: "CSS selector, XPath, or ARIA locator for the target element. Required for click, type, hover, wait_selector. Expected type: string. Example: '#username'"
          },
          value: {
            type: "string",
            description: "Input value or configuration value for this action. Used for typing text, script contents, or wait durations. Expected type: string. Example: 'hello@world.com'"
          },
          key: {
            type: "string",
            description: "The key name to press for 'press' actions, or config variable keys. Expected type: string. Example: 'Enter'"
          },
          disabled: {
            type: "boolean",
            default: false,
            description: "Skip execution of this step if set to true. Expected type: boolean. Example: false"
          },
          varName: {
            type: "string",
            description: "Variable name to store output data or extracted content in. Expected type: string. Example: 'extractedTitle'"
          },
          conditionVar: {
            type: "string",
            description: "Variable to evaluate for conditional steps (if, while). Expected type: string. Example: 'isLoggedIn'"
          },
          conditionVarType: {
            type: "string",
            enum: ["string", "number", "boolean"],
            description: "The type of the condition variable to evaluate. Expected type: string enum. Example: 'boolean'"
          },
          conditionOp: {
            type: "string",
            description: "Operator for conditional comparison (e.g., '==', '!=', 'contains', '>', '<'). Expected type: string. Example: '=='"
          },
          conditionValue: {
            type: "string",
            description: "Value to compare the condition variable against. Expected type: string. Example: 'true'"
          },
          typeMode: {
            type: "string",
            enum: ["append", "replace"],
            default: "replace",
            description: "Whether to append text or clear/replace existing text during 'type' actions. Expected type: string enum. Example: 'replace'"
          },
          method: {
            type: "string",
            description: "HTTP method for 'http_request' actions. Expected type: string. Example: 'GET'"
          },
          headers: {
            type: "string",
            description: "JSON stringified headers for 'http_request'. Expected type: string. Example: '{\"Authorization\": \"Bearer x\"}'"
          },
          body: {
            type: "string",
            description: "Payload body for 'http_request' actions. Expected type: string. Example: '{\"query\": \"sales\"}'"
          }
        },
        required: ["type"]
      }
    },
    variables: {
      type: "object",
      description: "Task variables to store state and dynamic values. Expected type: record object of variable configurations.",
      additionalProperties: {
        type: "object",
        description: "Configures state variables accessible throughout the task execution.",
        properties: {
          type: {
            type: "string",
            enum: ["string", "number", "boolean"],
            description: "The data type of the stored variable. Expected type: string enum. Example: 'string'"
          },
          value: {
            description: "The initial value of the variable. Expected type: any. Example: 'John Doe'"
          },
          autoCreated: {
            type: "boolean",
            default: false,
            description: "Indicates if the variable was automatically declared by the system. Expected type: boolean. Example: false"
          }
        },
        required: ["type", "value"]
      }
    },
    extractionScript: {
      type: "string",
      description: "Optional post-execution script to extract data. Expected type: string. Example: 'return Array.from(document.querySelectorAll(\"a\")).map(el => el.href)'"
    },
    extractionFormat: {
      type: "string",
      enum: ["json", "csv"],
      default: "json",
      description: "Target export format of any extracted data. Expected type: string enum. Example: 'json'"
    },
    includeHtml: {
      type: "boolean",
      default: false,
      description: "Whether to include the raw page HTML in the execution response. Expected type: boolean. Example: false"
    },
    includeShadowDom: {
      type: "boolean",
      default: true,
      description: "Whether to parse and resolve target elements residing in Shadow DOMs. Expected type: boolean. Example: true"
    },
    disableRecording: {
      type: "boolean",
      default: false,
      description: "Disable video/VNC recording of this task to save storage. Expected type: boolean. Example: true"
    },
    statelessExecution: {
      type: "boolean",
      default: false,
      description: "If set to true, clear browser cookies and session states between runs. Expected type: boolean. Example: false"
    },
    schedule: {
      type: "object",
      description: "Task automatic execution schedule. Expected type: object.",
      properties: {
        enabled: {
          type: "boolean",
          description: "Whether the task schedule is active. Expected type: boolean. Example: true"
        },
        frequency: {
          type: "string",
          enum: ["interval", "hourly", "daily", "weekly", "monthly"],
          description: "The repetition frequency. Expected type: string enum. Example: 'daily'"
        },
        intervalMinutes: {
          type: "number",
          description: "Interval duration in minutes. Used if frequency is 'interval'. Expected type: number. Example: 30"
        },
        hour: {
          type: "number",
          description: "Hour of the day to execute (0-23). Used for daily/weekly/monthly schedules. Expected type: number. Example: 9"
        },
        minute: {
          type: "number",
          description: "Minute of the hour to execute (0-59). Expected type: number. Example: 15"
        },
        daysOfWeek: {
          type: "array",
          items: { type: "number" },
          description: "Days of the week (0=Sunday, 1=Monday, ..., 6=Saturday). Expected type: number array. Example: [1, 3, 5]"
        },
        dayOfMonth: {
          type: "number",
          description: "Day of the month (1-31). Used for monthly schedules. Expected type: number. Example: 1"
        }
      },
      required: ["enabled"]
    }
  },
  required: ["name", "url", "mode"]
};

const CREATE_TASK_DESCRIPTION = `
Create a complete, fully-configured Figranium automation task including sequential action steps, state variables, anti-bot stealth mechanisms, and optional scheduling.

### 1. Purpose
Use this tool when you need to automate any recurring or complex web-based workflows, including data extraction (scraping), automated form-filling, dashboard testing, or dynamic visual monitoring. Tasks are stored permanently in Figranium and can be executed ad-hoc, triggered via API, or scheduled.

### 2. Execution Model
Figranium tasks run as a linear sequence of steps defined in the 'actions' array. Actions are processed in order from top to bottom. Control flow steps (such as 'if', 'while', 'repeat') allow loops and branching, while 'on_error' steps define fallback behaviors. Variables represent the state and can be updated dynamically during execution.

### 3. Comprehensive Step Types
- 'navigate': Redirect browser to a new URL specified in the 'value' field.
- 'wait': Pause execution for N seconds specified in the 'value' field.
- 'wait_selector': Pause until the DOM element matching 'selector' is rendered.
- 'click': Simulate a realistic click on the element matching 'selector'.
- 'type': Type the 'value' into the 'selector' input element. Use 'typeMode' to clear/replace or append.
- 'hover': Move mouse pointer to the element matching 'selector'.
- 'press': Press a specific keyboard key (e.g., 'Enter') specified in the 'key' field.
- 'scroll': Scroll the page or target element to a specific coordinate or direction.
- 'javascript': Execute custom JavaScript on the page. Stored in 'value', outputs can be saved to 'varName'.
- 'screenshot': Capture and save a screenshot.
- 'http_request': Perform direct API requests.
- 'if', 'else', 'end': Conditional blocks based on variables.
- 'while', 'repeat', 'foreach': Looping blocks.
- 'stop': Halt task execution.
- 'set': Set or update a task variable.

### 4. Selector Strategy & Fallbacks
When targeting elements, follow this hierarchy of selectors:
1. Unique IDs (e.g., '#submit-button')
2. ARIA roles and labels (e.g., '[aria-label="Search"]')
3. Reliable CSS classes or data attributes (e.g., '.btn-primary', '[data-testid="login"]')
4. Text matchers or XPath as a final resort.
Fallback: If an element might be missing or slow to load, wrap the interaction inside an 'if' block evaluating a variable or use 'on_error' to catch failure.

### 5. Edge Cases & Retry Logic
- Timeouts: Wait-selectors have a default timeout. Ensure critical steps use 'wait_selector' first to avoid clicking non-existent elements.
- Stealth: Turning on options like 'naturalTyping', 'cursorGlide', and 'allowTypos' simulates authentic human speed and rhythm to prevent anti-bot blocking on protected sites.
- Statelessness: Enable 'statelessExecution' to ensure execution is completely fresh without persistent browser storage/cookies.

### 6. Complex Real-World Multi-Step JSON Example:
\`\`\`json
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
    },
    {
      "type": "navigate",
      "value": "https://httpbin.org/post"
    },
    {
      "type": "wait_selector",
      "selector": "pre"
    },
    {
      "type": "javascript",
      "value": "console.log('Finished scraping and navigated successfully.');"
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
\`\`\`
`;

/**
 * Zod error formatter helper for Rich Error Diagnostics
 */
function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map(issue => {
    const path = issue.path.join(".");
    let msg = `Field "${path}": ${issue.message}.`;
    if (issue.path[0] === "actions" && typeof issue.path[1] === "number") {
      const idx = issue.path[1];
      const subField = issue.path.slice(2).join(".");
      msg = `At Step Index ${idx} (action step #${idx + 1}), parameter "${subField}" failed validation: ${issue.message}.`;
    }
    return ` - ${msg}`;
  });
  return `Schema Validation Failed!\n\nDetailed breakdown of validation errors:\n${issues.join("\n")}\n\nPlease inspect the expected types and structure in figranium://schemas/task-v1.json and try again with the corrected payload.`;
}

/**
 * Register MCP Resources handler
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "figranium://schemas/task-v1.json",
        name: "Figranium Task JSON Schema v1",
        mimeType: "application/json",
        description: "Exposes the full annotated JSON Schema of a Figranium task so agents can inspect the full specification directly."
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  if (uri === "figranium://schemas/task-v1.json") {
    return {
      contents: [
        {
          uri: "figranium://schemas/task-v1.json",
          mimeType: "application/json",
          text: JSON.stringify(TASK_JSON_SCHEMA, null, 2)
        }
      ]
    };
  }
  throw new McpError(ErrorCode.InvalidParams, `Unknown resource URI: ${uri}`);
});

/**
 * Define available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_task",
        description: CREATE_TASK_DESCRIPTION,
        inputSchema: TASK_JSON_SCHEMA,
      },
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
      case "create_task": {
        // Validate with Zod schema for fine-grained error diagnostic feedback
        const parseResult = CreateTaskSchema.safeParse(args || {});
        if (!parseResult.success) {
          return {
            content: [
              {
                type: "text",
                text: formatZodError(parseResult.error),
              },
            ],
            isError: true,
          };
        }

        const taskPayload = parseResult.data;

        // POST to Figranium's create task endpoint
        const response = await api.post("/api/tasks", taskPayload);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

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
