# Local admin console

The daemon supervisor starts a separate `paseo-admin` sidecar after the worker
is ready. The console is a standalone browser application; it does not render
the mobile or daemon web UI.

## Address and key

The sidecar uses port `6769` when the daemon uses its default port. Other daemon
ports use the first available port starting two above the daemon port. Override
the address with `PASEO_ADMIN_LISTEN`.

```bash
paseo admin url
paseo admin key
```

`admin key` creates `$PASEO_HOME/admin-key` with mode `0600` on first use. The
first-install default is `123456`; change it from **设置 → 管理密钥**. Resetting
the key signs out every browser session. The key is exchanged for an HttpOnly,
SameSite=Strict browser session and is never stored by the page. A random key
can still be generated from the CLI:

```bash
paseo admin rotate-key
```

The default key is intentionally convenient for local setup, not secure for a
machine other users can access. Replace it before exposing the console beyond
the current user's loopback session.

## Settings

**设置 → 常用 daemon 配置** exposes listening, access, Relay, MCP, browser tools
and log settings. Saving writes `$PASEO_HOME/config.json`, then asks the daemon
to reload. The result distinguishes hot-reloaded fields from changes that
require a full daemon restart. The console never restarts the daemon
automatically, so active agent work is not interrupted. If hot reload fails,
the saved config remains on disk and **重新应用** retries only the reload. Git
and worktree settings remain available in the advanced JSON editor.

**设置 → 高级配置** shows the complete non-sensitive JSON configuration.
Passwords, API keys, tokens, secrets, credentials, provider environment blocks
and request headers are omitted. Saving preserves their existing values.

New homes default both `app.baseUrl` and `daemon.cors.allowedOrigins` to
`https://paseo-app-8wq.pages.dev`.

New homes also enable the official Relay by default:

```json
{
  "daemon": {
    "relay": {
      "enabled": true,
      "endpoint": "relay.paseo.sh:443",
      "publicEndpoint": "relay-next.paseo.sh:443",
      "useTls": true,
      "publicUseTls": true
    }
  }
}
```

The daemon connects through the public relay endpoint. Pairing offers advertise
the resolvable `relay-next.paseo.sh` alias so existing mobile clients do not
rewrite it to the retired Fly hostname.

## Login startup

Autostart is scoped to the current user:

```bash
paseo daemon autostart enable
paseo daemon autostart status
paseo daemon autostart disable
```

Linux writes a user systemd unit. It starts when that user's systemd manager
starts. Windows writes a command to the current user's Startup folder.

The first successful `paseo daemon start` enables autostart. Explicit
`paseo daemon autostart disable` records the opt-out, so later daemon starts do
not turn it back on. Set `PASEO_AUTOSTART_DISABLED=1` to suppress automatic
installation. Existing startup configuration still applies.

The packaged Windows desktop app also installs the bundled CLI in the
current-user Startup folder by default. Its settings page shows the toggle.
Signing in starts the built-in daemon without opening the client window.

The desktop daemon status includes the sidecar URL. Open the local daemon
section in desktop settings and use **Open console** rather than looking up the
port manually.

## Team attribution

The role name is the `--name` value supplied to `paseo daemon pair`. The client
embeds it in the pairing offer and sends it with every prompt. Team views group
questions by that name and use `createdBy` for current session ownership.

Transferring an owner updates `createdBy` and appends an event to
`$PASEO_HOME/admin/ownership-audit.jsonl`. Historical question attribution does
not change.

## Token usage

Each completed attributed turn is appended to
`$PASEO_HOME/agent-usage/{agentId}.json` with input, cached-input and output
tokens plus available provider cost. Data starts when this version begins
recording turns; historical turns are not reconstructed.
