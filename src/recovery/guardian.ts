import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';

export interface Guardian {
  address: PublicKey;
  weight: number;
  label?: string;
  email?: string;
  addedAt: Date;
}

export interface RecoveryRequest {
  id: string;
  walletAddress: PublicKey;
  newOwner: PublicKey;
  initiatedBy: PublicKey;
  approvals: Map<string, { guardian: PublicKey; timestamp: Date; signature: string }>;
  status: 'pending' | 'approved' | 'executed' | 'cancelled' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  timelockEndsAt?: Date;
}

export interface RecoveryConfig {
  guardians: Guardian[];
  threshold: number;
  timelockHours: number;
  expirationHours: number;
}

export class SocialRecovery {
  private connection: Connection;
  private walletAddress: PublicKey;
  private config: RecoveryConfig;
  private pendingRecovery: RecoveryRequest | null = null;

  constructor(connection: Connection, walletAddress: PublicKey, config: RecoveryConfig) {
    this.connection = connection;
    this.walletAddress = walletAddress;
    this.config = config;
  }

  // Add a new guardian
  addGuardian(guardian: Guardian): void {
    if (this.config.guardians.some(g => g.address.equals(guardian.address))) {
      throw new Error('Guardian already exists');
    }
    this.config.guardians.push(guardian);
  }

  // Remove a guardian
  removeGuardian(address: PublicKey): void {
    const index = this.config.guardians.findIndex(g => g.address.equals(address));
    if (index === -1) throw new Error('Guardian not found');
    
    this.config.guardians.splice(index, 1);
    
    // Ensure threshold is still achievable
    const totalWeight = this.getTotalWeight();
    if (totalWeight < this.config.threshold) {
      throw new Error('Cannot remove guardian: would make threshold unreachable');
    }
  }

  // Initiate recovery process
  initiateRecovery(newOwner: PublicKey, initiator: PublicKey): RecoveryRequest {
    if (!this.isGuardian(initiator)) {
      throw new Error('Only guardians can initiate recovery');
    }

    if (this.pendingRecovery && this.pendingRecovery.status === 'pending') {
      throw new Error('Recovery already in progress');
    }

    const now = new Date();
    this.pendingRecovery = {
      id: `recovery_${Date.now()}`,
      walletAddress: this.walletAddress,
      newOwner,
      initiatedBy: initiator,
      approvals: new Map(),
      status: 'pending',
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.config.expirationHours * 3600000),
    };

    // Auto-approve by initiator
    this.approveRecovery(initiator, 'auto_signature');

    return this.pendingRecovery;
  }

  // Approve recovery request
  approveRecovery(guardian: PublicKey, signature: string): void {
    if (!this.pendingRecovery) {
      throw new Error('No pending recovery');
    }

    if (this.pendingRecovery.status !== 'pending') {
      throw new Error('Recovery is not pending');
    }

    if (new Date() > this.pendingRecovery.expiresAt) {
      this.pendingRecovery.status = 'expired';
      throw new Error('Recovery has expired');
    }

    if (!this.isGuardian(guardian)) {
      throw new Error('Not a guardian');
    }

    if (this.pendingRecovery.approvals.has(guardian.toBase58())) {
      throw new Error('Already approved');
    }

    this.pendingRecovery.approvals.set(guardian.toBase58(), {
      guardian,
      timestamp: new Date(),
      signature,
    });

    // Check if threshold reached
    const approvalWeight = this.getApprovalWeight();
    if (approvalWeight >= this.config.threshold) {
      this.pendingRecovery.status = 'approved';
      this.pendingRecovery.timelockEndsAt = new Date(
        Date.now() + this.config.timelockHours * 3600000
      );
    }
  }

  // Execute recovery after timelock
  async executeRecovery(): Promise<string> {
    if (!this.pendingRecovery) {
      throw new Error('No pending recovery');
    }

    if (this.pendingRecovery.status !== 'approved') {
      throw new Error('Recovery not approved');
    }

    if (!this.pendingRecovery.timelockEndsAt || new Date() < this.pendingRecovery.timelockEndsAt) {
      const remaining = this.pendingRecovery.timelockEndsAt 
        ? Math.ceil((this.pendingRecovery.timelockEndsAt.getTime() - Date.now()) / 3600000)
        : this.config.timelockHours;
      throw new Error(`Timelock active: ${remaining}h remaining`);
    }

    // Execute ownership transfer on-chain
    // This would call the smart wallet program
    this.pendingRecovery.status = 'executed';
    
    return 'recovery_executed_signature';
  }

  // Cancel recovery (by current owner)
  cancelRecovery(): void {
    if (!this.pendingRecovery) {
      throw new Error('No pending recovery');
    }
    this.pendingRecovery.status = 'cancelled';
    this.pendingRecovery = null;
  }

  // Getters
  isGuardian(address: PublicKey): boolean {
    return this.config.guardians.some(g => g.address.equals(address));
  }

  getGuardian(address: PublicKey): Guardian | undefined {
    return this.config.guardians.find(g => g.address.equals(address));
  }

  getTotalWeight(): number {
    return this.config.guardians.reduce((sum, g) => sum + g.weight, 0);
  }

  getApprovalWeight(): number {
    if (!this.pendingRecovery) return 0;
    
    let weight = 0;
    for (const [address] of this.pendingRecovery.approvals) {
      const guardian = this.config.guardians.find(g => g.address.toBase58() === address);
      if (guardian) weight += guardian.weight;
    }
    return weight;
  }

  getRecoveryStatus(): RecoveryRequest | null {
    return this.pendingRecovery;
  }

  getGuardians(): Guardian[] {
    return [...this.config.guardians];
  }
}
