# send_file_to_agent TDD evidence

## Behavior matrix

| Case              | Expected behavior                                                                                                                               | Coverage                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Same-host handoff | Target agent receives the absolute path, file metadata, and requested action; caller receives finish notification.                              | `mcp-server.test.ts` / `send_file_to_agent MCP tool`                                     |
| Remote handoff    | Source bytes stream to the destination upload store and the target receives an `uploaded_file` attachment with path, name, MIME type, and size. | `mcp-server.test.ts` / `streams a file to a remote agent as an uploaded-file attachment` |
| Caller identity   | Remote prompt carries `sourceAgentId` and `sourceAgentServerId`.                                                                                | Remote handoff test                                                                      |
| Completion        | Remote wait is started and emits a `finished` notification even when the target is not the caller’s child agent.                                | Remote handoff test                                                                      |
| Seekable source   | Workspace files expose random-access chunks and file metadata without buffering the whole file.                                                 | `service.test.ts` / `opens a workspace file as a seekable upload source`                 |
| Path scope        | Source reads use the existing workspace scoped file opener. Existing outside-workspace tests remain green.                                      | `service.test.ts`                                                                        |
| Agent manifest    | Provider agent manifests advertise `send_file_to_agent` before a caller ID exists.                                                              | `opencode/bridge.test.ts`                                                                |
| Size boundary     | Remote transfer rejects files above the existing 100 MiB upload limit before upload.                                                            | Production guard using `MAX_FILE_UPLOAD_BYTES`                                           |

## Red evidence

- Source adapter missing: `TypeError: openExplorerFileReadSource is not a function`.
- Tool missing: `Error: MCP tool not registered: send_file_to_agent`.
- Remote path not implemented: `PaseoToolInputError: File transfer to another host is not available...`.
- Non-child target notification: removing parent labels left the notification list empty until the file handoff wait opt-out was added.
- Static agent manifest missing: the manifest assertion failed until registration switched from caller presence to agent scope.

## Green evidence

- `npx vitest run packages/server/src/server/file-explorer/service.test.ts --bail=1` -> 33 passed.
- `npx vitest run packages/server/src/server/agent/mcp-server.test.ts --bail=1 -t "send_file_to_agent"` -> 2 passed.
- `npx vitest run packages/server/src/server/agent/mcp-server.test.ts --bail=1 -t "send_file_to_agent|send_agent_prompt"` -> 35 passed.
- `npx vitest run packages/server/src/server/agent/providers/opencode/bridge.test.ts --bail=1 -t "advertises agent-scoped schemas"` -> 1 passed.
- `npx vitest run packages/protocol/src/paseo-tool-presentation/index.test.ts --bail=1` -> 29 passed.
- `npm run typecheck` -> passed after rebuilding stale protocol/client declarations with `npm run build:client`.
- `npm run lint -- <changed TypeScript files>` -> 0 warnings, 0 errors.
- `npm run format:files -- <changed files>` -> passed.

## Mutation sensitivity

1. Changed the upload source read offset from `offset` to `0`.
   - Result: seekable source test failed with the wrong bytes.
   - Restored: targeted test passed.
2. Removed `attachments: [upload.file]` from the remote agent prompt.
   - Result: remote handoff test failed because the expected `uploaded_file` attachment was absent.
   - Restored: targeted test passed.
