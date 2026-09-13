# Figranium for OpenCode

Official OpenCode integration for [Figranium](https://figranium.dev). It adds the hosted Figranium MCP server, a Figranium agent, routing guidance, and a browser automation skill.

## Install

OpenCode supports Git-backed plugins, so the integration can be installed directly from this repository:

```bash
opencode plugin add 'github:figranium/figranium-mcp#main::path:integrations/opencode'
```

Or add it to your OpenCode configuration using the same Git package spec.

## Authenticate

The plugin configures the hosted MCP endpoint automatically:

`https://mcp.figranium.dev/mcp`

Authenticate with:

```bash
opencode mcp auth figranium
```

The OAuth page asks for your publicly reachable self-hosted Figranium instance URL and API key. OpenCode receives OAuth tokens; the underlying Figranium API key is not exposed to OpenCode.

## What it adds

- `figranium` remote MCP server
- `figranium` agent for browser automation requests
- `figranium-browser-automation` skill
- routing guidance for task creation, execution, validation, scheduling, and Cabinets

The Figranium MCP exposes tools for creating and updating tasks, running browser automations, working with executions and schedules, interacting with a live browser, and managing Cabinets.

## Development

This integration is maintained in the same repository as the Figranium MCP server so MCP changes and OpenCode support can evolve together.

OpenCode and Figranium are separate projects. This plugin is maintained by Figranium and is not affiliated with or maintained by the OpenCode team.
