import {
  fetchFixedDelegation,
  fetchMaybeSubscriptionAuthority,
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
  ONE_HOUR_SECONDS,
  ONE_TOKEN,
} from '../src/helpers.js';

/**
 * Example 2: Fixed Delegation (Allowance)
 *
 * A fixed delegation lets a delegatee pull tokens up to a total cap.
 * Ideal for AI agent budgets, one-time spending caps, and card-linked programs.
 *
 * Flow: init SA → create fixed delegation → delegatee pulls → revoke
 */
async function main() {
  console.log('Solana Subscriptions — Fixed Delegation (Allowance)');
  console.log('====================================================');

  const user = await generateKeyPairSigner();
  const client = await createSubscriptionsClient(user);
  await airdropSol(client, user.address, 2);

  logStep(1, 'Set up user token account');
  const { mint, recipientAta: userAta } = await createTestMintWithBalance(
    client,
    user,
    user.address,
    50n * ONE_TOKEN,
  );
  logAddress('User', user.address);
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

  logStep(3, 'Create a fixed delegation for an AI agent');
  const agent = await createFundedKeypair(client, 1);
  const allowanceAmount = 10n * ONE_TOKEN;
  const currentTs = await getValidatorTime(client);
  const expiryTs = currentTs + BigInt(ONE_HOUR_SECONDS);

  await client.subscriptions.instructions
    .createFixedDelegation({
      delegator: user,
      tokenMint: mint,
      delegatee: agent.address,
      nonce: 0n,
      amount: allowanceAmount,
      expiryTs,
    })
    .sendTransaction();

  const [delegationPda] = await findFixedDelegationPda({
    subscriptionAuthority: subscriptionAuthorityPda,
    delegator: user.address,
    delegatee: agent.address,
    nonce: 0n,
  });

  const delegation = await fetchFixedDelegation(client.rpc, delegationPda);
  logAddress('Agent (delegatee)', agent.address);
  logAddress('Delegation PDA', delegationPda);
  logTokens('Allowance cap', delegation.data.amount);
  logSuccess('Fixed delegation created — agent can pull up to the cap');

  logStep(4, 'Agent pulls 3 tokens (agent signs, user does not)');
  const agentClient = await createSubscriptionsClient(agent);
  const agentAta = await ensureAta(agentClient, agent, agent.address, mint);
  const pullAmount = 3n * ONE_TOKEN;

  await agentClient.subscriptions.instructions
    .transferFixed({
      delegatee: agent,
      delegator: user.address,
      delegatorAta: userAta,
      tokenMint: mint,
      delegationPda,
      amount: pullAmount,
      receiverAta: agentAta,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    .sendTransaction();

  const agentBalance = await getTokenBalance(client, agentAta);
  logTokens('Agent received', agentBalance);

  const delegationAfter = await fetchFixedDelegation(client.rpc, delegationPda);
  logTokens('Remaining allowance', delegationAfter.data.amount);
  logSuccess('Pull succeeded without user signature');

  logStep(5, 'User revokes the delegation');
  await client.subscriptions.instructions
    .revokeDelegation({
      authority: user,
      delegationAccount: delegationPda,
    })
    .sendTransaction();
  logSuccess('Delegation revoked — agent can no longer pull');

  logStep(6, 'Close Subscription Authority (optional cleanup)');
  const saBefore = await fetchMaybeSubscriptionAuthority(
    client.rpc,
    subscriptionAuthorityPda,
  );
  if (saBefore.exists) {
    await client.subscriptions.instructions
      .closeSubscriptionAuthority({
        user,
        tokenMint: mint,
      })
      .sendTransaction();
    logSuccess('Subscription Authority closed, rent returned to user');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
