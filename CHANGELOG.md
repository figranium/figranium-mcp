# Changelog

## [Unreleased]

### Added

- Added Frowse browser-session tools backed by Figranium's new `/api/frowse` routes so agents can drive a browser end to end: `frowse_status`, `frowse_open`, `frowse_snapshot`, `frowse_query`, `frowse_read`, `frowse_click`, `frowse_fill`, `frowse_type`, `frowse_press`, `frowse_select`, `frowse_hover`, `frowse_check`, `frowse_scroll`, `frowse_get`, `frowse_wait`, `frowse_screenshot`, `frowse_tab`, `frowse_sessions`, `frowse_close`, and the catch-all `frowse_command` (every Frowse action).
- MCP instructions describe the open, snapshot, act, verify, close loop. Frowse tools are not exposed on Figranium Cloud API keys.

## [1.6.0] - 2026-11-16

### Added

- Added `folate_resolve` (`POST /api/folate/resolve`) and `folate_status` (`GET /api/folate/status`) MCP tools for neural DOM selector resolution.
- Updated MCP instructions, task schemas, `AGENT_SPEC.md`, and OpenCode integration to use Folate when finding selectors.

### Changed

- Removed `headful` browser mode from MCP task schemas, tool descriptions, and Cloud guards.

### Fixed

- Reject partial action/variable updates that could silently erase stored workflows. Updates to either field must include both complete values.
- Clarify MCP update semantics and compound-field replacement behavior.

## [1.5.0] - 2026-10-09

- Added optional cookieStateId to Task creation and update schemas for reusable v0.21 browser states.
- Maintained compatibility with the published JavaScript SDK v0.5.x until newer SDK packages are available.
- Removed interactive browser session and inspector tools; MCP remains focused on task execution and automation orchestration.
- Does not expose authentication, credentials, settings, API-key administration, or cookie-state administration endpoints.


## [1.4.0] - 2026-10-03

### Added

- v0.20 template search and full-template retrieval MCP tools.
- Updated MCP server protocol version.
