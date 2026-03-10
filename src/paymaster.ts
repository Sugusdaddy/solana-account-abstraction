import { Connection, PublicKey, Transaction, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';

export interface PaymasterConfig {
  sponsorWallet: Keypair;
  maxSponsorAmountPerTx: number;
  maxDailySponsorship: number;
  allowedPrograms?: PublicKey[];
  allowedUsers?: PublicKey[];
}

export interface SponsorshipRequest {
  userWallet: PublicKey;
  transaction: Transaction;
  estimatedFee: number;
}

export interface SponsorshipResult {
  sponsored: boolean;
  reason?: string;
  sponsoredAmount?: number;
  signature?: string;
}

export class Paymaster {
  private connection: Connection;
  private config: PaymasterConfig;
  private dailySpent: Map<string, number> = new Map();
  private userSpent: Map<string, number> = new Map();

  constructor(connection: Connection, config: PaymasterConfig) {
    this.connection = connection;
    this.config = config;
    
    // Reset daily limits at midnight
    this.scheduleDailyReset();
  }

  private scheduleDailyReset(): void {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
      this.dailySpent.clear();
      this.userSpent.clear();
      this.scheduleDailyReset();
    }, msUntilMidnight);
  }

  async sponsorTransaction(request: SponsorshipRequest): Promise<SponsorshipResult> {
    // Check if sponsorship is available
    const eligibility = await this.checkEligibility(request);
    if (!eligibility.eligible) {
      return { sponsored: false, reason: eligibility.reason };
    }

    try {
      // Set sponsor as fee payer
      request.transaction.feePayer = this.config.sponsorWallet.publicKey;

      // Get fresh blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      request.transaction.recentBlockhash = blockhash;

      // Sponsor signs the transaction
      request.transaction.partialSign(this.config.sponsorWallet);

      // Track spending
      this.recordSpending(request.userWallet.toBase58(), request.estimatedFee);

      return {
        sponsored: true,
        sponsoredAmount: request.estimatedFee,
      };
    } catch (error) {
      return {
        sponsored: false,
        reason: `Sponsorship failed: ${error}`,
      };
    }
  }

  private async checkEligibility(
    request: SponsorshipRequest
  ): Promise<{ eligible: boolean; reason?: string }> {
    const userKey = request.userWallet.toBase58();

    // Check if user is allowed
    if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
      const isAllowed = this.config.allowedUsers.some(u => u.equals(request.userWallet));
      if (!isAllowed) {
        return { eligible: false, reason: 'User not in allowlist' };
      }
    }

    // Check transaction programs
    if (this.config.allowedPrograms && this.config.allowedPrograms.length > 0) {
      for (const ix of request.transaction.instructions) {
        const isAllowed = this.config.allowedPrograms.some(p => p.equals(ix.programId));
        if (!isAllowed) {
          return { eligible: false, reason: `Program ${ix.programId.toBase58()} not allowed` };
        }
      }
    }

    // Check per-transaction limit
    if (request.estimatedFee > this.config.maxSponsorAmountPerTx) {
      return { eligible: false, reason: 'Transaction fee exceeds per-tx limit' };
    }

    // Check daily limit
    const todayTotal = this.getTodayTotal();
    if (todayTotal + request.estimatedFee > this.config.maxDailySponsorship) {
      return { eligible: false, reason: 'Daily sponsorship limit reached' };
    }

    // Check sponsor balance
    const sponsorBalance = await this.connection.getBalance(this.config.sponsorWallet.publicKey);
    if (sponsorBalance < request.estimatedFee + 5000) {
      return { eligible: false, reason: 'Sponsor wallet insufficient balance' };
    }

    return { eligible: true };
  }

  private recordSpending(userKey: string, amount: number): void {
    const today = new Date().toDateString();
    const currentDaily = this.dailySpent.get(today) || 0;
    this.dailySpent.set(today, currentDaily + amount);

    const currentUser = this.userSpent.get(userKey) || 0;
    this.userSpent.set(userKey, currentUser + amount);
  }

  private getTodayTotal(): number {
    const today = new Date().toDateString();
    return this.dailySpent.get(today) || 0;
  }

  async getBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.config.sponsorWallet.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  getStats(): {
    todaySpent: number;
    remainingDaily: number;
    sponsorBalance: number;
  } {
    return {
      todaySpent: this.getTodayTotal(),
      remainingDaily: this.config.maxDailySponsorship - this.getTodayTotal(),
      sponsorBalance: 0, // Would fetch from chain
    };
  }
}
