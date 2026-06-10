import {
  fetchFixedDelegation,
  fetchRecurringDelegation,
  fetchSubscriptionDelegation,
  findFixedDelegationPda,
  findPlanPda,
  findSubscriptionAuthorityPda,
  findSubscriptionDelegationPda,
} from '@solana/subscriptions';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { generateKeyPairSigner } from '@solana/kit';
import { createSubscriptionsClient } from '../src/client.js';
import {
  airdropSol,
  createFundedKeypair,
  createTestMintWithBalance,
  getValidatorTime,
  logAddress,
  logStep,
  logSuccess,
  logTokens,
  ONE_DAY_SECONDS,
  ONE_HOUR_SECONDS,
  ONE_TOKEN,
} from '../src/helpers.js';

/**
 * Example 5: Multiple Simultaneous Delegations
 *
 * Demonstrates the core value proposition: one token account can power
 * unlimited concurrent spending arrangements — a fixed allowance for an AI
 * agent, a recurring payroll delegation, and a merchant subscription — all
 * at the same time, without overwriting each other.
 */
async function main() {
  console.log('Solana Subscriptions — Multi-Delegation Demo');
  console.log('==============================================');
  console.log(
    'This example shows why Subscriptions & Allowances exist:\n' +
      'SPL Token allows only ONE delegate per account. The Subscription\n' +
      'Authority multiplexes many policy-controlled delegations behind a\n' +
      'single PDA delegate.\n',
  );

  const user = await generateKeyPairSigner();
  const client = await createSubscriptionsClient(user);
  await airdropSol(client, user.address, 3);

  logStep(1, 'Fund user with 200 test tokens');
  const { mint, recipientAta: userAta } = await createTestMintWithBalance(
    client,
    user,
    user.address,
    200n * ONE_TOKEN,
  );
  logAddress('User wallet', user.address);
  logAddress('Token mint', mint);

  logStep(2, 'Initialize one Subscription Authority for this mint');
  await client.subscriptions.instructions
    .initSubscriptionAuthority({
      owner: user,
      tokenMint: mint,
      userAta,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    .sendTransaction();

  const [subscriptionAuthorityPda] = await findSubscriptionAuthorityPda({
    user: user.address,
    tokenMint: mint,
  });
  logSuccess('Single SA approved as the only SPL delegate');

  const currentTs = await getValidatorTime(client);

  logStep(3, 'Delegation A — Fixed allowance for AI agent (10 token cap)');
  const agent = await createFundedKeypair(client, 1);
  await client.subscriptions.instructions
    .createFixedDelegation({
      delegator: user,
      tokenMint: mint,
      delegatee: agent.address,
      nonce: 0n,
      amount: 10n * ONE_TOKEN,
      expiryTs: currentTs + BigInt(ONE_HOUR_SECONDS),
    })
    .sendTransaction();
  logAddress('AI agent', agent.address);
  logSuccess('Fixed delegation #1 active');

  logStep(4, 'Delegation B — Recurring payroll for contractor (5 tokens/day)');
  const contractor = await createFundedKeypair(client, 1);
  await client.subscriptions.instructions
    .createRecurringDelegation({
      delegator: user,
      tokenMint: mint,
      delegatee: contractor.address,
      nonce: 1n,
      amountPerPeriod: 5n * ONE_TOKEN,
      periodLengthS: BigInt(ONE_DAY_SECONDS),
      startTs: currentTs,
      expiryTs: currentTs + BigInt(ONE_DAY_SECONDS * 30),
    })
    .sendTransaction();
  logAddress('Contractor', contractor.address);
  logSuccess('Recurring delegation #2 active (different nonce)');

  logStep(5, 'Delegation C — Merchant subscription plan');
  const merchant = await createFundedKeypair(client, 1);
  const merchantClient = await createSubscriptionsClient(merchant);
  const planId = 42n;
  const [planPda] = await findPlanPda({ owner: merchant.address, planId });

  await merchantClient.subscriptions.instructions
    .createPlan({
      owner: merchant,
      planId,
      mint,
      amount: 3n * ONE_TOKEN,
      periodHours: 24n,
      endTs: 0n,
      destinations: [],
      pullers: [],
      metadataUri: 'https://example.com/plans/newsletter.json',
    })
    .sendTransaction();

  const [subscriptionPda] = await findSubscriptionDelegationPda({
    planPda,
    subscriber: user.address,
  });

  await client.subscriptions.instructions
    .subscribe({
      subscriber: user,
      merchant: merchant.address,
      planId,
      tokenMint: mint,
    })
    .sendTransaction();
  logAddress('Newsletter merchant', merchant.address);
  logSuccess('Subscription plan delegation #3 active');

  logStep(6, 'Verify all three delegations coexist');
  const [fixedPda] = await findFixedDelegationPda({
    subscriptionAuthority: subscriptionAuthorityPda,
    delegator: user.address,
    delegatee: agent.address,
    nonce: 0n,
  });
  const [recurringPda] = await findFixedDelegationPda({
    subscriptionAuthority: subscriptionAuthorityPda,
    delegator: user.address,
    delegatee: contractor.address,
    nonce: 1n,
  });

  const fixed = await fetchFixedDelegation(client.rpc, fixedPda);
  const recurring = await fetchRecurringDelegation(client.rpc, recurringPda);
  const subscription = await fetchSubscriptionDelegation(client.rpc, subscriptionPda);

  logTokens('Fixed allowance remaining', fixed.data.amount);
  logTokens('Recurring cap per period', recurring.data.amountPerPeriod);
  logTokens('Subscription price per period', subscription.data.terms.amount);
  logSuccess(
    'All three delegations are live on the same token account simultaneously',
  );

  console.log('\nKey takeaway: without Subscriptions, approving any one of these');
  console.log('would overwrite the others. With SA + delegation PDAs, they coexist.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
