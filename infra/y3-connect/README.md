# Y3 Connect

Y3 Connect is the independently run service for self-hosted connections. It does not depend on
T3 Connect's Clerk tenant or Relay. The environment remains responsible for pairing client devices
and enforcing their permissions; a host binding code enrolls the machine with this service and
cannot be used to sign in as a device.

Y3 Connect is still a developer preview. Desktop setup and the MCP wizard can use a configured
gateway, but host routing is manual and native route switching has not been verified. Do not
deploy it for production access yet.

## Stage behind an existing Caddy

Build and run from a checkout with Docker Compose. Read the desktop host's environment ID from
`/.well-known/t3/environment` on its local server. In `infra/y3-connect/.env`, set a map of
public HTTPS origins to those IDs (one DNS name per environment):

```dotenv
Y3_CONNECT_ROUTES='{"https://code.example.com":"your-environment-id"}'
```

Point each DNS name at Caddy, then start the gateway from this directory:

```sh
docker compose up -d --build
```

For Caddy running on the same Linux host (on the host itself or in a host-networked
container), add the following site. The gateway's port is published only on loopback; do
not open it in the firewall.

```caddy
code.example.com {
    reverse_proxy 127.0.0.1:17890
}
```

Validate and reload Caddy, then check `https://code.example.com/v1/y3-connect` for
`{"service":"y3-connect","version":1}`. Generate a code and enter it into Y3 Connect on the
desktop host along with that same origin:

```sh
docker compose exec -T gateway node infra/y3-connect/src/main.ts binding-code
```

The named volume stores host bindings. Keep it across restarts and upgrades; deleting it
invalidates every binding. To revoke a host, run the same command with
`revoke-host <environment-id>` in place of `binding-code`.

When the host also allows LAN connections, pair the phone through the gateway QR first.
On a trusted LAN, use **Add route** on the saved mobile environment to scan the separate
LAN QR. The phone then prefers LAN when reachable and reconnects through the gateway when it
leaves the network. The gateway credential is not copied to an HTTP LAN route.

## Local development

From this directory, with workspace dependencies installed:

```sh
export Y3_CONNECT_DB=/path/to/test-data/y3-connect.sqlite
node src/main.ts serve
```

In another shell with the same `Y3_CONNECT_DB`, run `node src/main.ts binding-code` to issue a
single-use enrollment code. Treat it as a secret. The local API listens on `127.0.0.1:17890` by
default and identifies itself at `GET /v1/y3-connect`.

For a forwarding test, set `Y3_CONNECT_ROUTES` to a JSON map from HTTPS origins to environment IDs
before starting the gateway. Each routed environment needs its own hostname. Use a loopback HTTP
origin only for local development.

Read the test environment's ID from `/.well-known/t3/environment` on its loopback listener. Use
that ID in the route map. On the desktop host, open **Settings → Sharing & access → Y3 Connect**
and enter the HTTPS origin from the map and a fresh binding code. Once the route is verified, use
**Show pairing QR code** to create a separate, one-time device credential. Turning off Y3 Connect
stops forwarding but does not revoke the paired devices or discard the saved host binding.

To test the standalone connector instead:

1. Generate a one-time binding code on the gateway and a random 32-byte hex token on the host.
   POST `{ "environmentId": "...", "bindingCode": "...", "hostToken": "..." }` to
   `/v1/y3-connect/hosts/bind`. Keep the token on the host and out of logs.
2. On the host, supply the token through `Y3_CONNECT_HOST_TOKEN` and run
   `node src/main.ts connect --server <gateway-origin> --local-port <environment-port>`.
   Stop the connector to close the route, including established WebSocket connections.

Terminate public TLS in the reverse proxy, preserve the request's Host, and forward to the
gateway's private listener. The same HTTPS port handles connector and client traffic. The proxy
and gateway are trusted with the traffic they forward, including authorization headers.

### MCP

On the desktop host, choose **Use in another app (MCP)** after enabling Y3 Connect. The wizard uses
`https://<environment-origin>/mcp`. OAuth registration, discovery, and authorization are still
handled by the environment. Approve on its own page using its existing session or the approval
code supplied by the wizard, not the gateway host binding code.
