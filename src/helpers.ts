import {
  type Address,
  type Instruction,
  type KeyPairSigner,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type TransactionSigner,
} from '@solana/kit';
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import type { SubscriptionsClient } from './client.js';
import { ONE_DAY_SECONDS, ONE_HOUR_SECONDS, ONE_TOKEN, TOKEN_DECIMALS } from './config.js';

export { ONE_DAY_SECONDS, ONE_HOUR_SECONDS, ONE_TOKEN, TOKEN_DECIMALS };

async function sendInstructions(
  client: SubscriptionsClient,
  feePayer: TransactionSigner,
  instructions: Instruction[],
): Promise<string> {
  const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  );

  const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
  const wireTransaction = getBase64EncodedWireTransaction(signedTransaction);
  const signature = getSignatureFromTransaction(signedTransaction);

  await client.rpc
    .sendTransaction(wireTransaction, {
      encoding: 'base64',
      preflightCommitment: 'confirmed',
    })
    .send({ abortSignal: AbortSignal.timeout(60_000) });

  return signature;
}

export async function ensureAta(
  client: SubscriptionsClient,
  payer: KeyPairSigner,
  owner: Address,
  mint: Address,
): Promise<Address> {
  const ata = await findAta(owner, mint);
  const info = await client.rpc.getAccountInfo(ata).send();
  if (info.value) {
    return ata;
  }

  const ix = await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer,
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  await sendInstructions(client, payer, [ix]);
  return ata;
}

export async function airdropSol(
  client: SubscriptionsClient,
  address: Address,
  solAmount = 2,
): Promise<void> {
  const lamportAmount = lamports(BigInt(solAmount) * 1_000_000_000n);
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.airdrop(address, lamportAmount);
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(
          `Devnet airdrop failed after ${maxAttempts} attempts. ` +
            `Fund ${address} manually via https://faucet.solana.com/ or set SOLANA_RPC_URL.`,
          { cause: error },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
}

export async function createFundedKeypair(
  client: SubscriptionsClient,
  solAmount = 2,
): Promise<KeyPairSigner> {
  const keypair = await generateKeyPairSigner();
  await airdropSol(client, keypair.address, solAmount);
  return keypair;
}

export async function findAta(owner: Address, mint: Address): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return ata;
}

/** Create a test SPL mint and mint tokens to the recipient ATA. */
export async function createTestMintWithBalance(
  client: SubscriptionsClient,
  payer: KeyPairSigner,
  recipient: Address,
  tokenAmount: bigint,
  decimals = TOKEN_DECIMALS,
): Promise<{ mint: Address; recipientAta: Address }> {
  const mintSigner = await generateKeyPairSigner();

  await client.token.instructions
    .createMint({
      payer,
      newMint: mintSigner,
      decimals,
      mintAuthority: payer.address,
      freezeAuthority: payer.address,
    })
    .sendTransaction();

  const recipientAta = await mintTokensTo(
    client,
    payer,
    mintSigner.address,
    recipient,
    tokenAmount,
    decimals,
  );

  return { mint: mintSigner.address, recipientAta };
}

/** Mint tokens to a recipient's ATA (created if needed). */
export async function mintTokensTo(
  client: SubscriptionsClient,
  payer: KeyPairSigner,
  mint: Address,
  recipient: Address,
  tokenAmount: bigint,
  decimals = TOKEN_DECIMALS,
): Promise<Address> {
  if (tokenAmount === 0n) {
    return findAta(recipient, mint);
  }

  await client.token.instructions
    .mintToATA({
      payer,
      owner: recipient,
      mint,
      mintAuthority: payer,
      amount: tokenAmount,
      decimals,
    })
    .sendTransaction();

  return findAta(recipient, mint);
}

export async function getTokenBalance(
  client: SubscriptionsClient,
  ata: Address,
): Promise<bigint> {
  const balance = await client.rpc.getTokenAccountBalance(ata).send();
  return BigInt(balance.value.amount);
}

export async function getValidatorTime(client: SubscriptionsClient): Promise<bigint> {
  const slot = await client.rpc.getSlot().send();
  const blockTime = await client.rpc.getBlockTime(slot).send();
  if (blockTime != null) {
    return BigInt(blockTime);
  }
  return BigInt(Math.floor(Date.now() / 1000));
}

export function formatTokens(amount: bigint, decimals = TOKEN_DECIMALS): string {
  const whole = amount / 10n ** BigInt(decimals);
  const fraction = amount % 10n ** BigInt(decimals);
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
}

export function logStep(step: number, title: string, detail?: string): void {
  console.log(`\n--- Step ${step}: ${title} ---`);
  if (detail) {
    console.log(detail);
  }
}

export function logSuccess(message: string): void {
  console.log(`✓ ${message}`);
}

export function logAddress(label: string, address: Address): void {
  console.log(`  ${label}: ${address}`);
}

export function logTokens(label: string, amount: bigint): void {
  console.log(`  ${label}: ${formatTokens(amount)} tokens`);
}
