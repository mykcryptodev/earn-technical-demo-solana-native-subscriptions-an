import {
  fetchRecurringDelegation,
  findFixedDelegationPda,
  findSubscriptionAuthorityPda,
} from '@solana/subscriptions';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { generateKeyPairSigner } from '@solana/kit';
import { createSubscriptionsClient } from '../src/client.js';
import {
  airdropSol,
  createFundedKeypair,
  createTestMintWithBalance,
  ensureAta,
  getTokenBalance,
  getValidatorTime,
  logAddress,
  logStep,
  logSuccess,
  logTokens,
  ONE_DAY_SECONDS,
  ONE_TOKEN,
} from '../src/helpers.js';

/**
 * Example 3: Recurring Delegation
 *
 * A recurring delegation resets a per-period spending cap on a schedule.
 * Ideal for payroll, contractor payments, and periodic allowances.
 *
 * Flow: init SA → create recurring delegation → delegatee pulls within period → revoke
 */
async function main() {
  console.log('Solana Subscriptions — Recurring Delegation');
  console.log('============================================');

  const user = await generateKeyPairSigner();
  const client = await createSubscriptionsClient(user);
  await airdropSol(client, user.address, 2);

  logStep(1, 'Set up employer token account');
  const { mint, recipientAta: userAta } = await createTestMintWithBalance(
    client,
    user,
    user.address,
    100n * ONE_TOKEN,
  );
  logAddress('Employer', user.address);
  logAddress('Token mint', mint);

  logStep(2, 'Initialize Subscription Authority');
  await client.subscriptions.instructions
    .initSubscriptionAuthority({
      owner: user,
      tokenMint: mint,
      userAta,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    .sendTransaction();
  logSuccess('Subscription Authority initialized');

  const [subscriptionAuthorityPda] = await findSubscriptionAuthorityPda({
    user: user.address,
    tokenMint: mint,
  });

  logStep(3, 'Create a recurring delegation for a contractor');
  const contractor = await createFundedKeypair(client, 1);
  const amountPerPeriod = 5n * ONE_TOKEN;
  const periodLengthS = BigInt(ONE_DAY_SECONDS);
  const currentTs = await getValidatorTime(client);
  const startTs = currentTs;
  const expiryTs = currentTs + BigInt(ONE_DAY_SECONDS * 30);

  await client.subscriptions.instructions
    .createRecurringDelegation({
      delegator: user,
      tokenMint: mint,
      delegatee: contractor.address,
      nonce: 0n,
      amountPerPeriod,
      periodLengthS,
      startTs,
      expiryTs,
    })
    .sendTransaction();

  const [delegationPda] = await findFixedDelegationPda({
    subscriptionAuthority: subscriptionAuthorityPda,
    delegator: user.address,
    delegatee: contractor.address,
    nonce: 0n,
  });

  const delegation = await fetchRecurringDelegation(client.rpc, delegationPda);
  logAddress('Contractor (delegatee)', contractor.address);
  logAddress('Delegation PDA', delegationPda);
  logTokens('Cap per period', delegation.data.amountPerPeriod);
  logSuccess('Recurring delegation created — contractor can pull up to 5 tokens/day');

  logStep(4, 'Contractor pulls 2 tokens for this period');
  const contractorClient = await createSubscriptionsClient(contractor);
  const contractorAta = await ensureAta(
    contractorClient,
    contractor,
    contractor.address,
    mint,
  );
  const pullAmount = 2n * ONE_TOKEN;

  await contractorClient.subscriptions.instructions
    .transferRecurring({
      delegatee: contractor,
      delegator: user.address,
      delegatorAta: userAta,
      tokenMint: mint,
      delegationPda,
      amount: pullAmount,
      receiverAta: contractorAta,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    .sendTransaction();

  const contractorBalance = await getTokenBalance(client, contractorAta);
  logTokens('Contractor received', contractorBalance);

  const delegationAfter = await fetchRecurringDelegation(client.rpc, delegationPda);
  logTokens('Pulled this period', delegationAfter.data.amountPulledInPeriod);
  logSuccess('Period-limited pull succeeded — cap resets when the period rolls over');

  logStep(5, 'Employer revokes the recurring delegation');
  await client.subscriptions.instructions
    .revokeDelegation({
      authority: user,
      delegationAccount: delegationPda,
    })
    .sendTransaction();
  logSuccess('Recurring delegation revoked');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
