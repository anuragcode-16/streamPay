/**
 * walletService.ts — localStorage-backed wallet for Pulse Pay
 *
 * Provides create, topUp, debit, getBalance, and getTransactions
 * without needing a backend database connection.
 *
 * Data is stored per-user in localStorage:
 *   pulse_wallet_{userId}    → WalletData JSON
 *   pulse_wallet_tx_{userId} → WalletTx[] JSON
 */

export interface WalletData {
  wallet_id: string;
  user_id: string;
  display_name: string;
  balance_paise: number;
  created_at: string;
}

export interface WalletTx {
  id: string;
  type: "topup" | "debit" | "payment" | "refund";
  amount_paise: number;
  status: string;
  note: string;
  created_at: string;
  session_id?: string;
}

function walletKey(userId: string) {
  return `pulse_wallet_${userId}`;
}

function txKey(userId: string) {
  return `pulse_wallet_tx_${userId}`;
}

function generateWalletId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "PPW-";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function generateId(): string {
  return "tx_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Read / Write helpers ────────────────────────────────────────────────────

function readWallet(userId: string): WalletData | null {
  try {
    const raw = localStorage.getItem(walletKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeWallet(wallet: WalletData): void {
  localStorage.setItem(walletKey(wallet.user_id), JSON.stringify(wallet));
}

function readTransactions(userId: string): WalletTx[] {
  try {
    const raw = localStorage.getItem(txKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeTransactions(userId: string, txs: WalletTx[]): void {
  localStorage.setItem(txKey(userId), JSON.stringify(txs));
}

function addTransaction(userId: string, tx: WalletTx): void {
  const txs = readTransactions(userId);
  txs.unshift(tx); // newest first
  // Keep max 200 entries
  if (txs.length > 200) txs.length = 200;
  writeTransactions(userId, txs);
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getWallet(userId: string): WalletData | null {
  return readWallet(userId);
}

export function getBalance(userId: string): number {
  const w = readWallet(userId);
  return w?.balance_paise ?? 0;
}

export function getTransactions(userId: string): WalletTx[] {
  return readTransactions(userId);
}

export function createWallet(userId: string, displayName?: string): WalletData {
  const existing = readWallet(userId);
  if (existing) return existing;

  const wallet: WalletData = {
    wallet_id: generateWalletId(),
    user_id: userId,
    display_name: displayName || `Wallet-${userId.slice(0, 6)}`,
    balance_paise: 0,
    created_at: new Date().toISOString(),
  };
  writeWallet(wallet);
  return wallet;
}

export function topUp(userId: string, amountPaise: number): WalletData {
  const wallet = readWallet(userId);
  if (!wallet) throw new Error("Wallet not found. Create one first.");
  if (amountPaise <= 0) throw new Error("Amount must be positive.");

  wallet.balance_paise += amountPaise;
  writeWallet(wallet);

  addTransaction(userId, {
    id: generateId(),
    type: "topup",
    amount_paise: amountPaise,
    status: "completed",
    note: `Topped up ₹${(amountPaise / 100).toFixed(2)}`,
    created_at: new Date().toISOString(),
  });

  return wallet;
}

/**
 * Debit wallet for a session payment.
 * Returns the updated wallet.
 * Throws if insufficient balance.
 */
export function debit(
  userId: string,
  amountPaise: number,
  sessionId?: string,
  merchantName?: string
): WalletData {
  const wallet = readWallet(userId);
  if (!wallet) throw new Error("Wallet not found.");
  if (wallet.balance_paise < amountPaise) {
    throw new Error("Insufficient wallet balance.");
  }

  wallet.balance_paise -= amountPaise;
  writeWallet(wallet);

  addTransaction(userId, {
    id: generateId(),
    type: "payment",
    amount_paise: amountPaise,
    status: "completed",
    note: merchantName
      ? `Payment to ${merchantName} — ₹${(amountPaise / 100).toFixed(2)}`
      : `Session payment — ₹${(amountPaise / 100).toFixed(2)}`,
    created_at: new Date().toISOString(),
    session_id: sessionId,
  });

  return wallet;
}

const walletService = {
  getWallet,
  getBalance,
  getTransactions,
  createWallet,
  topUp,
  debit,
};

export default walletService;
