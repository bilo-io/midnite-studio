import type { OutboundSecret } from '@midnite/studio-shared';

/**
 * The vault's secret values for outbound redaction (Phase 121 Theme D). Configured once at boot, when the vault
 * exists; until then there is nothing to match literally and the shape patterns still run. Chats and councils
 * take {@link outboundSecrets} as a port, so neither imports the vault.
 */
let source: (() => Promise<readonly OutboundSecret[]>) | null = null;

export function configureOutboundSecrets(next: (() => Promise<readonly OutboundSecret[]>) | null): void {
  source = next;
}

export async function outboundSecrets(): Promise<readonly OutboundSecret[]> {
  return source ? source() : [];
}
