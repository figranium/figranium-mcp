# Figranium for OpenCode

Official OpenCode integration for [Figranium](https://figranium.dev). It adds the local Figranium MCP server over STDIO, a Figranium agent, routing guidance, and a browser automation skill.

## Install

OpenCode supports Git-backed plugins, so the integration can be installed directly from this repository:

```bash
opencode plugin add 'github:figranium/figranium-mcp#main::path:integrations/opencode'
```

Or add it to your OpenCode configuration using the same Git package spec.

## Configure

Set the Figranium instance URL and API key in your environment before starting OpenCode:

```bash
export FIGRANIUM_BASE_URL="http://localhost:11345"
export FIGRANIUM_API_KEY="your-api-key"
```

The plugin starts `figranium-mcp` locally with:

```bash
npx -y figranium-mcp
```

OpenCode communicates with it over MCP STDIO, so no hosted MCP service or OAuth flow is required.

## Optional hosted MCP

Figranium also provides `https://mcp.figranium.dev/mcp` for clients that require a remote MCP server. OpenCode does not need it for the default integration.

## What it adds

- local `figranium` MCP server over STDIO
- `figranium` agent for browser automation requests
- `figranium-browser-automation` skill
- routing guidance for task creation, execution, validation, scheduling, and Cabinets

The Figranium MCP exposes tools for creating and updating tasks, running browser automations, working with executions and schedules, interacting with a live browser, and managing Cabinets.

## Development

This integration is maintained in the same repository as the Figranium MCP server so MCP changes and OpenCode support can evolve together.

OpenCode and Figranium are separate projects. This plugin is maintained by Figranium and is not affiliated with or maintained by the OpenCode team.
