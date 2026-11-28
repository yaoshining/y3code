import type { EnvironmentCloudLinkStateResult } from "@t3tools/contracts";
import type { RelayManagedEndpointProviderKind } from "@t3tools/contracts/relay";

// Require managed discovery: stale tunnel config after a publish-only switch causes endpoint_provider_not_managed.
export function isManagedTunnelActive(
  linkState: EnvironmentCloudLinkStateResult,
  relayProviderKind: RelayManagedEndpointProviderKind | undefined,
) {
  const localManagedTunnel = linkState.managedTunnelActive ?? linkState.linked;
  return (
    linkState.linkRevoked !== true &&
    localManagedTunnel &&
    (relayProviderKind === undefined || relayProviderKind === "cloudflare_tunnel")
  );
}

/**
 * Whether reaching `desired` links or relinks the environment, which needs `relay:configure`.
 * Unlinking and preference changes on the current link only need `relay:write`.
 */
export function cloudChangeReplacesLink(
  linkState: EnvironmentCloudLinkStateResult,
  relayProviderKind: RelayManagedEndpointProviderKind | undefined,
  desired: { readonly managedTunnel: boolean; readonly publish: boolean },
) {
  return (
    (desired.managedTunnel || desired.publish) &&
    (!linkState.linked ||
      linkState.linkRevoked === true ||
      isManagedTunnelActive(linkState, relayProviderKind) !== desired.managedTunnel)
  );
}
