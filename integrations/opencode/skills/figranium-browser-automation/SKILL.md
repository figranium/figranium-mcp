---
name: figranium-browser-automation
description: Build, run, validate, and schedule browser automations with Figranium. Use for rendered websites, repeatable browser workflows, extraction, downloads, forms, and tasks that need real browser interaction.
---

# Figranium browser automation

Use the Figranium MCP tools to turn browser work into reusable tasks.

## Workflow

1. Check whether an existing task already matches the user's goal.
2. For repeatable work, create or update a task instead of relying on a one-off sequence.
3. When finding selectors, call `folate_resolve` on page HTML (e.g. from `includeHtml: true` or `get_content`) or use natural-language `folate:` selectors instead of guessing CSS/XPath selectors.
4. Execute the task and inspect the actual returned result to validate selectors, configuration, and extracted output.
5. Correct and rerun when output is empty, malformed, duplicated, irrelevant, or unexpectedly null.
6. Add a schedule only when recurring execution is requested.
7. Use Cabinets when the workflow needs persistent downloaded/generated files.

Do not claim an automation works until a real execution result supports that conclusion.
