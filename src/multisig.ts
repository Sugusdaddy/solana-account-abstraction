import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';

export interface MultisigConfig {
  owners: PublicKey[];
  threshold: number;
  name?: string;
}

export interface MultisigTransaction {
  id: string;
  transaction: Transaction;
  proposer: PublicKey;
  approvals: PublicKey[];
  rejections: PublicKey[];
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  createdAt: Date;
  executedAt?: Date;
}

export class MultisigWallet {
  private connection: Connection;
  private config: MultisigConfig;
  private transactions: Map<string, MultisigTransaction> = new Map();

  constructor(connection: Connection, config: MultisigConfig) {
    this.connection = connection;
    this.config = config;

    if (config.threshold > config.owners.length) {
      throw new Error('Threshold cannot exceed number of owners');
    }
  }

  get address(): PublicKey {
    // Derive PDA for multisig wallet
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('multisig'), ...this.config.owners.map(o => o.toBuffer())],
      new PublicKey('MultisigProgram11111111111111111111111111')
    );
    return pda;
  }

  get owners(): PublicKey[] {
    return [...this.config.owners];
  }

  get threshold(): number {
    return this.config.threshold;
  }

  // Propose a new transaction
  proposeTransaction(transaction: Transaction, proposer: PublicKey): MultisigTransaction {
    if (!this.isOwner(proposer)) {
      throw new Error('Only owners can propose transactions');
    }

    const id = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const multisigTx: MultisigTransaction = {
      id,
      transaction,
      proposer,
      approvals: [proposer], // Proposer auto-approves
      rejections: [],
      status: 'pending',
      createdAt: new Date(),
    };

    this.transactions.set(id, multisigTx);
    this.checkThreshold(multisigTx);

    return multisigTx;
  }

  // Approve a transaction
  approveTransaction(txId: string, approver: PublicKey): void {
    const tx = this.transactions.get(txId);
    if (!tx) throw new Error('Transaction not found');
    if (tx.status !== 'pending') throw new Error('Transaction is not pending');
    if (!this.isOwner(approver)) throw new Error('Only owners can approve');
    if (this.hasVoted(tx, approver)) throw new Error('Already voted');

    tx.approvals.push(approver);
    this.checkThreshold(tx);
  }

  // Reject a transaction
  rejectTransaction(txId: string, rejecter: PublicKey): void {
    const tx = this.transactions.get(txId);
    if (!tx) throw new Error('Transaction not found');
    if (tx.status !== 'pending') throw new Error('Transaction is not pending');
    if (!this.isOwner(rejecter)) throw new Error('Only owners can reject');
    if (this.hasVoted(tx, rejecter)) throw new Error('Already voted');

    tx.rejections.push(rejecter);
    
    // Check if rejection threshold reached
    const rejectThreshold = this.config.owners.length - this.config.threshold + 1;
    if (tx.rejections.length >= rejectThreshold) {
      tx.status = 'rejected';
    }
  }

  // Execute approved transaction
  async executeTransaction(txId: string): Promise<string> {
    const tx = this.transactions.get(txId);
    if (!tx) throw new Error('Transaction not found');
    if (tx.status !== 'approved') throw new Error('Transaction not approved');

    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.transaction.recentBlockhash = blockhash;

    // In production, would submit through multisig program
    const signature = await this.connection.sendTransaction(tx.transaction, []);
    
    tx.status = 'executed';
    tx.executedAt = new Date();

    return signature;
  }

  private isOwner(pubkey: PublicKey): boolean {
    return this.config.owners.some(o => o.equals(pubkey));
  }

  private hasVoted(tx: MultisigTransaction, voter: PublicKey): boolean {
    return (
      tx.approvals.some(a => a.equals(voter)) ||
      tx.rejections.some(r => r.equals(voter))
    );
  }

  private checkThreshold(tx: MultisigTransaction): void {
    if (tx.approvals.length >= this.config.threshold) {
      tx.status = 'approved';
    }
  }

  // Get all pending transactions
  getPendingTransactions(): MultisigTransaction[] {
    return Array.from(this.transactions.values()).filter(tx => tx.status === 'pending');
  }

  // Get transaction by ID
  getTransaction(txId: string): MultisigTransaction | undefined {
    return this.transactions.get(txId);
  }
}
