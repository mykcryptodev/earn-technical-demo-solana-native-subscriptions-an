import {
  fetchMaybeSubscriptionAuthority,
  findSubscriptionAuthorityPda,
} from '@solana/subscriptions';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { generateKeyPairSigner } from '@solana/kit';
import { createSubscriptionsClient } from '../src/client.js';
import {
  airdropSol,
  createTestMintWithBalance,
  logAddress,
  logStep,
  logSuccess,
  ONE_TOKEN,
} from '../src/helpers.js';
import { SUBSCRIPTIONS_PROGRAM_ID } from '../src/config.js';

/**
 * Example 1: Initialize a Subscription Authority (SA)
 *
 * Before creating any delegation or subscription, the token owner must
 * initialize a Subscription Authority PDA for their (user, mint) pair.
 * This approves the SA as the single SPL delegate with u64::MAX allowance.
 */
async function main() {
  console.log('Solana Subscriptions — Initialize Subscription Authority');
  console.log('==========================================================');
  logAddress('Program ID', SUBSCRIPTIONS_PROGRAM_ID);

  const user = await generateKeyPairSigner();
  const client = await createSubscriptionsClient(user);

  logStep(1, 'Fund the user wallet');
  await airdropSol(client, user.address, 2);
  logAddress('User', user.address);
  logSuccess('Airdropped 2 SOL on devnet');

  logStep(
    2,
    'Create a test token mint and fund the user',
    'We use a fresh SPL mint so the example is self-contained on devnet.',
  );
  const { mint, recipientAta } = await createTestMintWithBalance(
    client,
    user,
    user.address,
    100n * ONE_TOKEN,
  );
  logAddress('Token mint', mint);
  logAddress('User ATA', recipientAta);
  logSuccess('Minted 100 test tokens to the user');

  logStep(
    3,
    'Initialize the Subscription Authority',
    'The user signs once to approve the SA PDA as their token delegate.',
  );
  const [subscriptionAuthorityPda] = await findSubscriptionAuthorityPda({
    user: user.address,
    tokenMint: mint,
  });
  logAddress('Subscription Authority PDA', subscriptionAuthorityPda);

  const existing = await fetchMaybeSubscriptionAuthority(
    client.rpc,
    subscriptionAuthorityPda,
  );

  if (existing.exists) {
    logSuccess('Subscription Authority already initialized');
  } else {
    const sig = await client.subscriptions.instructions
      .initSubscriptionAuthority({
        owner: user,
        tokenMint: mint,
        userAta: recipientAta,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      })
      .sendTransaction();
    logSuccess(`Initialized Subscription Authority (tx: ${sig})`);
  }

  logStep(4, 'Verify on-chain state');
  const sa = await fetchMaybeSubscriptionAuthority(client.rpc, subscriptionAuthorityPda);
  if (!sa.exists) {
    throw new Error('Subscription Authority was not created');
  }
  logSuccess('Subscription Authority is live — ready for delegations');
  console.log('\nNext: run `npm run example:fixed` to create a fixed allowance.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
