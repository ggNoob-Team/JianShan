# Connected hosts

A saved host belongs to the daemon that stores it. The app's saved connections remain a separate list.
Connect A to B through `paseo --host A host` or `paseo.hosts`. Consumers select B by its learned `serverId`; management uses the stable
`registrationId` created before B is reachable.

## Ownership and authority

Credentials live in A's `hosts.json`, written atomically with mode `0600` on POSIX systems. Discovery returns a safe
target description. Replacement inputs never come back through a read API. Keep this file private
when collecting diagnostics or backing up daemon state.

Each registration belongs to the client source that created it. A normal source is the admitted
principal plus the client's stable `clientId`, so two clients sharing one daemon stay isolated even
when they use the same principal. A different client cannot discover, mutate, or open another
source's host, even when it knows the `serverId` or `registrationId`. Trusted daemon tooling and
server plugins retain cross-source administration; ordinary clients do not gain it from
`access.manage`.

The authenticated producer owns its source key. Repeating an unchanged add returns the saved entry,
including a user's disabled state. Changed input requires an explicit update. Display labels and
access can be changed by users with `tunnel.manage`; connection and metadata changes require the
producer or `access.manage`. Removing a producer-managed entry allows that producer to add it again.
Disabling retains the opt-out.

Each enabled registration owns one physical daemon link, shared by status monitoring and every
routed API scope. Each scope owns an isolated virtual session on B. A derives its identity from the
admitted origin session, producer, and logical SDK scope. B admits virtual sessions under the actual
physical link principal, then intersects forwarded caller grants with that link's current authority.
Changing or resuming a parent's grants closes its existing channels; reconnect re-admits demand with
current authority. A routed API cannot select a second hop, and saving a host grants no reverse access.

## Local host sharing

The desktop client reports its local daemon's `serverId` as `originServerId` when connecting to a
remote host. Host directories expose that daemon as `current`, even before it has a reverse
registration.

Sharing is opt-in per remote host. The first enable action confirms that the remote may execute work
on the local machine. The client then registers the local daemon with a relay pairing offer, using
the local `serverId` as the stable `sourceKey`. Later reconnects update that registration
automatically. Disabling sharing removes the automatic registration before clearing the local
opt-in.

Multiple local daemons remain distinct registrations. `current` identifies the daemon associated
with the active client origin; `registrationId` identifies its reverse execution link. An agent
must select a concrete host when the current origin has no enabled registration.

Each human prompt carries the current client ID, client name, and `originServerId` as model-visible
sender context. `list_hosts.current` follows the latest accepted human message, not the agent creator,
so one remote agent can be used from different local machines without losing the sender identity.

A producer that registers a host through a routed API is qualified on B as
`route:<B principal>:<A serverId>:<A producer>`, with each component percent-encoded. For an ordinary
A client, `<A producer>` is its principal-plus-client source. This namespace belongs to the
authenticated link principal. An ordinary direct B consumer does not become that producer by
supplying a source key. The optional `server_info.sourceId` reports this producer identity separately
from the authenticated admission principal.
Trusted server plugins retain the authority of their runtime; they are not sandboxed by this feature.

## Delegating agents

Agent MCP discovers destination IDs with `list_hosts`. `create_workspace`, `list_workspaces`,
`create_agent`, `send_agent_prompt`, `send_file_to_agent`, `get_agent_status`,
`get_agent_activity`, and `list_agents` accept `serverId`; omission selects the calling daemon.
Remote creation requires a destination workspace and explicit provider/model. Caller filesystem
defaults apply only on the calling daemon. Prompting a remote child acknowledges acceptance and uses
the existing idle wait for finish notifications. Remote agent lists have no caller-directory default;
pass `cwd` to filter them.

`send_file_to_agent` streams a file from the caller's workspace to the destination daemon's upload
store, then sends the target agent a prompt with an `uploaded_file` attachment. The attachment gives
the target agent the destination path, name, MIME type, and size, so it can copy the file to a
desktop, server root, or another requested location with its own tools. Files are capped by the
existing 100 MiB upload limit. A same-host handoff sends the source path directly without uploading.
The caller receives the existing idle-wait notification when the target finishes; unlike a remote
prompt limited to a child, the file handoff can notify for any reachable target agent. The transfer
does not grant reverse host access; the destination still needs its own saved registration for a
later reverse transfer.

The parent’s Subagents track shows qualified children across connected hosts. Opening a child uses
the ordinary conversation on the destination's session. The runtime selects among that host's
connection candidates, including direct connections and routes discovered through another daemon.
Adding a direct connection to a discovered host adds another candidate. If no candidate connects,
the destination workspace keeps its existing disconnected or reconnecting behavior.

Finish notifications name the destination server and child agent. The caller's daemon owns durable
subscription intent and restores observation through the same routed wait and permission observation
used during ordinary operation. Restarting the caller's daemon does not imply that a remote child
stopped. Three failed remote observation attempts end the subscription with a notification that the
child could not be observed and its status is unknown. This does not prove the host is offline: remote
RPC failures also prevent observation. Attempts use capped backoff; a connection still
in progress does not spend that budget. A confirmed removed registration reports host unavailability
immediately through the same path. Neither notice claims the child finished. Intent remains stored
until the parent accepts dispatch, then is consumed; reconnecting does not restore that watch. The
parent decides whether to inspect the child or delegate again.

A definitely unsent prompt returns a tool error and creates no notification. An ambiguous prompt
response retains intent because the destination may have admitted it; observation then follows the
same retry policy. A confirmed missing child reports unavailability.

Remote creation and local subscription persistence are separate commits. A failed local write reports
failure even if the destination already created the child; inspect it before retrying creation.
See [finish notification lifetime](agent-lifecycle.md#relationships) for registration, acknowledgment,
and duplicate-delivery semantics. Concurrent prompts gain no turn attribution.

## Connections and recovery

The shared Node connector owns the target grammar and each connection attempt, including a fresh
SSH process. SSH reaches an already running daemon. The shared client connection lifecycle owns
physical reconnect and keepalive; the registry retains configuration, identity acceptance, and recovery
status. Unreachable registrations remain saved. Identity is pinned when discovered. Self and duplicate
registrations remain inspectable; a changed destination requires explicit identity replacement.

Both daemons advertise `connectedHosts`; the shared link additionally requires `hostMultiplexing`.
A completes capability and pinned-identity checks on each physical recovery before admitting channels. There is no local fallback. An older daemon continues to serve existing local
operations; requesting this feature gives update guidance. The registry retries an older destination
with capped backoff, so it comes online once updated. Self, duplicate, changed-identity, and
authentication failures stay in `error` until an update changes the connection, `enabled`, or
`replaceIdentity`, or A restarts.

Disposing a routed API releases its observations and session. It does not remove the saved host or
affect sibling API scopes. Disposing the origin cascades to its derived scopes. Observations restore
through the usual owned-subscription contract. The ordinary client queues new requests while connecting
within its existing deadline and rejects requests while disconnected. Connection loss clears old
waiters and queued sends. Submitted requests with no response fail with `DaemonConnectionError`
(`DAEMON_CONNECTION_LOST`), optional `outcome: "unknown"` and known `serverId`. Inspect the destination
before retrying a mutation.
Ordinary non-recoverable mutations are not automatically replayed. Existing acknowledged/idempotent
creation recovery retains its request identity and resumes through the ordinary creation lifecycle. Multiplexing changes only the transport: ordinary permission
RPC codes pass through unchanged, and connection/recovery behavior matches direct clients.

Text session envelopes carry a channel identifier. Binary routing adds an opcode, a bounded UTF-8
channel identifier, and the original terminal or file-transfer bytes. It never converts those bytes to
base64 JSON. The existing direct binary opcodes and 100 MiB message limit remain unchanged; routed
payloads reserve space for the routing header inside that limit. Relay encryption retains its own
existing frame limit.

Host links cap saved registrations, simultaneous channels, handshake lifetime, frames, physical
output, and aggregate queued bytes. Capacity checks use the actual escaped outer JSON or binary
frame size. Awaitable output completes when the physical send completes. An overflowing channel
closes without closing siblings or the saved link. Routed sessions release resources on disconnect;
subscription demand is rebuilt by its owning client on reconnect.

`clientName` is display and audit metadata bound to the stable `clientId`; it is not an
authorization credential. A resumed session keeps the name it already has when a hello omits
`clientName`. Workspace ownership is captured when the workspace is created; later renames do not
change it. An unnamed client cannot create a workspace or agent, except that CLI/MCP may create a
`dream/...` workspace, which is attributed to the virtual role **筑梦**. Every other unnamed create
returns **请联系管理员分配角色**. Host profiles created before `clientName` was stored backfill it
from cached agent creator metadata; do not treat the fallback as a user-selected name.

See the [SDK reference](../public-docs/sdk/reference.md#clienthosts),
[CLI reference](../public-docs/cli.md#connected-hosts), and
[plugin reference](../public-docs/plugins/reference.md#connected-hosts).
