/**
 * MCP tools that let agents drive a browser through Frowse via Figranium's
 * /api/frowse routes. Frowse returns compact DOM summaries and resolves
 * natural-language element descriptions locally with Folate.
 */

type Prop = { type: string; description: string; enum?: string[]; items?: { type: string } };

interface FrowseToolSpec {
  name: string;
  action: string;
  title: string;
  description: string;
  readOnly?: boolean;
  props?: Record<string, Prop>;
  required?: string[];
  /** Fixed args merged into the command (e.g. {prop: "text"}). */
  fixed?: Record<string, unknown>;
}

const SESSION: Prop = {
  type: "string",
  description: "Frowse session name ([A-Za-z0-9_-], max 64). Each session is an isolated, persistent browser. Defaults to 'default'.",
};
const SELECTOR = (extra = ""): Prop => ({
  type: "string",
  description: `Natural-language element description (resolved locally by Folate, e.g. 'Sign in button'), CSS selector, XPath, or an '@eN' ref from frowse_snapshot with refs=true.${extra}`,
});

export const FROWSE_ACTIONS = [
  "open", "back", "forward", "reload", "close", "snapshot", "query", "read", "click", "dblclick", "fill",
  "type", "press", "keyboard", "hover", "focus", "select", "check", "uncheck", "scroll", "scrollintoview",
  "drag", "upload", "get", "is", "find", "wait", "screenshot", "pdf", "eval", "tab", "frame", "cookies",
  "storage", "dialog", "console", "errors", "highlight",
] as const;

const SPECS: FrowseToolSpec[] = [
  {
    name: "frowse_open", action: "open", title: "Frowse: Open URL",
    description: "Navigate the Frowse browser session to a URL (starts the session if needed). Private/internal addresses are blocked.",
    props: { url: { type: "string", description: "URL to open (https:// is assumed when omitted)." }, wait_until: { type: "string", enum: ["load", "domcontentloaded", "networkidle", "commit"], description: "Navigation readiness event (default 'domcontentloaded')." } },
    required: ["url"],
  },
  {
    name: "frowse_snapshot", action: "snapshot", title: "Frowse: Page Summary", readOnly: true,
    description: "Return a compact (~100-300 token) semantic summary of the current page, grouped by landmark with repeated items collapsed. Use it to decide what to click or fill, then describe the element in plain language. Pass refs=true for legacy '@eN' element refs.",
    props: {
      section: { type: "string", description: "Limit the summary to one landmark (dialog, header, nav, form, main, aside, footer)." },
      max_chars: { type: "number", description: "Maximum summary length in characters (default 2200)." },
      refs: { type: "boolean", description: "Return '@eN' refs for every interactive element instead of the compact summary." },
      interactive: { type: "boolean", description: "With refs=true, only list interactive elements (default true)." },
    },
  },
  {
    name: "frowse_query", action: "query", title: "Frowse: Query Folate", readOnly: true,
    description: "Rank live-DOM elements for a natural-language prompt without acting, returning CSS/XPath selectors and scores. Use to disambiguate before clicking.",
    props: { prompt: { type: "string", description: "Description of the target element, e.g. 'Sign in link in header'." }, top_k: { type: "number", description: "Number of matches to return (default 3)." } },
    required: ["prompt"],
  },
  {
    name: "frowse_read", action: "read", title: "Frowse: Read Page Text", readOnly: true,
    description: "Return the visible text of the current page, or of a URL (opens it first).",
    props: { url: { type: "string", description: "Optional URL to open and read." } },
  },
  {
    name: "frowse_click", action: "click", title: "Frowse: Click",
    description: "Click an element described in natural language, CSS, XPath, or by '@eN' ref.",
    props: {
      selector: SELECTOR(),
      button: { type: "string", enum: ["left", "right", "middle"], description: "Mouse button (default left)." },
      modifiers: { type: "array", items: { type: "string" }, description: "Modifier keys, e.g. ['Shift']." },
      new_tab: { type: "boolean", description: "Expect the click to open a new tab and switch to it." },
    },
    required: ["selector"],
  },
  {
    name: "frowse_fill", action: "fill", title: "Frowse: Fill Input",
    description: "Clear an input and set its value.",
    props: { selector: SELECTOR(), text: { type: "string", description: "Text to enter." } },
    required: ["selector", "text"],
  },
  {
    name: "frowse_type", action: "type", title: "Frowse: Type Text",
    description: "Type text key by key into an element (use for inputs that react to key events).",
    props: { selector: SELECTOR(), text: { type: "string", description: "Text to type." }, clear: { type: "boolean", description: "Clear the field first." }, delay: { type: "number", description: "Delay between keystrokes in ms." } },
    required: ["selector", "text"],
  },
  {
    name: "frowse_press", action: "press", title: "Frowse: Press Key",
    description: "Press a keyboard key or chord on the page, e.g. 'Enter', 'Control+A'.",
    props: { key: { type: "string", description: "Key or chord to press." } },
    required: ["key"],
  },
  {
    name: "frowse_select", action: "select", title: "Frowse: Select Option",
    description: "Choose an option in a dropdown by value or visible label.",
    props: { selector: SELECTOR(), value: { type: "string", description: "Option value or label." } },
    required: ["selector", "value"],
  },
  {
    name: "frowse_hover", action: "hover", title: "Frowse: Hover",
    description: "Hover over an element.",
    props: { selector: SELECTOR() },
    required: ["selector"],
  },
  {
    name: "frowse_check", action: "check", title: "Frowse: Check Box",
    description: "Check a checkbox or radio button. Use frowse_command with action 'uncheck' to clear it.",
    props: { selector: SELECTOR() },
    required: ["selector"],
  },
  {
    name: "frowse_scroll", action: "scroll", title: "Frowse: Scroll",
    description: "Scroll the page (or a specific element) in a direction.",
    props: { direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Scroll direction (default down)." }, px: { type: "number", description: "Pixels to scroll (default 500)." }, selector: SELECTOR(" Optional: scroll this element instead of the page.") },
  },
  {
    name: "frowse_get", action: "get", title: "Frowse: Get Property", readOnly: true,
    description: "Read a property of the page or an element: text, html, value, attr, title, url, count, box, or styles. title and url need no selector.",
    props: {
      prop: { type: "string", enum: ["text", "html", "value", "attr", "title", "url", "count", "box", "styles"], description: "Property to read." },
      selector: SELECTOR(" Not needed for title/url."),
      attr: { type: "string", description: "Attribute name when prop='attr'." },
    },
    required: ["prop"],
  },
  {
    name: "frowse_wait", action: "wait", title: "Frowse: Wait", readOnly: true,
    description: "Wait for an element, a duration, text, a URL, a load state, or a JavaScript predicate. Provide exactly one of selector, ms, text, url, load, or fn.",
    props: {
      selector: SELECTOR(), ms: { type: "number", description: "Milliseconds to wait." },
      text: { type: "string", description: "Visible text to wait for." }, url: { type: "string", description: "URL (or glob) to wait for." },
      load: { type: "string", enum: ["load", "domcontentloaded", "networkidle"], description: "Load state to wait for." },
      fn: { type: "string", description: "JavaScript expression that must become truthy." },
      state: { type: "string", enum: ["visible", "hidden", "attached", "detached"], description: "Element state when waiting on selector (default visible)." },
    },
  },
  {
    name: "frowse_screenshot", action: "screenshot", title: "Frowse: Screenshot", readOnly: true,
    description: "Capture a PNG screenshot of the current page and return it as an image. Prefer frowse_snapshot for routine decisions; use this only when visual confirmation is needed.",
    props: { full: { type: "boolean", description: "Capture the full scrollable page." } },
  },
  {
    name: "frowse_tab", action: "tab", title: "Frowse: Manage Tabs",
    description: "List, open, close or switch browser tabs. subcommand: 'list' (default), 'new', 'close', or 'switch'.",
    props: {
      subcommand: { type: "string", enum: ["list", "new", "close", "switch"], description: "Tab operation." },
      url: { type: "string", description: "URL for 'new'." }, label: { type: "string", description: "Label for 'new'." },
      target: { type: "string", description: "Tab id or label for 'close' / 'switch'." },
    },
  },
];

export const FROWSE_TOOL_NAMES = new Set<string>([
  ...SPECS.map((s) => s.name), "frowse_status", "frowse_command", "frowse_sessions", "frowse_close",
]);

export function isFrowseTool(name: string): boolean {
  return FROWSE_TOOL_NAMES.has(name);
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function getFrowseToolDefinitions() {
  const sessionProp = { session: SESSION };
  const tools: any[] = SPECS.map((spec) => ({
    name: spec.name,
    annotations: spec.readOnly
      ? { title: spec.title, ...READ_ONLY, openWorldHint: true }
      : { title: spec.title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    description: spec.description,
    inputSchema: { type: "object", properties: { ...sessionProp, ...(spec.props || {}) }, required: spec.required || [] },
  }));

  tools.push(
    {
      name: "frowse_command",
      annotations: { title: "Frowse: Run Any Command", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      description: `Run any Frowse action not covered by the dedicated tools. Actions: ${FROWSE_ACTIONS.join(", ")}. Common extras: back/forward/reload, dblclick, focus, uncheck, scrollintoview, drag {source,target}, find {by,value,find_action}, is {prop: visible|enabled|checked, selector}, eval {js}, frame {selector|'main'}, cookies {op: get|set|clear}, storage {kind: local|session, op}, dialog {op: accept|dismiss}, console, errors, pdf, upload {selector, files}.`,
      inputSchema: {
        type: "object",
        properties: {
          ...sessionProp,
          action: { type: "string", enum: [...FROWSE_ACTIONS], description: "Frowse action to run." },
          args: { type: "object", description: "Action arguments (see the Frowse CLI docs), e.g. {selector: 'Search box', text: 'folate'}." },
          options: {
            type: "object",
            description: "Browser options applied only when the session is first created.",
            properties: { timeoutMs: { type: "number", description: "Default action timeout (1000-120000)." }, viewport: { type: "string", description: "e.g. '1280x800'." }, userAgent: { type: "string", description: "Custom user agent." } },
          },
        },
        required: ["action"],
      },
    },
    {
      name: "frowse_status",
      annotations: { title: "Frowse Status", ...READ_ONLY },
      description: "Check whether Frowse (compact-DOM browser sessions with Folate grounding) is available on the Figranium server (GET /api/frowse/status).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "frowse_sessions",
      annotations: { title: "List Frowse Sessions", ...READ_ONLY },
      description: "List active Frowse browser sessions on the Figranium server (GET /api/frowse/sessions).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "frowse_close",
      annotations: { title: "Close Frowse Session", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      description: "Close a Frowse browser session and free its resources. Always close sessions when finished. With all=true closes every session.",
      inputSchema: { type: "object", properties: { ...sessionProp, all: { type: "boolean", description: "Close all sessions." } } },
    },
  );
  return tools;
}

type ApiRequest = (endpoint: string, method?: string, body?: unknown, timeoutMs?: number) => Promise<any>;

const COMMAND_TIMEOUT_MS = 120_000;
const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;

function text(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

export async function callFrowseTool(name: string, rawArgs: Record<string, any> | undefined, apiRequest: ApiRequest) {
  const args = { ...(rawArgs || {}) };

  if (name === "frowse_status") return text(await apiRequest("/api/frowse/status", "GET", undefined, 30_000));
  if (name === "frowse_sessions") return text(await apiRequest("/api/frowse/sessions", "GET", undefined, 15_000));

  if (name === "frowse_close" && args.all === true) {
    return text(await apiRequest("/api/frowse/sessions", "DELETE", undefined, 60_000));
  }

  const session = args.session === undefined ? "default" : String(args.session);
  if (!SESSION_RE.test(session)) return fail("session must match [A-Za-z0-9_-] and be at most 64 characters.");
  delete args.session;
  const sessionPath = `/api/frowse/sessions/${encodeURIComponent(session)}`;

  if (name === "frowse_close") return text(await apiRequest(sessionPath, "DELETE", undefined, 60_000));

  let action: string;
  let cmdArgs: Record<string, unknown>;
  let options: unknown;

  if (name === "frowse_command") {
    action = typeof args.action === "string" ? args.action : "";
    if (!(FROWSE_ACTIONS as readonly string[]).includes(action)) return fail(`Unknown Frowse action '${action}'. Valid actions: ${FROWSE_ACTIONS.join(", ")}.`);
    cmdArgs = args.args && typeof args.args === "object" && !Array.isArray(args.args) ? args.args : {};
    options = args.options;
  } else {
    const spec = SPECS.find((s) => s.name === name);
    if (!spec) return fail(`Unknown Frowse tool: ${name}`);
    for (const key of spec.required || []) {
      if (args[key] === undefined || args[key] === null || args[key] === "") return fail(`${key} is required for ${name}.`);
    }
    action = spec.action;
    cmdArgs = { ...args, ...(spec.fixed || {}) };
  }

  const response = await apiRequest(
    `${sessionPath}/commands`,
    "POST",
    { action, args: cmdArgs, ...(options ? { options } : {}) },
    COMMAND_TIMEOUT_MS,
  );

  const result = response?.result;
  if (action === "screenshot" && result?.mimeType === "image/png" && typeof result.data === "string") {
    return { content: [{ type: "image", data: result.data, mimeType: "image/png" }, { type: "text", text: JSON.stringify({ session, bytes: result.bytes }) }] };
  }
  if (action === "pdf" && result?.data) {
    return text({ session, mimeType: result.mimeType, bytes: result.bytes, base64: result.data });
  }
  // Compact output keeps agent context small, which is the point of Frowse.
  if (action === "snapshot" && typeof result?.summary === "string" && !result.refs) {
    const header = [result.title, result.url].filter(Boolean).join(" | ");
    return { content: [{ type: "text", text: header ? `${header}\n${result.summary}` : result.summary }] };
  }
  return { content: [{ type: "text", text: JSON.stringify(result ?? response) }] };
}
