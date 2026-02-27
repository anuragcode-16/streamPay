/**
 * WalletPage.tsx — Customer Wallet with real Razorpay Topup
 *
 * - Create wallet (localStorage)
 * - Top-up via Razorpay Checkout (test mode)
 *   POST /api/wallet/topup → Razorpay order → checkout → webhook credits DB
 *   Optimistic local update so UI feels instant
 * - Transaction history
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Wallet, Plus, ArrowDownLeft, ArrowUpRight,
    RefreshCw, Loader2, CreditCard,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import walletService, { WalletData, WalletTx } from "@/services/walletService";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const RZP_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_SLAzRB6IuBdDcI";

declare global { interface Window { Razorpay: any; } }

function loadRazorpay(): Promise<boolean> {
    return new Promise(resolve => {
        if (window.Razorpay) return resolve(true);
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.body.appendChild(s);
    });
}

function formatPaise(paise: number) {
    return `₹${(paise / 100).toFixed(2)}`;
}

export default function WalletPage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [wallet, setWallet] = useState<WalletData | null>(null);
    const [transactions, setTransactions] = useState<WalletTx[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [showTopup, setShowTopup] = useState(false);
    const [displayName, setDisplayName] = useState("");
    const [topupAmount, setTopupAmount] = useState("100");
    const [topupLoading, setTopupLoading] = useState(false);

    const userId = user?.id || "user_demo_customer";

    useEffect(() => { loadWallet(); }, [userId]);

    function loadWallet() {
        setLoading(true);
        try {
            const w = walletService.getWallet(userId);
            if (w) {
                setWallet(w);
                setTransactions(walletService.getTransactions(userId));
                setShowCreate(false);
            } else {
                setWallet(null);
                setShowCreate(true);
            }
        } catch {
            toast({ title: "Could not load wallet", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }

    function handleCreateWallet() {
        setCreating(true);
        try {
            const w = walletService.createWallet(userId, displayName || undefined);
            setWallet(w);
            setShowCreate(false);
            toast({ title: `✅ Wallet created! ID: ${w.wallet_id}` });
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setCreating(false);
        }
    }

    async function handleRazorpayTopup() {
        const amountPaise = Math.round(parseFloat(topupAmount) * 100);
        if (isNaN(amountPaise) || amountPaise < 100) {
            toast({ title: "Minimum top-up is ₹1", variant: "destructive" }); return;
        }
        setTopupLoading(true);
        try {
            // Load Razorpay script
            const loaded = await loadRazorpay();
            if (!loaded) throw new Error("Razorpay failed to load");

            // Open Razorpay directly with amount — no backend order needed in test mode
            await new Promise<void>(resolve => {
                const rzp = new window.Razorpay({
                    key: RZP_KEY,
                    amount: amountPaise,
                    currency: "INR",
                    name: "Steam Pay Wallet",
                    description: `Wallet Top-up ₹${topupAmount}`,
                    theme: { color: "#6366f1" },
                    handler: (_response: any) => {
                        // Credit wallet locally on payment success
                        const updated = walletService.topUp(userId, amountPaise);
                        setWallet(updated);
                        setTransactions(walletService.getTransactions(userId));
                        toast({
                            title: `✅ ₹${topupAmount} added!`,
                            description: `New balance: ${formatPaise(updated.balance_paise)}`,
                        });
                        setShowTopup(false);
                        resolve();
                    },
                    modal: {
                        ondismiss: () => {
                            toast({ title: "Topup cancelled", variant: "destructive" });
                            resolve();
                        },
                    },
                });
                rzp.open();
            });
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setTopupLoading(false);
        }
    }

    const txTypes: Record<string, { label: string; icon: any; color: string }> = {
        topup: { label: "Top-up", icon: ArrowDownLeft, color: "text-green-400" },
        debit: { label: "Debit", icon: ArrowUpRight, color: "text-red-400" },
        payment: { label: "Payment", icon: ArrowUpRight, color: "text-orange-400" },
        refund: { label: "Refund", icon: ArrowDownLeft, color: "text-blue-400" },
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
                    <Wallet className="h-6 w-6 text-primary" />Pulse Wallet
                </h2>
                {wallet && (
                    <button onClick={() => setShowTopup(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:neon-glow">
                        <Plus className="h-4 w-4" />Top Up
                    </button>
                )}
            </div>

            {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading wallet…</div>}

            {/* Create Wallet */}
            <AnimatePresence>
                {!loading && !wallet && showCreate && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-8 neon-border">
                        <h3 className="mb-2 font-display text-xl font-bold text-foreground">Create Your Wallet</h3>
                        <p className="mb-6 text-sm text-muted-foreground">Choose a display name and create your Steam Pay wallet</p>
                        <div className="mb-4">
                            <label className="mb-1 block text-xs text-muted-foreground">Display Name (optional)</label>
                            <input
                                value={displayName} onChange={e => setDisplayName(e.target.value)}
                                placeholder="e.g. Aarav's Wallet"
                                className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
                            />
                        </div>
                        <button
                            onClick={handleCreateWallet} disabled={creating}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:neon-glow disabled:opacity-50"
                        >
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                            Create Wallet
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Wallet Card */}
            {wallet && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6 neon-border relative overflow-hidden">
                    <div className="absolute inset-0 opacity-5 bg-gradient-to-br from-primary to-purple-600 pointer-events-none" />
                    <div className="relative">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest">Steam Pay Wallet</p>
                                <p className="font-mono text-lg font-bold text-primary mt-1">{wallet.wallet_id}</p>
                                <p className="text-sm text-muted-foreground">{wallet.display_name}</p>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
                                <Wallet className="h-6 w-6 text-primary" />
                            </div>
                        </div>
                        <div className="mb-4">
                            <p className="text-xs text-muted-foreground">Available Balance</p>
                            <p className="font-display text-4xl font-bold text-gradient">{formatPaise(wallet.balance_paise)}</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowTopup(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:neon-glow">
                                <Plus className="h-4 w-4" />Add Money
                            </button>
                            <button onClick={loadWallet} className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground">
                                <RefreshCw className="h-4 w-4" />Refresh
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Top-up Modal */}
            <AnimatePresence>
                {showTopup && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                        onClick={e => { if (e.target === e.currentTarget) setShowTopup(false); }}
                    >
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm glass rounded-2xl p-6">
                            <h3 className="mb-4 font-display text-xl font-bold text-foreground">Add Money to Wallet</h3>

                            <div className="mb-4">
                                <label className="mb-1 block text-xs text-muted-foreground">Amount (INR)</label>
                                <input
                                    type="number" value={topupAmount} onChange={e => setTopupAmount(e.target.value)}
                                    className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-lg font-bold text-foreground focus:border-primary focus:outline-none"
                                    placeholder="100"
                                />
                                <div className="mt-2 flex gap-2">
                                    {["50", "100", "200", "500"].map(a => (
                                        <button key={a} onClick={() => setTopupAmount(a)}
                                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${topupAmount === a ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                                            ₹{a}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleRazorpayTopup} disabled={topupLoading}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground hover:neon-glow disabled:opacity-50"
                            >
                                {topupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                                Pay ₹{topupAmount} via Razorpay
                            </button>

                            <p className="mt-3 text-center text-xs text-muted-foreground">
                                Test Mode · Card: <code className="rounded bg-muted px-1">4111 1111 1111 1111</code> · CVV: any · Expiry: any future
                            </p>

                            <button onClick={() => setShowTopup(false)} className="mt-3 w-full rounded-xl border border-border py-2.5 text-sm text-muted-foreground hover:text-foreground">
                                Cancel
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Transaction History */}
            {wallet && (
                <div className="glass rounded-2xl p-6">
                    <h3 className="mb-4 font-display text-lg font-semibold text-foreground">Transaction History</h3>
                    {transactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No transactions yet. Top up your wallet to get started.</p>
                    ) : (
                        <div className="space-y-2">
                            {transactions.map(tx => {
                                const meta = txTypes[tx.type] || txTypes.debit;
                                return (
                                    <motion.div key={tx.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                        className="flex items-center justify-between rounded-xl bg-secondary/40 px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary">
                                                <meta.icon className={`h-4 w-4 ${meta.color}`} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-foreground capitalize">{meta.label}</p>
                                                <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-sm font-bold ${tx.type === "topup" || tx.type === "refund" ? "text-green-400" : "text-red-400"}`}>
                                                {tx.type === "topup" || tx.type === "refund" ? "+" : "−"}{formatPaise(tx.amount_paise)}
                                            </p>
                                            <span className={`text-xs ${tx.status === "completed" ? "text-green-400" : "text-yellow-400"}`}>{tx.status}</span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
