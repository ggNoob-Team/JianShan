# Team host state TDD evidence

## Behavior matrix

| Case                  | Expected behavior                                                                                | Coverage                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Supported online host | The embedded team page loads and renders member tabs.                                            | `team-style.spec.ts` / admin sidebar entry                               |
| Connecting host       | The page distinguishes a pending connection from an offline host.                                | `team-screen-model.test.ts` / host classification                        |
| Online old host       | The page says the host needs an update instead of claiming no host is connected.                 | `team-host-state.spec.ts` / unsupported team daemon                      |
| Request failure       | The page surfaces the host-specific failure instead of dropping `Promise.allSettled` rejections. | `team-screen-model.test.ts` / failure formatter                          |
| Feature advertisement | Current daemons advertise `server_info.features.teamInsights`; the test daemon can omit it.      | `websocket-server.relay-reconnect.test.ts`, `outdated-daemon-process.ts` |

## Red evidence

- `classifyTeamHosts` was absent, so the host classification test failed with `TypeError: classifyTeamHosts is not a function`.
- `formatTeamHostLoadFailure` was absent, so the failure test failed with `TypeError: formatTeamHostLoadFailure is not a function`.
- The server-info feature assertion failed before the daemon advertised `teamInsights`.

## Green evidence

- `npx vitest run packages/app/src/screens/team-screen-model.test.ts --bail=1` -> 10 passed.
- `npx vitest run packages/server/src/server/websocket-server.relay-reconnect.test.ts -t "advertises current features in initial server_info" --bail=1` -> 1 passed.
- `npx playwright test e2e/browser/team-host-state.spec.ts e2e/browser/team-style.spec.ts --project=browser` -> 3 passed.
- `npm run typecheck`, `npm run lint`, and `npm run format:check` -> passed.

## Mutation sensitivity

- Removed the `teamInsights` feature advertisement from the server info path.
  - Result: the feature assertion failed.
  - Restored: the targeted server-info test passed.
