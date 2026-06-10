import type { Address } from '@solana/kit';

/** Deployed Subscriptions program (mainnet + devnet). */
export const SUBSCRIPTIONS_PROGRAM_ID =
  'De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44' as Address;

/** SPL Token program. */
export const TOKEN_PROGRAM_ID =
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address;

/** Circle devnet USDC mint (plain SPL, no problematic Token-2022 extensions). */
export const DEVNET_USDC_MINT =
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' as Address;

export const DEFAULT_RPC_URL =
  process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

/** 6-decimal token helpers. */
export const TOKEN_DECIMALS = 6;
export const ONE_TOKEN = 1_000_000n;

export const ONE_HOUR_SECONDS = 3600;
export const ONE_DAY_SECONDS = 86400;
