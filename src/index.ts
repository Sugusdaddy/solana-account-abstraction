import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionKeyConfig {
  duration: number; // seconds
  permissions: SessionPermissions;
}

export interface SessionPermissions {
  programs?: PublicKey[];
  maxSol?: number;
  maxDailySol?: number;
  allowedTokens?: PublicKey[];
}

export interface SessionKey {
  publicKey: PublicKey;
  secretKey: Uint8Array;
  expiresAt: number;
  permissions: SessionPermissions;
}

export interface Guardian {
  address: PublicKey;
  weight: number;
  label?: string;
}

export interface RecoveryConfig {
  guardians: Guardian[];
  threshold: number;
  timelockHours: number;
}

export interface WalletConfig {
  dailyLimit?: number;
  txLimit?: number;
  backupOwners?: PublicKey[];
}

export interface SponsoredTransaction {
  transaction: Transaction;
  userSignature: Uint8Array;
  sponsor: PublicKey;
}

// ============================================================================
// SMART WALLET CLASS
// ============================================================================

export class SmartWallet {
  public address: PublicKey;
  public owner: PublicKey;
  private connection: Connection;
  private sessions: Map<string, SessionKey> = new Map();
  private config: WalletConfig;

  private constructor(
    address: PublicKey,
    owner: PublicKey,
    connection: Connection,
    config: WalletConfig
  ) {
    this.address = address;
    this.owner = owner;
    this.connection = connection;
    this.config = config;
  }

  // Create new smart wallet
  static async create(
    connection: Connection,
    owner: Keypair,
    config: WalletConfig = {}
  ): Promise<SmartWallet> {
    // In production, this would call the on-chain program
    // to create a PDA-based smart wallet account
    
    const [walletAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from('smart_wallet'), owner.publicKey.toBuffer()],
      new PublicKey('SmartWa11etProgram11111111111111111111111')
    );

    const wallet = new SmartWallet(
      walletAddress,
      owner.publicKey,
      connection,
      config
    );

    return wallet;
  }

  // Load existing smart wallet
  static async load(
    connection: Connection,
    address: PublicKey
  ): Promise<SmartWallet> {
    // In production, deserialize from on-chain account
    throw new Error('Not implemented - would load from chain');
  }

  // ============================================================================
  // SESSION KEYS
  // ============================================================================

  // Create a session key
  async createSession(config: SessionKeyConfig): Promise<SessionKey> {
    const keypair = Keypair.generate();
    const expiresAt = Date.now() + config.duration * 1000;

    const session: SessionKey = {
      publicKey: keypair.publicKey,
      secretKey: keypair.secretKey,
      expiresAt,
      permissions: config.permissions,
    };

    // In production, register session on-chain
    this.sessions.set(keypair.publicKey.toBase58(), session);

    return session;
  }

  // Revoke a session key
  async revokeSession(sessionKey: PublicKey): Promise<void> {
    this.sessions.delete(sessionKey.toBase58());
    // In production, also revoke on-chain
  }

  // Check if session is valid
  isSessionValid(sessionKey: PublicKey): boolean {
    const session = this.sessions.get(sessionKey.toBase58());
    if (!session) return false;
    if (Date.now() > session.expiresAt) return false;
    return true;
  }

  // Execute transaction with session key
  async executeWithSession(
    transaction: Transaction,
    sessionKey: PublicKey
  ): Promise<string> {
    if (!this.isSessionValid(sessionKey)) {
      throw new Error('Session key is invalid or expired');
    }

    const session = this.sessions.get(sessionKey.toBase58())!;
    
    // Validate transaction against session permissions
    this.validateAgainstPermissions(transaction, session.permissions);

    // In production, submit through smart wallet program
    // For now, simulate direct submission
    const signature = await this.connection.sendTransaction(transaction, []);
    return signature;
  }

  private validateAgainstPermissions(tx: Transaction, perms: SessionPermissions): void {
    // Check program whitelist
    if (perms.programs && perms.programs.length > 0) {
      for (const ix of tx.instructions) {
        const allowed = perms.programs.some(p => p.equals(ix.programId));
        if (!allowed) {
          throw new Error(`Program ${ix.programId.toBase58()} not allowed`);
        }
      }
    }

    // Additional permission checks would go here
  }

  // ============================================================================
  // GASLESS TRANSACTIONS
  // ============================================================================

  // Create a transaction that can be sponsored
  createSponsoredTx(instructions: TransactionInstruction[]): Transaction {
    const tx = new Transaction();
    
    // Add instructions
    for (const ix of instructions) {
      tx.add(ix);
    }

    // Don't set fee payer - sponsor will set it
    return tx;
  }

  // Submit sponsored transaction (called by sponsor)
  async submitSponsored(
    transaction: Transaction,
    sponsor: Keypair,
    userSignature: Uint8Array
  ): Promise<string> {
    // Set sponsor as fee payer
    transaction.feePayer = sponsor.publicKey;

    // Get recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    // Add user's signature
    transaction.addSignature(this.address, Buffer.from(userSignature));

    // Sponsor signs and submits
    transaction.sign(sponsor);

    const signature = await this.connection.sendRawTransaction(transaction.serialize());
    return signature;
  }

  // ============================================================================
  // SOCIAL RECOVERY
  // ============================================================================

  // Setup recovery configuration
  async setupRecovery(config: RecoveryConfig): Promise<void> {
    // Validate threshold
    const totalWeight = config.guardians.reduce((sum, g) => sum + g.weight, 0);
    if (config.threshold > totalWeight) {
      throw new Error('Threshold cannot exceed total guardian weight');
    }

    // In production, store config on-chain
    console.log('Recovery setup:', {
      guardians: config.guardians.map(g => ({
        address: g.address.toBase58(),
        weight: g.weight,
        label: g.label,
      })),
      threshold: config.threshold,
      timelockHours: config.timelockHours,
    });
  }

  // Initiate recovery (called by guardian)
  async initiateRecovery(
    newOwner: PublicKey,
    guardian: Keypair
  ): Promise<void> {
    // In production, create PendingRecovery on-chain
    console.log('Recovery initiated:', {
      newOwner: newOwner.toBase58(),
      initiatedBy: guardian.publicKey.toBase58(),
      timestamp: Date.now(),
    });
  }

  // Approve recovery (called by guardians)
  async approveRecovery(guardian: Keypair): Promise<void> {
    // In production, add guardian approval on-chain
    console.log('Recovery approved by:', guardian.publicKey.toBase58());
  }

  // Execute recovery after timelock
  async executeRecovery(): Promise<void> {
    // In production, transfer ownership on-chain
    console.log('Recovery executed');
  }

  // Cancel recovery (called by current owner)
  async cancelRecovery(): Promise<void> {
    // In production, cancel pending recovery on-chain
    console.log('Recovery cancelled');
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  // Get wallet balance
  async getBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.address);
    return balance / LAMPORTS_PER_SOL;
  }

  // Get all active sessions
  getActiveSessions(): SessionKey[] {
    const now = Date.now();
    return Array.from(this.sessions.values()).filter(s => s.expiresAt > now);
  }

  // Check spending limits
  async checkSpendingLimit(amount: number): Promise<boolean> {
    if (this.config.txLimit && amount > this.config.txLimit) {
      return false;
    }
    // Would also check daily limit against on-chain state
    return true;
  }
}

// ============================================================================
// GUARDIAN CLASS
// ============================================================================

export class Guardian {
  private connection: Connection;
  private keypair: Keypair;

  constructor(connection: Connection, keypair: Keypair) {
    this.connection = connection;
    this.keypair = keypair;
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  // Initiate recovery for a wallet
  async initiateRecovery(walletAddress: PublicKey, newOwner: PublicKey): Promise<void> {
    console.log(`Guardian ${this.publicKey.toBase58()} initiating recovery`);
    // In production, call smart wallet program
  }

  // Approve pending recovery
  async approveRecovery(walletAddress: PublicKey): Promise<void> {
    console.log(`Guardian ${this.publicKey.toBase58()} approving recovery`);
    // In production, call smart wallet program
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default SmartWallet;
