# Archify generator tab pruning fix

## Behavior matrix

| Case                             | Expected behavior                                                                                                            | Coverage                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Timeline hydration               | An internal Archify worker returned by a timeline response is stored in `agentDetails`, never in the active agent directory. | `agent-replica.test.ts`       |
| Directory update after hydration | A later directory snapshot does not remove the internal worker detail or make the tab unpinnable.                            | `agent-replica.test.ts`       |
| Visibility projection            | Internal worker details do not contribute to `activeAgentIds`, so the explicit pin remains in force.                         | `agent-replica.test.ts`       |
| Direct agent fetch               | A fetched internal agent with project placement still goes to `agentDetails`, not the active directory.                      | `agent-snapshots.test.ts`     |
| Snapshot round-trip              | The private `internal` marker survives normalize/project boundaries.                                                         | `agent-snapshots.test.ts`     |
| Completed generation             | The opened worker tab remains visible after the Archify task finishes.                                                       | `archify-agent-trace.spec.ts` |

## Red evidence

- `npx vitest run src/runtime/directory-sync/agent-replica.test.ts --bail=1` failed because the internal timeline agent was present in `session.agents`.
- The reported browser behavior was the matching symptom: the tab opened, its timeline hydrated, then layout reconciliation removed it.

## Green evidence

- `npx vitest run src/runtime/directory-sync/agent-replica.test.ts src/utils/agent-snapshots.test.ts --bail=1` -> 20 passed.
- `npx playwright test e2e/browser/archify-agent-trace.spec.ts --project=browser` -> 1 passed. The regression test waits for the generation task to finish and reasserts that the Agent tab is still visible.
- `npm run typecheck` for `packages/app` -> passed.
- Targeted lint and format checks -> passed.

## Mutation sensitivity

- Disabled the internal-agent branch in `AgentDirectoryReplica.submitTimelineAgent`.
  - `agent-replica.test.ts` failed because `session.agents` contained the internal worker.
  - Restored the branch and the test passed.
- Removed the `internal` check from `shouldStoreFetchedAgentInActiveDirectory`.
  - `agent-snapshots.test.ts` failed because an internal fetched agent was admitted to the active directory.
  - Restored the check and the test passed.

## Notes

- The E2E run required a temporary local test-only client role name because the current baseline enforces workspace ownership roles for CLI seed clients. That temporary harness change was reverted and is not part of this fix.
