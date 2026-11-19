# Archify generator agent trace TDD evidence

## Behavior matrix

| Case                                 | Expected behavior                                                                                                                         | Coverage                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Active worker                        | Each drawing diagram exposes its own internal generator agent id, and the start response contains the ids once workers exist.             | `generation.test.ts`                        |
| Multiple workers                     | Each diagram row resolves to its own worker instead of the task's first worker.                                                           | `generation.test.ts`                        |
| Completed / failed / canceled worker | The worker id remains on the diagram, so the trace entry does not disappear after the run ends.                                           | `generation.test.ts`, `model.test.ts`       |
| Open trace                           | Clicking the row action opens the worker in the normal Agent pane and streams its transcript.                                             | `archify-agent-trace.spec.ts`               |
| Internal worker lifecycle            | Workers are internal agents, stay out of discovery/persistence, remain addressable by id, and are archived only when the next run starts. | `generation.test.ts`                        |
| Old daemon                           | The optional diagram field and capability are absent; protocol parsing still succeeds and the action stays hidden.                        | `messages.archify.test.ts`, `model.test.ts` |
| Empty identifier                     | Missing, null, or whitespace-only worker ids do not produce an action.                                                                    | `model.test.ts`                             |
| Feature advertisement                | A current daemon advertises `archifyAgentTrace`.                                                                                          | `websocket-server.relay-reconnect.test.ts`  |

## Red evidence

- `npx vitest run src/messages.archify.test.ts --bail=1` failed because the old schema stripped `generatorAgentId` from the task.
- `npx vitest run src/server/archify/generation.test.ts --bail=1` failed with `[null, null]` instead of per-diagram worker ids.
- The start-response assertion failed because `start()` returned before workers received their ids.
- The server-info test failed with `archifyAgentTrace: undefined`.
- `npx vitest run src/archify/model.test.ts --bail=1` failed with `resolveArchifyGeneratorAgentId is not a function`.

## Green evidence

- `npx vitest run src/messages.archify.test.ts --bail=1` -> 4 passed.
- `npx vitest run src/server/archify/generation.test.ts --bail=1` -> 8 passed.
- `npx vitest run src/server/websocket-server.relay-reconnect.test.ts -t "advertises current features in initial server_info" --bail=1` -> 1 passed.
- `npx vitest run src/archify/model.test.ts src/i18n/resources.test.ts src/i18n/locales.test.ts --bail=1` -> 66 passed.
- `npx playwright test e2e/browser/archify-agent-trace.spec.ts --project=browser` -> 1 passed. The test starts a real Archify run against the test daemon, clicks `View thinking`, opens the worker as a normal agent tab, and sees the mock provider's streamed transcript.
- `npm run typecheck` -> passed for `packages/protocol`, `packages/server`, and `packages/app`.
- Targeted `npm run lint -- <changed files>` -> 0 warnings, 0 errors.

## Mutation sensitivity

- Removed the `supported` guard from `resolveArchifyGeneratorAgentId`.
  - `model.test.ts` failed with `expected 'agent_worker' to be null`.
  - Restored the guard and the test passed.
- Replaced the per-diagram `generatorAgentId = agentId` assignment with `null`.
  - `generation.test.ts` failed with `[null, null]`.
  - Restored the assignment and the test passed.
- Removed `await record.workersStarted.promise` from `start()`.
  - `generation.test.ts` failed because the start snapshot still had `[null, null]`.
  - Restored the wait and the test passed.

## Limitations

- The browser test uses the deterministic mock provider to verify the normal Agent tab and streamed transcript. It does not wait for a real provider to render an Archify artifact.
- Completion persistence is covered by server tests that assert worker ids survive terminal diagram states, plus the app resolver test across drawing/delivered/failed/canceled states.
- The repository-wide 95%/90% coverage gate was not run because the repository instructions explicitly forbid running the full test suite locally. Targeted tests, typechecks, lint, and the focused browser test were run instead.
