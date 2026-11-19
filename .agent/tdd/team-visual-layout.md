# Team visual layout TDD evidence

## Behavior matrix

| Case                   | Expected behavior                                                                                          | Coverage                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Admin team colors      | Use the myAgents team accent and categorical palette, not the old green-heavy defaults.                    | `team-accent.test.ts`, `admin-server.test.ts`        |
| Client team colors     | Team charts, date controls, member selection, and heatmap use the same myAgents blue family.               | `team-accent.test.ts`, `team-style.spec.ts`          |
| Mobile member controls | Long member/role labels wrap in a multi-row grid instead of forcing a single horizontal row.               | `team-style.spec.ts` mobile viewport, responsive CSS |
| Mobile heatmap         | Admin and client compact heatmaps wrap hour groups into multiple rows instead of overflowing horizontally. | responsive CSS assertions and compact heatmap layout |

## Red evidence

- Changing the first categorical palette entry to green caused `team-accent.test.ts` to fail against the myAgents palette.

## Green evidence

- `npx vitest run packages/app/src/screens/team-accent.test.ts --bail=1` -> 1 passed.
- `npx vitest run packages/app/src/screens/team-accent.test.ts packages/app/src/screens/team-screen-model.test.ts packages/server/src/server/admin/admin-server.test.ts --bail=1` -> 12 passed.
- `npx playwright test e2e/browser/team-style.spec.ts --project=browser` -> 2 passed.
- `npm run typecheck`, `npm run lint`, and `npm run format:check` -> passed.

## Mutation sensitivity

- Restored the first palette entry to green, ran `team-accent.test.ts`, and observed the expected palette assertion failure.
- Restored the myAgents blue entry and observed the test turn green.
