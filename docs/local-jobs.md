# Local jobs

Local jobs let a remote agent run a command in a workspace owned by another connected daemon. The
remote agent remains the orchestrator. The target daemon executes the command through its terminal
manager and returns a bounded snapshot.

## Agent flow

The remote agent discovers daemons with `list_hosts`, then calls `inspect_local_runtime` with the
target `serverId`. The response lists the target platform, workspace IDs, and the `local.jobs`
capability.

Use `start_local_job` with one of those workspace IDs. It runs asynchronously and returns a `jobId`.
The agent can then:

- `wait_local_job` for up to 60 seconds and receive the final snapshot, or the still-running snapshot
  when the wait expires.
- `get_local_job` for a one-shot status and output-tail read.
- `cancel_local_job` to stop the process and wait for it to exit.

These tools are host-aware. Omitting `serverId` targets the current daemon; passing it routes the
same request through the existing connected-host channel.

## Result contract

Each snapshot includes the target workspace, command, status, exit code, signal, bounded output tail,
and an error message. Statuses are `running`, `succeeded`, `failed`, and `canceled`. Output is kept
to the last 200 display lines so command logs cannot grow a tool result without bound.

The remote agent receives snapshots as structured tool content. User interfaces can read the same
snapshots through `local.jobs` on `PaseoApi`.

## Lifecycle limits

Jobs are daemon-memory state. A daemon restart loses the job records and in-flight processes. The
service retains at most 100 jobs and evicts completed records first.

The current feature gates remote access on `server_info.features.localJobs`. Commands require
`workspace.write`, while inspection, status, and waiting require `workspace.read`. A command can run
anything the daemon user can run, so callers should only enable these tools for agents trusted with
that workspace's terminal authority.
