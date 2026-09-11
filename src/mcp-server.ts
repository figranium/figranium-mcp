import process from "process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  Figranium,
  FigraniumError,
  type Schedule,
  type Task,
} from "@figranium/sdk";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface FigraniumServerConfig {
  baseUrl: string;
  apiKey: string;
}

export function createFigraniumServer({ baseUrl, apiKey }: FigraniumServerConfig) {
  const BASE_URL = baseUrl.replace(/\/+$/, "");
  const API_KEY = apiKey;

  // Use the official SDK for all communication with the Figranium API.
  const figranium = new Figranium({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    apiKeyHeader: "x-api-key",
  });

const SYSTEM_INSTRUCTIONS = `
=========================================
FIGRANIUM TASK LIFECYCLE SYSTEM INSTRUCTIONS
=========================================
As the Figranium MCP Server, you oversee and orchestrate the complete lifecycle of browser automation tasks.
Every task follows a strict execution pipeline that you must carefully construct and validate:

1. VARIABLE TEMPLATING SYNTAX (HIGH PRIORITY):
   - You MUST use '{$variable_name}' (with a single curly brace and dollar sign, e.g. {$myVar}) for variable references/templating inside action values, URLs, headers, or body fields.
   - NEVER use double curly braces like '{{variable_name}}' or JavaScript-style templates, as these syntaxes are unsupported and will cause execution failures.
   - Task-level variables are INPUTS or caller-overridable configuration only. Do not declare variables merely because the task returns fields with those names.
   - Example: if a task accepts a starting price and returns a final price, the starting price may be a task variable; an output-only price field must not be declared as a task variable.
   - Use the 'set' (Set Variable) action for values created or updated during execution and needed by later steps. Set Variable can both create a new runtime variable and update an existing one.

2. MANDATORY AUTOMATIC TESTING:
   - UNLESS EXPLICITLY PROMPTED BY THE USER NOT TO TEST, you MUST immediately test and verify newly created or updated tasks by calling the 'task_execute' tool right after calling 'create_task' or 'task_update'.
   - AFTER TESTING A TASK, do not consider an execution successful merely because its execution status is 'success'.
   - Inspect the actual returned result and verify that it meaningfully satisfies the user's request.
   - If the output is empty, malformed, irrelevant, duplicated, unexpectedly null, or otherwise incorrect, fix the task and execute it again.

3. TASK CREATION AND DESIGN:
   - A task must have a 'name', an initial starting 'url', and an execution 'mode' ('scrape', 'agent', or 'headful').
   - Use 'agent' mode by default, including for scraping tasks. Agent mode supports the 'actions' array and should be chosen for nearly all browser automation and extraction workflows.
   - 'scrape' mode does NOT support action blocks. Use it only for exceptional cases that require extremely fast, action-free scraping.
   - Use 'headful' mode for visible, interactive debug sessions.
   - Prefer the simplest native Figranium workflow that reliably satisfies the request.
   - Do not add actions that duplicate task-level behavior. In particular, do not add duplicate On Execution/start, wait, or navigate actions when the task-level start/navigation/wait behavior already performs that job.
   - Do not add variables, waits, navigation, JavaScript, loops, or other blocks unless they serve a concrete purpose.
   - Do not create configuration options the task does not actually use.
   - Prefer native Figranium actions over JavaScript. Use JavaScript blocks only when the task genuinely requires scripting or when normal actions are not sufficiently reliable.

4. STEP SEQUENCE CONSTRUCTION (ACTIONS):
   - Organize automation steps sequentially in the 'actions' array.
   - Supported actions include page navigation ('navigate', 'reload'), waiting ('wait', 'wait_selector'), element interaction ('click', 'check', 'uncheck', 'drag_and_drop', 'select', 'type', 'hover', 'press'), script execution ('javascript'), control flow ('if', 'else', 'end', 'while', 'repeat', 'foreach'), and extraction helpers ('csv', 'get_content').
   - Add a 'wait_selector' before click/type only when readiness is not already guaranteed and the wait serves a concrete reliability purpose.
   - Always close opened block structures (e.g. 'if', 'while', 'repeat', 'foreach') with a corresponding 'end' action step.

5. SOURCE AND EXTRACTION:
   - When the user does not specify a source, choose one that directly represents the requested data rather than fetching a broad unrelated dataset and filtering it afterward.
   - Prefer structured first-party/public APIs when they provide the required information reliably.
   - Final task outputs belong in the task's 'extractionScript' field. Do not model final output fields as task variables.
   - Final result table parsing and final structured extraction must be implemented in 'extractionScript'; JavaScript action blocks are not a substitute for the final extraction script.
   - When extracting lists, return consistently structured records and remove obvious duplicates when appropriate.

6. DYNAMIC VALUES:
   - Values that depend on execution time, such as 'today', 'last 7 days', or 'past 90 days', must remain dynamic.
   - Do not hard-code the date observed while creating the task unless the user explicitly requests a fixed date.

7. TARGET SELECTOR RESOLUTION:
   - Prefer highly resilient selector strategies: ID-based selectors, robust CSS classes, XPath, ARIA roles, or reliable text matchers.
   - Avoid brittle, highly nested selectors that break easily.
   - For nested elements, check whether they reside inside Shadow DOMs and set 'includeShadowDom' appropriately.

8. USER INTENT:
   - Preserve intentional ambiguity when it represents a reasonable implementation choice.
   - Do not invent unnecessary requirements, but make sensible implementation decisions when needed to complete the task.

9. EXECUTION HANDLING & MONITORING:
   - Execute tasks via 'task_execute', passing only genuine input variable overrides.
   - Runtime/transient state that is created mid-task should normally be created or updated with Set Variable rather than predeclared as a task input.
   - Track executions using 'execution_list' or stream results. If an execution or its result is wrong, inspect the task, fix the relevant source/action/selector/extraction logic, and retry.
=========================================
`;

/**
 * Initialize MCP Server with server-wide system instructions
 */
const server = new Server(
  {
    name: "figranium-mcp-server",
    version: "1.3.0",
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
    'start', 'http_request', 'get_content', 'solve_captcha', 'wait_captcha',
    'upload', 'finalize_uploads', 'check', 'uncheck', 'drag_and_drop', 'reload', 'select', 'do_nothing'
  ]).describe("The action type to perform. Expected type: string enum. Example: 'click'"),
  selector: z.string().optional().describe("CSS selector, XPath, or ARIA locator for the target element. Required for click, type, hover, wait_selector. Expected type: string. Example: '#username'"),
  value: z.string().optional().describe("Input value or configuration value for this action. Supports variable templating. MUST use '{$variable_name}' syntax for variable references (e.g., '{$myVar}'). NEVER use '{{variable_name}}' or '${variable_name}'. Expected type: string. Example: 'hello@world.com'"),
  key: z.string().optional().describe("The key name to press for 'press' actions, or config variable keys. Expected type: string. Example: 'Enter'"),
  disabled: z.boolean().optional().default(false).describe("Skip execution of this step if set to true. Expected type: boolean. Example: false"),
  varName: z.string().optional().describe("Runtime variable name used by actions such as Set Variable, merge, or foreach. Set Variable may create or update this runtime variable. Do not use varName as the schema for final task outputs; use extractionScript for final extraction."),
  conditionVar: z.string().optional().describe("Variable to evaluate for conditional steps (if, while). Expected type: string. Example: 'isLoggedIn'"),
  conditionVarType: z.enum(['string', 'number', 'boolean']).optional().describe("The type of the condition variable to evaluate. Expected type: string enum. Example: 'boolean'"),
  conditionOp: z.string().optional().describe("Operator for conditional comparison (e.g., '==', '!=', 'contains', '>', '<'). Expected type: string. Example: '=='"),
  conditionValue: z.string().optional().describe("Value to compare the condition variable against. Expected type: string. Example: 'true'"),
  typeMode: z.enum(['append', 'replace']).optional().default('replace').describe("Whether to append text or clear/replace existing text during 'type' actions. Expected type: string enum. Example: 'replace'"),
  clickType: z.enum(['single', 'double', 'right']).optional().default('single').describe("Click interaction mode for 'click': single, double, or right click. Expected type: string enum. Example: 'double'"),
  targetSelector: z.string().optional().describe("Destination selector for 'drag_and_drop'. Required with a source 'selector'. Expected type: string. Example: '.done-column'"),
  method: z.string().optional().describe("HTTP method for 'http_request' actions. Expected type: string. Example: 'GET'"),
  headers: z.string().optional().describe("JSON stringified headers for 'http_request'. Supports variable templating. MUST use '{$variable_name}' syntax for variable references. Expected type: string. Example: '{\"Authorization\": \"Bearer {$token}\"}'"),
  body: z.string().optional().describe("Payload body for 'http_request' actions. Supports variable templating. MUST use '{$variable_name}' syntax for variable references. Expected type: string. Example: '{\"query\": \"{$value}\"}'"),
  captchaType: z.enum(['recaptcha_v2', 'recaptcha_v3', 'hcaptcha', 'turnstile']).optional().describe("The CAPTCHA provider to target for 'solve_captcha'/'wait_captcha' actions. Expected type: string enum. Example: 'recaptcha_v2'"),
  timeout: z.number().optional().describe("Maximum time in seconds to wait for a CAPTCHA to become ready or solved, for 'solve_captcha'/'wait_captcha' actions. Expected type: number. Example: 30"),
  cabinetId: z.string().optional().describe("Source Cabinet ID for an 'upload' action; omitted uses the default Cabinet. Expected type: string. Example: 'cab_basic'"),
  markAsUploaded: z.boolean().optional().describe("When true, an 'upload' action marks its Cabinet item uploaded immediately after attaching it. Expected type: boolean. Example: false")
}).describe("Represents a discrete automation step or flow-control operation executed in sequence. Variable reference MUST use '{$variable_name}' syntax.");

const VariableSchema = z.object({
  type: z.enum(['string', 'number', 'boolean']).describe("The data type of the stored variable. Expected type: string enum. Example: 'string'"),
  value: z.any().describe("The initial value of the variable. Expected type: any. Example: 'John Doe'"),
  autoCreated: z.boolean().optional().default(false).describe("Indicates if the variable was automatically declared by the system. Expected type: boolean. Example: false")
}).describe("Configures task input variables and caller-overridable values. Do not declare output-only fields here; use Set Variable for mid-task runtime state and extractionScript for final outputs.");

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
  mode: z.enum(['scrape', 'agent', 'headful']).describe("Execution mode. Use 'agent' by default, including for scraping, because it supports action blocks. 'scrape' does not support action blocks and is only for exceptional, extremely fast action-free scraping. 'headful' runs in a visible browser window. Expected type: string enum. Example: 'agent'"),
  wait: z.number().default(3).describe("Standard delay in seconds to wait after navigation and page loads. Expected type: number. Example: 5"),
  selector: z.string().optional().describe("Default CSS selector to wait for on the page load before starting actions. Expected type: string. Example: '.main-content'"),
  rotateUserAgents: z.boolean().default(false).describe("Rotate user agents across requests to avoid pattern blocking. Expected type: boolean. Example: true"),
  rotateProxies: z.boolean().default(false).describe("Rotate through configured proxy IPs. Expected type: boolean. Example: false"),
  rotateViewport: z.boolean().default(false).describe("Vary viewport resolutions randomly to simulate multiple devices. Expected type: boolean. Example: true"),
  humanTyping: z.boolean().default(false).describe("Vary typing speeds to simulate organic human typing. Expected type: boolean. Example: true"),
  stealth: StealthConfigSchema.optional().describe("Realistic human behavior configurations. Expected type: object."),
  actions: z.array(ActionSchema).default([]).describe("Sequential list of browser actions/control flow steps to execute. Action blocks require 'agent' or 'headful' mode and are not supported in 'scrape' mode. Expected type: array of action objects."),
  variables: z.record(VariableSchema).default({}).describe("Task INPUT variables and caller-overridable configuration only. Do not declare output-only fields or transient runtime state here. Use Set Variable for mid-task state. Expected type: record object of variable configurations."),
  extractionScript: z.string().optional().describe("Post-execution extraction script for the task's actual final output. Final structured fields, lists, tables, parsing, and extraction logic belong here rather than in task variables or JavaScript action blocks. Expected type: string. Example: 'return Array.from(document.querySelectorAll(\"a\")).map(el => el.href)'"),
  extractionFormat: z.enum(['json', 'csv']).optional().default('json').describe("Target export format of any extracted data. Expected type: string enum. Example: 'json'"),
  includeHtml: z.boolean().optional().default(false).describe("Whether to include the raw page HTML in the execution response. Expected type: boolean. Example: false"),
  includeShadowDom: z.boolean().optional().default(true).describe("Whether to parse and resolve target elements residing in Shadow DOMs. Expected type: boolean. Example: true"),
  disableRecording: z.boolean().optional().default(false).describe("Disable video/VNC recording of this task to save storage. Expected type: boolean. Example: true"),
  statelessExecution: z.boolean().optional().default(false).describe("If set to true, clear browser cookies and session states between runs. Expected type: boolean. Example: false"),
  translation: z.object({
    enabled: z.boolean().describe("Enable rendered-page translation for Agent and headful runs. Expected type: boolean. Example: true"),
    targetLanguage: z.string().describe("translate.js target language name. Expected type: string. Example: 'spanish'")
  }).optional().describe("Optional page translation. It is disabled by default and is not available in Scrape mode."),
  downloadCabinetId: z.string().optional().describe("Cabinet used for intercepted downloads; omitted uses the default Cabinet. Expected type: string. Example: 'cab_basic'"),
  schedule: TaskScheduleSchema.optional().describe("Task automatic execution schedule. Expected type: object.")
}).describe("Reflects the full schema of a Figranium task creation payload.");

const BrowserOpenSchema = z.object({
  url: z.string().optional().describe("Initial URL to navigate to when the browser opens. Expected type: string. Example: 'https://example.com'"),
  mode: z.enum(['headful', 'scrape', 'agent']).optional().default('headful').describe("Informational mode of browser. Expected type: string enum. Example: 'headful'"),
  devTools: z.boolean().optional().default(false).describe("Whether to open DevTools automatically. Expected type: boolean. Example: false")
}).describe("Configuration for launching or reattaching a managed browser session.");

const InspectorHighlightSchema = z.object({
  sessionId: z.string().optional().describe("Active session ID. Expected type: string. Example: 'sess_123'"),
  url: z.string().optional().describe("Optional URL to navigate to. Expected type: string. Example: 'https://example.com'"),
  targetHint: z.string().optional().describe("Optional target hint (e.g., text, selector) to highlight elements. Expected type: string. Example: 'login button'")
}).describe("Configuration for highlighting or inspecting elements on the active session.");

const TaskDeleteSchema = z.object({
  taskId: z.string().describe("The unique ID of the task to delete. Expected type: string. Example: 'task_101'")
}).describe("Configuration for deleting an existing automation task.");

const TaskUpdateSchema = CreateTaskSchema.partial().extend({
  taskId: z.string().describe("The unique ID of the task to update. Expected type: string. Example: 'task_101'")
}).describe("Reflects the schema of a Figranium task update payload.");

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
      description: "Execution mode. Use 'agent' by default, including for scraping, because it supports action blocks. 'scrape' does not support action blocks and is only for exceptional, extremely fast action-free scraping. 'headful' runs in a visible browser window with human oversight. Expected type: string enum. Example: 'agent'"
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
      description: "Sequential list of browser actions/control flow steps to execute. Action blocks require 'agent' or 'headful' mode and are not supported in 'scrape' mode. Note: Variable references MUST use '{$variable_name}' syntax.",
      items: {
        type: "object",
        description: "Represents a discrete automation step or flow-control operation executed in sequence. Variable reference MUST use '{$variable_name}' syntax.",
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
              "start", "http_request", "get_content", "solve_captcha", "wait_captcha",
              "upload", "finalize_uploads", "check", "uncheck", "drag_and_drop", "reload", "select", "do_nothing"
            ],
            description: "The action type to perform. Expected type: string enum. Example: 'click'"
          },
          selector: {
            type: "string",
            description: "CSS selector, XPath, or ARIA locator for the target element. Required for click, type, hover, wait_selector. Expected type: string. Example: '#username'"
          },
          value: {
            type: "string",
            description: "Input value or configuration value for this action. Supports variable templating. MUST use '{$variable_name}' syntax for variable references (e.g., '{$myVar}'). NEVER use '{{variable_name}}' or '${variable_name}'. Expected type: string. Example: 'hello@world.com'"
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
            description: "Runtime variable name used by actions such as Set Variable, merge, or foreach. Set Variable may create or update this runtime variable. Do not use varName as the schema for final task outputs; use extractionScript for final extraction."
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
          clickType: {
            type: "string",
            enum: ["single", "double", "right"],
            default: "single",
            description: "Click interaction mode for 'click': single, double, or right click. Expected type: string enum. Example: 'double'"
          },
          targetSelector: {
            type: "string",
            description: "Destination selector for 'drag_and_drop'. Required with a source 'selector'. Expected type: string. Example: '.done-column'"
          },
          method: {
            type: "string",
            description: "HTTP method for 'http_request' actions. Expected type: string. Example: 'GET'"
          },
          headers: {
            type: "string",
            description: "JSON stringified headers for 'http_request'. Supports variable templating. MUST use '{$variable_name}' syntax for variable references (e.g., '{\"Authorization\": \"Bearer {$token}\"}'). NEVER use '{{variable_name}}' or '${variable_name}'. Expected type: string. Example: '{\"Authorization\": \"Bearer {$token}\"}'"
          },
          body: {
            type: "string",
            description: "Payload body for 'http_request' actions. Supports variable templating. MUST use '{$variable_name}' syntax for variable references (e.g., '{\"query\": \"{$value}\"}'). NEVER use '{{variable_name}}' or '${variable_name}'. Expected type: string. Example: '{\"query\": \"{$value}\"}'"
          },
          captchaType: {
            type: "string",
            enum: ["recaptcha_v2", "recaptcha_v3", "hcaptcha", "turnstile"],
            description: "The CAPTCHA provider to target for 'solve_captcha'/'wait_captcha' actions. Expected type: string enum. Example: 'recaptcha_v2'"
          },
          timeout: {
            type: "number",
            description: "Maximum time in seconds to wait for a CAPTCHA to become ready or solved, for 'solve_captcha'/'wait_captcha' actions. Expected type: number. Example: 30"
          },
          cabinetId: {
            type: "string",
            description: "Source Cabinet ID for an 'upload' action; omitted uses the default Cabinet. Expected type: string. Example: 'cab_basic'"
          },
          markAsUploaded: {
            type: "boolean",
            default: false,
            description: "When true, an 'upload' action marks its Cabinet item uploaded immediately after attaching it. Expected type: boolean. Example: false"
          }
        },
        required: ["type"]
      }
    },
    variables: {
      type: "object",
      description: "Task INPUT variables and caller-overridable configuration only. Do not declare output-only fields or transient runtime state here. Use Set Variable for mid-task state. Expected type: record object of variable configurations.",
      additionalProperties: {
        type: "object",
        description: "Configures task input variables and caller-overridable values. Do not declare output-only fields here; use Set Variable for mid-task runtime state and extractionScript for final outputs.",
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
      description: "Post-execution extraction script for the task's actual final output. Final structured fields, lists, tables, parsing, and extraction logic belong here rather than in task variables or JavaScript action blocks. Expected type: string. Example: 'return Array.from(document.querySelectorAll(\"a\")).map(el => el.href)'"
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
    translation: {
      type: "object",
      description: "Optional page translation for Agent and headful runs. It is disabled by default and is not available in Scrape mode.",
      properties: {
        enabled: { type: "boolean", description: "Enable rendered-page translation. Expected type: boolean. Example: true" },
        targetLanguage: { type: "string", description: "translate.js target language name. Expected type: string. Example: 'spanish'" }
      },
      required: ["enabled", "targetLanguage"]
    },
    downloadCabinetId: {
      type: "string",
      description: "Cabinet used for intercepted downloads; omitted uses the default Cabinet. Expected type: string. Example: 'cab_basic'"
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

const BROWSER_OPEN_JSON_SCHEMA = {
  type: "object",
  properties: {
    url: {
      type: "string",
      description: "Initial URL to navigate to when the browser opens."
    },
    mode: {
      type: "string",
      enum: ["headful", "scrape", "agent"],
      default: "headful",
      description: "Informational mode of browser. Note: only headful is supported via the VNC stack."
    },
    devTools: {
      type: "boolean",
      default: false,
      description: "Open DevTools automatically."
    }
  }
};

const INSPECTOR_HIGHLIGHT_JSON_SCHEMA = {
  type: "object",
  properties: {
    sessionId: {
      type: "string",
      description: "The ID of the browser session to target."
    },
    url: {
      type: "string",
      description: "Optional URL to navigate to."
    },
    targetHint: {
      type: "string",
      description: "Optional text or hint to find and highlight target elements."
    }
  }
};

const TASK_DELETE_JSON_SCHEMA = {
  type: "object",
  properties: {
    taskId: {
      type: "string",
      description: "The unique ID of the task to delete."
    }
  },
  required: ["taskId"]
};

const TASK_UPDATE_JSON_SCHEMA = {
  type: "object",
  description: "Exhaustive task update structure for Figranium automation tasks. NOTE: You MUST use '{$variable_name}' variable referencing syntax, and you MUST automatically test your changes using 'task_execute' right after task update unless prompted not to.",
  properties: {
    taskId: {
      type: "string",
      description: "The unique ID of the task to update."
    },
    ...TASK_JSON_SCHEMA.properties
  },
  required: ["taskId"]
};

const CREATE_TASK_DESCRIPTION = `
Create a complete, fully-configured Figranium automation task including sequential action steps, state variables, anti-bot stealth mechanisms, and optional scheduling.

### !!! IMPORTANT GUIDELINES FOR LLM AGENTS !!!
1. **VARIABLE TEMPLATING SYNTAX**: You MUST use \`{$variable_name}\` (with a single curly brace and dollar sign, e.g. \`{$myVar}\`) for variable references/templating inside action values, URLs, headers, or body fields. NEVER use double curly braces like \`{{variable_name}}\` or JavaScript-style templates like \`\${variable_name}\`, as these syntaxes are unsupported and will cause execution failures.
2. **MANDATORY AUTOMATIC TESTING**: Unless the user explicitly prompts you NOT to test, you MUST immediately test and verify your newly created or updated tasks by calling the \`task_execute\` tool right after calling \`create_task\` or \`task_update\`. Automatic testing is mandatory to ensure correctness.
3. **MODE SELECTION**: Use \`agent\` mode by default, including for scraping tasks. \`scrape\` mode does not support action blocks and should be used only when extremely fast, action-free scraping is required. Use \`headful\` for visible interactive debugging.

### 1. Purpose
Use this tool when you need to automate any recurring or complex web-based workflows, including data extraction (scraping), automated form-filling, dashboard testing, or dynamic visual monitoring. Tasks are stored permanently in Figranium and can be executed ad-hoc, triggered via API, or scheduled.

### 2. Execution Model
Figranium tasks run as a linear sequence of steps defined in the 'actions' array. Actions are processed in order from top to bottom. Control flow steps (such as 'if', 'while', 'repeat') allow loops and branching, while 'on_error' steps define fallback behaviors. Variables represent the state and can be updated dynamically during execution. Ensure all opened block structures (such as 'if', 'while', 'repeat', 'foreach') are closed with an 'end' action step.

### 3. Comprehensive Step Types
- 'navigate': Redirect browser to a new URL specified in the 'value' field.
- 'wait': Pause execution for N seconds specified in the 'value' field.
- 'wait_selector': Pause until the DOM element matching 'selector' is rendered.
- 'click': Simulate a single, double, or right click on the element matching 'selector'; set 'clickType' to 'double' or 'right' when needed.
- 'check' / 'uncheck': Idempotently set the checked state of a checkbox or radio control matching 'selector'.
- 'drag_and_drop': Drag from 'selector' to the required 'targetSelector'.
- 'reload': Reload the current page and wait for DOM content to load.
- 'select': Choose an option from a native select using 'selector' and its option 'value'.
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
- 'solve_captcha': Attempt to automatically solve a detected CAPTCHA challenge.
- 'wait_captcha': Pause until a CAPTCHA challenge is initialized/ready without solving it.
- 'upload': Attach the newest unuploaded file, ZIP, or folder from a Cabinet (see 'cabinetId') to a file input, chooser, or drop target matching 'selector'.
- 'finalize_uploads': Mark all Cabinet items attached during the execution as uploaded.

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
  "variables": {},
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
 * Helper to safely read AGENT_SPEC.md from disk
 */
function readAgentSpec(): string {
  const pathsToTry = [
    path.join(__dirname, "..", "AGENT_SPEC.md"),
    path.join(__dirname, "AGENT_SPEC.md"),
    path.join(process.cwd(), "AGENT_SPEC.md")
  ];
  for (const p of pathsToTry) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf-8");
    }
  }
  throw new Error("AGENT_SPEC.md not found");
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
      },
      {
        uri: "figranium://docs/agent-spec.md",
        name: "Figranium Agent Specification",
        mimeType: "text/markdown",
        description: "Exposes the complete Figranium Agent Specification (AGENT_SPEC.md) containing task schema, action types, variable templating, and control flow guides for AI agents."
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
  if (uri === "figranium://docs/agent-spec.md") {
    try {
      const markdown = readAgentSpec();
      return {
        contents: [
          {
            uri: "figranium://docs/agent-spec.md",
            mimeType: "text/markdown",
            text: markdown
          }
        ]
      };
    } catch (err: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to read AGENT_SPEC.md: ${err.message}`);
    }
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
        name: "task_update",
        description: "Update fields of an existing task on the Figranium server.",
        inputSchema: TASK_UPDATE_JSON_SCHEMA,
      },
      {
        name: "task_delete",
        description: "Permanently delete a Figranium task by taskId.",
        inputSchema: TASK_DELETE_JSON_SCHEMA,
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
        name: "browser_open",
        description: "Launch or reattach a managed headful/interactive browser session.",
        inputSchema: BROWSER_OPEN_JSON_SCHEMA,
      },
      {
        name: "inspector_highlight",
        description: "Activate inspect/highlight mode on an active browser session with optional selector hints.",
        inputSchema: INSPECTOR_HIGHLIGHT_JSON_SCHEMA,
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
      {
        name: "list_cabinets",
        description: "List all Cabinets (durable download queues) configured on the Figranium server, including their IDs, names, and item counts. Use this to find a Cabinet ID to reference in a Task's 'downloadCabinetId' field or an 'upload' action.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "create_cabinet",
        description: "Create a new Cabinet (durable download queue) on the Figranium server.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Descriptive name for the new Cabinet. Expected type: string. Example: 'Invoices'",
            },
          },
          required: ["name"],
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

        const response = await figranium.tasks.save(taskPayload as Task);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "task_update": {
        const parseResult = TaskUpdateSchema.safeParse(args || {});
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

        const { taskId, ...updates } = parseResult.data;

        const response = await figranium.tasks.update(taskId, updates as Partial<Task>);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "task_delete": {
        const parseResult = TaskDeleteSchema.safeParse(args || {});
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

        const { taskId } = parseResult.data;

        const response = await figranium.tasks.delete(taskId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "browser_open": {
        const parseResult = BrowserOpenSchema.safeParse(args || {});
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

        const payload = parseResult.data;

        const response = await figranium.browser.open(payload);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "inspector_highlight": {
        const parseResult = InspectorHighlightSchema.safeParse(args || {});
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

        const payload = parseResult.data;

        const response = await figranium.browser.highlight(payload);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "task_list": {
        const response = await figranium.tasks.listSummaries();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
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

        const response = await figranium.runTask(taskId, {
          variables: variables || {},
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "execution_list": {
        const response = await figranium.executions.list();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "schedule_list": {
        const response = await figranium.schedules.list();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "schedule_get_all_status": {
        const response = await figranium.schedules.overallStatus();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "schedule_get_status": {
        const { taskId } = (args || {}) as { taskId: string };
        if (!taskId) {
          throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        }

        const response = await figranium.schedules.status(taskId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "schedule_delete": {
        const { taskId } = (args || {}) as { taskId: string };
        if (!taskId) {
          throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        }

        const response = await figranium.schedules.delete(taskId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
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

        const response = await figranium.schedules.set(taskId, body as unknown as Schedule);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
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

        const response = await figranium.schedules.describe(taskId, body as unknown as Schedule);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "list_cabinets": {
        const response = await figranium.cabinets.list();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "create_cabinet": {
        const { name: cabinetName } = (args || {}) as { name: string };
        if (!cabinetName) {
          throw new McpError(ErrorCode.InvalidParams, "name is required");
        }
        const response = await figranium.cabinets.create(cabinetName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: any) {
    let errorMessage = error.message || "An unknown error occurred";
    if (error instanceof FigraniumError) {
      const details = error.details === undefined ? "" : `: ${JSON.stringify(error.details)}`;
      errorMessage = `API Error [${error.status}]: ${error.message}${details}`;
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

  return server;
}
