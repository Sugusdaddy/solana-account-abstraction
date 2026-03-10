# Solana Account Abstraction

Account abstraction implementation for Solana with session keys, gasless transactions, and social recovery. Enables next-generation wallet experiences.

![Rust](https://img.shields.io/badge/Rust-000000?style=flat&logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Solana](https://img.shields.io/badge/Solana-black?style=flat&logo=solana&logoColor=14F195)
![License](https://img.shields.io/badge/License-MIT-green)

## What is Account Abstraction?

Account abstraction separates the signer from the account, enabling:
- **Session Keys**: Temporary keys for games/dApps without constant signing
- **Gasless Transactions**: Sponsors pay fees on behalf of users
- **Social Recovery**: Recover wallet using trusted contacts
- **Spending Limits**: Daily/transaction limits for security
- **Multi-sig**: Require multiple signers for high-value transactions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Smart Wallet Account                       │
├─────────────────────────────────────────────────────────────┤
│  Owner Key(s)     │  Session Keys    │  Recovery Config      │
│  - Primary        │  - Temporary     │  - Guardians          │
│  - Backup         │  - Scoped        │  - Threshold          │
│  - Guardian       │  - Time-limited  │  - Timelock           │
├─────────────────────────────────────────────────────────────┤
│                    Permission Rules                           │
│  • Spending limits  • Allowed programs  • Time restrictions   │
└─────────────────────────────────────────────────────────────┘
```

## Features

### Session Keys
Create temporary keys with scoped permissions for seamless UX:

```typescript
// Create session key for a game
const session = await wallet.createSession({
  duration: 60 * 60, // 1 hour
  permissions: {
    programs: [GAME_PROGRAM_ID],
    maxSol: 0.1, // Max 0.1 SOL per tx
  },
});

// Game can now sign transactions without user approval
await game.move(session.publicKey, moveData);
```

### Gasless Transactions
Let sponsors pay transaction fees:

```typescript
// Sponsor pays for user transaction
const sponsoredTx = await wallet.createSponsoredTransaction({
  instructions: [transferInstruction],
  sponsor: sponsorWallet,
});

// User signs, sponsor pays
await sponsor.submitSponsored(sponsoredTx);
```

### Social Recovery
Recover wallet using trusted contacts:

```typescript
// Setup guardians
await wallet.setupRecovery({
  guardians: [
    { address: friend1, weight: 1 },
    { address: friend2, weight: 1 },
    { address: family, weight: 2 },
  ],
  threshold: 3, // Need weight >= 3 to recover
  timelock: 24 * 60 * 60, // 24 hour delay
});

// Initiate recovery (by guardians)
await wallet.initiateRecovery(newOwner);

// Guardians approve
await guardian1.approveRecovery(walletAddress);
await guardian2.approveRecovery(walletAddress);

// Execute after timelock
await wallet.executeRecovery();
```

## Smart Contract (Anchor)

### Account Structure

```rust
#[account]
pub struct SmartWallet {
    // Primary owner
    pub owner: Pubkey,
    
    // Backup owners (optional)
    pub backup_owners: Vec<Pubkey>,
    
    // Active session keys
    pub sessions: Vec<SessionKey>,
    
    // Recovery configuration
    pub recovery: Option<RecoveryConfig>,
    
    // Spending limits
    pub limits: SpendingLimits,
    
    // Nonce for replay protection
    pub nonce: u64,
    
    // Bump for PDA
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SessionKey {
    pub key: Pubkey,
    pub expires_at: i64,
    pub permissions: Permissions,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Permissions {
    pub allowed_programs: Vec<Pubkey>,
    pub max_sol_per_tx: u64,
    pub max_daily_sol: u64,
    pub allowed_tokens: Vec<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RecoveryConfig {
    pub guardians: Vec<Guardian>,
    pub threshold: u8,
    pub timelock_seconds: i64,
    pub pending_recovery: Option<PendingRecovery>,
}
```

### Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize` | Create smart wallet |
| `create_session` | Create session key |
| `revoke_session` | Revoke session key |
| `execute` | Execute transaction |
| `execute_sponsored` | Execute with sponsor |
| `setup_recovery` | Configure guardians |
| `initiate_recovery` | Start recovery process |
| `approve_recovery` | Guardian approves |
| `execute_recovery` | Complete recovery |
| `cancel_recovery` | Owner cancels |

## SDK Usage

### Installation

```bash
npm install @sugusdaddy/solana-account-abstraction
```

### Create Smart Wallet

```typescript
import { SmartWallet } from '@sugusdaddy/solana-account-abstraction';

const wallet = await SmartWallet.create(connection, owner, {
  dailyLimit: 10, // 10 SOL daily max
  txLimit: 1, // 1 SOL per tx max
});

console.log('Smart Wallet:', wallet.address);
```

### Session Key Flow

```typescript
// 1. User creates session for dApp
const session = await wallet.createSession({
  duration: 3600, // 1 hour
  permissions: {
    programs: [GAME_PROGRAM_ID],
    maxSol: 0.1,
  },
});

// 2. dApp stores session key
localStorage.setItem('gameSession', session.secretKey);

// 3. dApp creates and signs transactions
const tx = await game.createMoveTransaction(session.publicKey, move);
tx.sign(session);

// 4. Submit through smart wallet
await wallet.executeSession(tx, session.publicKey);
```

### Gasless Transaction

```typescript
// 1. User creates transaction
const instruction = SystemProgram.transfer({
  fromPubkey: wallet.address,
  toPubkey: recipient,
  lamports: 1000000,
});

// 2. Create sponsored transaction
const sponsoredTx = wallet.createSponsoredTx([instruction]);

// 3. Submit to sponsor API
const response = await fetch('https://sponsor.com/api/submit', {
  method: 'POST',
  body: JSON.stringify({
    transaction: sponsoredTx.serialize(),
    userSignature: await user.signMessage(sponsoredTx.message),
  }),
});
```

### Recovery Flow

```typescript
// Setup (one time)
await wallet.setupRecovery({
  guardians: [
    { address: 'friend1...', weight: 1, label: 'Alice' },
    { address: 'friend2...', weight: 1, label: 'Bob' },
    { address: 'family...', weight: 2, label: 'Mom' },
  ],
  threshold: 3,
  timelockHours: 24,
});

// If wallet lost:

// 1. Friend initiates recovery
await guardian.initiateRecovery(walletAddress, newOwnerPubkey);

// 2. Guardians approve
await alice.approveRecovery(walletAddress);
await bob.approveRecovery(walletAddress);
// Weight = 2, need more...
await mom.approveRecovery(walletAddress);
// Weight = 4 >= threshold of 3

// 3. Wait for timelock (24 hours)

// 4. Execute recovery
await anyone.executeRecovery(walletAddress);
// Ownership transferred to newOwnerPubkey
```

## Security Considerations

1. **Session Key Limits**: Always set appropriate time and spending limits
2. **Guardian Selection**: Choose diverse, trusted guardians
3. **Timelock Period**: Longer timelocks = more secure but slower recovery
4. **Multi-sig for High Value**: Require multiple signatures for large transfers
5. **Regular Audits**: Monitor session key usage

## Comparison

| Feature | EOA (Regular) | This Smart Wallet |
|---------|---------------|-------------------|
| Session Keys | ❌ | ✅ |
| Gasless | ❌ | ✅ |
| Social Recovery | ❌ | ✅ |
| Spending Limits | ❌ | ✅ |
| Multi-sig | ❌ | ✅ |
| Batched Txs | ❌ | ✅ |

## Roadmap

- [x] Core smart wallet program
- [x] Session key management
- [x] Social recovery
- [x] TypeScript SDK
- [ ] Gasless transaction relay
- [ ] Multi-sig support
- [ ] Hardware wallet integration
- [ ] Mobile SDK

## Testing

```bash
# Build program
anchor build

# Run tests
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## Resources

- [ERC-4337 (EVM AA)](https://eips.ethereum.org/EIPS/eip-4337)
- [Squads Protocol](https://squads.so)
- [Solana Account Model](https://solana.com/docs/core/accounts)

## License

MIT License

---

Built by [@Sugusdaddy](https://github.com/Sugusdaddy)

*Pushing the boundaries of wallet UX on Solana.*
