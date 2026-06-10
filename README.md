# Technical Demo: Solana Native Subscriptions & Allowances

A submission-ready TypeScript code sample demonstrating [Solana Native Subscriptions & Allowances](https://solana.com/news/subscriptions-and-allowances) — the audited on-chain program for recurring billing, spending caps, and merchant subscription plans.

Built for the [Superteam Earn bounty](https://earn.superteam.fun/listing/technical-demo-solana-native-subscriptions-allowances-code-sample).

## What This Demonstrates

Solana's SPL Token program allows only **one delegate per token account**. That makes it impossible to run, from a single USDC balance, an AI agent allowance, a payroll delegation, and a newsletter subscription at the same time — each new `Approve` overwrites the previous one.

The **Subscriptions Delegation Program** solves this with one level of indirection:

1. For each `(user, mint)` pair, initialize a **Subscription Authority (SA)** PDA.
2. The user's token account approves the SA once with `u64::MAX`.
3. The SA can only move funds when a separate **delegation PDA** authorizes a specific transfer.
4. Create unlimited delegation PDAs — each with its own cap, cadence, expiry, and authorized puller.

```
User Token Account
       │
       │  Approve (once)
       ▼
Subscription Authority PDA  ──►  Fixed Delegation PDA      (AI agent allowance)
       │                         Recurring Delegation PDA (payroll)
       │                         Subscription PDA         (merchant plan)
       │
       └── SA transfers only when a delegation permits it
```

**Program ID (mainnet + devnet):** `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`

## Three Authorization Models

| Model | Who creates it | Cap behavior | Who can pull |
| --- | --- | --- | --- |
| **Fixed delegation** (Allowance) | Token owner | One total amount, decremented per transfer; optional expiry | Delegatee only |
| **Recurring delegation** | Token owner | `amount_per_period` resets each period; skipped periods don't stack | Delegatee only |
| **Subscription plan** | Merchant | Plan-defined amount per billing period | Merchant + up to 4 whitelisted pullers |

## Project Structure

```
├── src/
│   ├── config.ts       # Program ID, RPC URL, token constants
│   ├── client.ts       # Kit client + Subscriptions plugin setup
│   └── helpers.ts      # Airdrop, mint creation, logging utilities
├── examples/
│   ├── 01-init-subscription-authority.ts   # Step 0: enable SA for a mint
│   ├── 02-fixed-delegation-allowance.ts    # AI agent spending cap
│   ├── 03-recurring-delegation.ts          # Contractor payroll
│   ├── 04-subscription-plan.ts             # Merchant billing lifecycle
│   ├── 05-multi-delegation-demo.ts         # All three models at once
│   └── run-all.ts                          # Run every example sequentially
├── package.json
└── tsconfig.json
```

## Prerequisites

- **Node.js 20+**
- **Devnet SOL** for transaction fees and account rent (~0.01 SOL per example)
- An RPC endpoint with devnet access (public devnet works; a dedicated RPC improves reliability)

## Quick Start

```bash
# Install dependencies
npm install

# Copy and optionally customize RPC URL
cp .env.example .env

# Run individual examples
npm run example:init          # Initialize Subscription Authority
npm run example:fixed           # Fixed delegation (allowance)
npm run example:recurring       # Recurring delegation (payroll)
npm run example:subscription    # Merchant subscription plan
npm run example:multi           # All three delegations simultaneously

# Run the full demo sequence
npm run example:all

# Type-check without executing
npm run typecheck
```

Each example generates fresh keypairs, airdrops devnet SOL, creates a test SPL mint, and walks through a complete on-chain lifecycle using the official [`@solana/subscriptions`](https://www.npmjs.com/package/@solana/subscriptions) SDK.

### Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | Solana RPC endpoint |

If devnet airdrops fail (common on rate-limited public RPCs), fund the printed wallet address via [faucet.solana.com](https://faucet.solana.com/) and re-run.

## Example Walkthroughs

### 1. Initialize Subscription Authority

[`examples/01-init-subscription-authority.ts`](examples/01-init-subscription-authority.ts)

Required once per `(user, mint)` pair before any delegation or subscription:

```typescript
await client.subscriptions.instructions
  .initSubscriptionAuthority({
    owner: user,
    tokenMint: mint,
    userAta,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  .sendTransaction();
```

### 2. Fixed Delegation (Allowance)

[`examples/02-fixed-delegation-allowance.ts`](examples/02-fixed-delegation-allowance.ts)

Pre-authorize an AI agent to spend up to 10 tokens within one hour. The agent pulls 3 tokens by signing the transfer — the user does not co-sign.

```typescript
await client.subscriptions.instructions
  .createFixedDelegation({
    delegator: user,
    tokenMint: mint,
    delegatee: agent.address,
    nonce: 0n,
    amount: 10_000_000n,
    expiryTs: currentTs + 3600n,
  })
  .sendTransaction();
```

### 3. Recurring Delegation

[`examples/03-recurring-delegation.ts`](examples/03-recurring-delegation.ts)

Authorize a contractor to pull up to 5 tokens per day for 30 days — the cap resets each period.

```typescript
await client.subscriptions.instructions
  .createRecurringDelegation({
    delegator: user,
    tokenMint: mint,
    delegatee: contractor.address,
    nonce: 0n,
    amountPerPeriod: 5_000_000n,
    periodLengthS: 86400n,
    startTs: currentTs,
    expiryTs: currentTs + 86400n * 30n,
  })
  .sendTransaction();
```

### 4. Subscription Plan

[`examples/04-subscription-plan.ts`](examples/04-subscription-plan.ts)

Full merchant lifecycle: publish plan → subscriber accepts terms → merchant collects → subscriber cancels.

```typescript
// Merchant publishes plan
await merchantClient.subscriptions.instructions
  .createPlan({
    owner: merchant,
    planId: 1n,
    mint,
    amount: 5_000_000n,
    periodHours: 24n,
    endTs: 0n,
    destinations: [],
    pullers: [],
    metadataUri: 'https://example.com/plans/pro-tier.json',
  })
  .sendTransaction();

// Subscriber accepts immutable terms
await subscriberClient.subscriptions.instructions
  .subscribe({ subscriber, merchant: merchant.address, planId: 1n, tokenMint: mint })
  .sendTransaction();

// Merchant collects (subscriber does not sign)
await merchantClient.subscriptions.instructions
  .transferSubscription({
    caller: merchant,
    delegator: subscriber.address,
    tokenMint: mint,
    subscriptionPda,
    planPda,
    amount: 5_000_000n,
    receiverAta: merchantAta,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  .sendTransaction();
```

### 5. Multi-Delegation Demo

[`examples/05-multi-delegation-demo.ts`](examples/05-multi-delegation-demo.ts)

Shows the core value proposition: one token account running a fixed allowance, recurring payroll, and merchant subscription **simultaneously** — each with a different nonce/delegation PDA.

## SDK Reference

This repo uses the official TypeScript SDK shipped as a `@solana/kit` plugin:

| Instruction | Purpose |
| --- | --- |
| `initSubscriptionAuthority` | Create SA PDA and approve as token delegate |
| `closeSubscriptionAuthority` | Kill switch — invalidates all delegations |
| `createFixedDelegation` / `transferFixed` | One-time spending cap |
| `createRecurringDelegation` / `transferRecurring` | Periodic spending cap |
| `createPlan` / `subscribe` / `transferSubscription` | Merchant subscription billing |
| `cancelSubscription` / `resumeSubscription` | Subscriber lifecycle |
| `revokeDelegation` | Close a delegation and reclaim rent |

Full SDK docs: [github.com/solana-program/subscriptions](https://github.com/solana-program/subscriptions)

## Official Documentation

- [Overview](https://solana.com/docs/payments/subscriptions/overview)
- [Create Subscription Authority](https://solana.com/docs/payments/subscriptions/create-subscription-authority)
- [Subscription Plan](https://solana.com/docs/payments/subscriptions/subscription-plan)
- [Program repository](https://github.com/solana-program/subscriptions)

## Token Compatibility

The program supports both **SPL Token** and **Token-2022** mints. Avoid mints with configured `TransferHook`, `TransferFee`, `PermanentDelegate`, or other extensions that make delegated transfers unsafe. Plain USDC on devnet (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) works; these examples create fresh test mints for isolation.

## Rent Costs (recoverable on close)

| Account | Approx. rent (SOL) |
| --- | --- |
| Subscription Authority | 0.00163 |
| Fixed delegation | 0.00219 |
| Recurring delegation | 0.00236 |
| Plan | 0.00431 |
| Subscription | 0.00197 |

## License

MIT

## Acknowledgments

- [Solana Foundation](https://solana.com/) — Subscriptions & Allowances program
- [Moonsong Labs](https://moonsonglabs.com/) — program implementation
- [Superteam Earn](https://earn.superteam.fun/) — bounty platform
