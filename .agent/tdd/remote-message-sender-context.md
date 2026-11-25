# Remote message sender context

## Problem

A remote daemon already receives `originServerId` in the WebSocket hello, but the value only reached
agent creation labels. A later human message from a different local machine did not identify its
sender in the model prompt, and `list_hosts.current` continued to follow the agent creator.

## Behavior matrix

| Case               | Expected behavior                                                                                                                    | Coverage                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Human prompt       | Each human prompt includes client ID, client name, and origin server ID as model-visible context without changing user-visible text. | `prompt-sender-context.test.ts` |
| Missing origin     | The context states that the origin server ID is unavailable instead of falling back to the creator.                                  | `prompt-sender-context.test.ts` |
| Session actor      | The accepted user-message actor carries the current session `originServerId`.                                                        | `session.test.ts`               |
| Latest sender      | The latest accepted actor is exposed by `AgentManager`.                                                                              | `agent-manager.test.ts`         |
| Current host       | `list_hosts.current` follows the latest accepted message sender, not the agent creator.                                              | `mcp-server.test.ts`            |
| Wire compatibility | `originServerId` remains optional in `AgentActor` and legacy actors still parse.                                                     | `messages.wire-compat.test.ts`  |

## Red evidence

- Sender-context helper missing: test suite failed to import `prompt-sender-context.js`.
- Latest actor absent: `TypeError: manager.getLatestActor is not a function`.
- Stale current host: the cross-client test returned `srv_mac` when the latest sender was `srv_windows`.

## Green evidence

- `npx vitest run packages/server/src/server/agent/prompt-sender-context.test.ts --bail=1` -> 3 passed.
- `npx vitest run packages/server/src/server/agent/agent-manager.test.ts --bail=1 -t "records the client actor on submitted prompts"` -> 1 passed.
- `npx vitest run packages/server/src/server/agent/mcp-server.test.ts --bail=1 -t "marks the latest message sender origin as current"` -> 1 passed.
- `npx vitest run packages/server/src/server/session.test.ts --bail=1 -t "current actor carries the session origin"` -> 1 passed.
- `npx vitest run packages/protocol/src/messages.wire-compat.test.ts --bail=1 -t "agent actor origin identity"` -> 1 passed.

## Mutation sensitivity

1. Removed the sender-context attachment from `buildHumanAgentPrompt`.
   - The prompt test failed because the model prompt reverted to plain text.
   - Restored implementation passed.
2. Forced `list_hosts` to ignore the latest actor.
   - The cross-client test failed by marking the Mac creator as current instead of the Windows sender.
   - Restored implementation passed.
