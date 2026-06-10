import {
  fetchSubscriptionDelegation,
  findPlanPda,
  findSubscriptionDelegationPda,
} from '@solana/subscriptions';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { generateKeyPairSigner } from '@solana/kit';
import { createSubscriptionsClient } from '../src/client.js';
import {
  airdropSol,
  createFundedKeypair,
  createTestMintWithBalance,
  ensureAta,
  mintTokensTo,
  getTokenBalance,
  logAddress,
  logStep,
  logSuccess,
  logTokens,
  ONE_TOKEN,
} from '../src/helpers.js';

/**
 * Example 4: Subscription Plan
 *
 * A merchant publishes billing terms on-chain. Subscribers accept those terms,
 * and the merchant (or whitelisted pullers) collects payment each billing period.
 *
 * Flow: merchant creates plan → subscriber init SA + subscribe → merchant collects
 */
async function main() {
  console.log('Solana Subscriptions — Subscription Plan');
  console.log('=========================================');

  const merchant = await generateKeyPairSigner();
  const merchantClient = await createSubscriptionsClient(merchant);
  await airdropSol(merchantClient, merchant.address, 2);

  logStep(1, 'Create a shared token mint for billing');
  const { mint } = await createTestMintWithBalance(
    merchantClient,
    merchant,
    merchant.address,
    0n,
  );
  logAddress('Merchant', merchant.address);
  logAddress('Billing token mint', mint);

  logStep(2, 'Merchant publishes a $5/day subscription plan');
  const planId = 1n;
  const planAmount = 5n * ONE_TOKEN;
  const periodHours = 24n;

  const [planPda] = await findPlanPda({
    owner: merchant.address,
    planId,
  });

  await merchantClient.subscriptions.instructions
    .createPlan({
      owner: merchant,
      planId,
      mint,
      amount: planAmount,
      periodHours,
      endTs: 0n,
      destinations: [],
      pullers: [],
      metadataUri: 'https://example.com/plans/pro-tier.json',
    })
    .sendTransaction();

  logAddress('Plan PDA', planPda);
  logTokens('Price per period', planAmount);
  logSuccess('Plan published — subscribers can accept these immutable terms');

  logStep(3, 'Subscriber sets up and subscribes');
  const subscriber = await createFundedKeypair(merchantClient, 2);
  const subscriberClient = await createSubscriptionsClient(subscriber);

  const subscriberAta = await mintTokensTo(
    merchantClient,
    merchant,
    mint,
    subscriber.address,
    50n * ONE_TOKEN,
  );

  await subscriberClient.subscriptions.instructions
    .initSubscriptionAuthority({
      owner: subscriber,
      tokenMint: mint,
      userAta: subscriberAta,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    .sendTransaction();

  const [subscriptionPda] = await findSubscriptionDelegationPda({
    planPda,
    subscriber: subscriber.address,
  });

  await subscriberClient.subscriptions.instructions
    .subscribe({
      subscriber,
      merchant: merchant.address,
      planId,
      tokenMint: mint,
    })
    .sendTransaction();

  logAddress('Subscriber', subscriber.address);
  logAddress('Subscription PDA', subscriptionPda);
  logSuccess('Subscriber accepted plan terms');

  logStep(4, 'Merchant collects the first billing period');
  const merchantAta = await ensureAta(merchantClient, merchant, merchant.address, mint);
  const pullAmount = 5n * ONE_TOKEN;

  await merchantClient.subscriptions.instructions
    .transferSubscription({
      caller: merchant,
      delegator: subscriber.address,
      tokenMint: mint,
      subscriptionPda,
      planPda,
      amount: pullAmount,
      receiverAta: merchantAta,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    .sendTransaction();

  const merchantBalance = await getTokenBalance(merchantClient, merchantAta);
  logTokens('Merchant collected', merchantBalance);

  const subAfterPull = (await fetchSubscriptionDelegation(
    merchantClient.rpc,
    subscriptionPda,
  )).data;
  logTokens('Pulled this period', subAfterPull.amountPulledInPeriod);
  logSuccess('Collection succeeded — merchant signed, subscriber did not');

  logStep(5, 'Subscriber cancels (grace period until end of billing period)');
  await subscriberClient.subscriptions.instructions
    .cancelSubscription({
      subscriber,
      planPda,
      subscriptionPda,
    })
    .sendTransaction();
  logSuccess('Subscription cancelled — no further collections after grace period');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
