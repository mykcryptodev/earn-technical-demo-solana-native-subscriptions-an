import {
  createClient,
  type Address,
  type KeyPairSigner,
  type TransactionSigner,
} from '@solana/kit';
import { solanaLocalRpc } from '@solana/kit-plugin-rpc';
import { signer } from '@solana/kit-plugin-signer';
import { tokenProgram } from '@solana-program/token';
import { subscriptionsProgram } from '@solana/subscriptions';
import { DEFAULT_RPC_URL } from './config.js';

export type SubscriptionsClient = Awaited<ReturnType<typeof createSubscriptionsClient>>;

/**
 * Create a Solana Kit client with the Subscriptions program plugin installed.
 *
 * The plugin derives PDAs, fills default accounts, and exposes instruction
 * builders under `client.subscriptions.instructions`.
 */
export async function createSubscriptionsClient(
  walletSigner: TransactionSigner,
  rpcUrl: string = DEFAULT_RPC_URL,
) {
  return createClient()
    .use(signer(walletSigner))
    .use(solanaLocalRpc({ rpcUrl }))
    .use(tokenProgram())
    .use(subscriptionsProgram());
}

/** Wrap an address as a TransactionSigner for instruction params that require it. */
export function addressAsSigner(address: Address): TransactionSigner {
  return {
    address,
    signTransactions: async () => {
      throw new Error(`Address ${address} cannot sign transactions`);
    },
  };
}

/** Use a keypair signer where the SDK accepts TransactionSigner. */
export function keypairAsSigner(keypair: KeyPairSigner): TransactionSigner {
  return keypair;
}
