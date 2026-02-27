/**
 * WalletPage.tsx — Customer Wallet (localStorage-backed)
 *
 * Shows:
 *  - Wallet ID (PPW-XXXXXXXX), Display Name, Balance
 *  - Create wallet form
 *  - Top-up via simulated UPI PIN entry (demo)
 *  - Transaction history from localStorage
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Plus, ArrowDownLeft, ArrowUpRight, RefreshCw, Loader2, CheckCircle2, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import walletService, { WalletData, WalletTx } from "@/services/walletService";

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

    // Simulated PIN entry state
    const [showPinUI, setShowPinUI] = useState(false);
    const [pin, setPin] = useState("");
    const [pinVerifying, setPinVerifying] = useState(false);

    const userId = user?.id || "user_demo_customer";

    useEffect(() => {
        loadWallet();
    }, [userId]);

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

    // Simulated UPI PIN flow for demo top-up
    function simulateUPITopup() {
        setShowPinUI(true);
        setPin("");
    }

    async function submitPin() {
        if (pin.length < 4) {
            toast({ title: "Enter 4-digit UPI PIN", variant: "destructive" });
            return;
        }
        setPinVerifying(true);
        // Simulate bank verification delay
        await new Promise(r => setTimeout(r, 2000));
        setPinVerifying(false);
        setShowPinUI(false);

        try {
            const amountPaise = Math.round(parseFloat(topupAmount) * 100);
            if (isNaN(amountPaise) || amountPaise < 100) {
                throw new Error("Minimum top-up is ₹1");
            }
            const updated = walletService.topUp(userId, amountPaise);
            setWallet(updated);
            setTransactions(walletService.getTransactions(userId));
            toast({ title: `✅ ₹${topupAmount} added to wallet!`, description: `New balance: ${formatPaise(updated.balance_paise)}` });
            setShowTopup(false);
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
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

            {/* No wallet — create flow */}
            <AnimatePresence>
                {!loading && !wallet && showCreate && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-8 neon-border">
                        <h3 className="mb-2 font-display text-xl font-bold text-foreground">Create Your Wallet</h3>
                        <p className="mb-6 text-sm text-muted-foreground">Choose a display name and create your Pulse Pay wallet (ID: PPW-XXXXXXXX)</p>

                        <div className="mb-4">
                            <label className="mb-1 block text-xs text-muted-foreground">Display Name (optional)</label>
                            <input
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
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
                    {/* BG pattern */}
                    <div className="absolute inset-0 opacity-5 bg-gradient-to-br from-primary to-purple-600 pointer-events-none" />

                    <div className="relative">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest">Pulse Pay Wallet</p>
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
                        onClick={e => { if (e.target === e.currentTarget) { setShowTopup(false); setShowPinUI(false); } }}
                    >
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm glass rounded-2xl p-6">
                            {showPinUI ? (
                                /* ── Simulated UPI PIN Entry ── */
                                <div className="text-center">
                                    <div className="mb-4 flex justify-center">
                                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20">
                                            <Smartphone className="h-8 w-8 text-blue-400" />
                                        </div>
                                    </div>
                                    <h3 className="mb-1 font-display text-lg font-bold text-foreground">Enter UPI PIN</h3>
                                    <p className="mb-2 text-xs text-muted-foreground">Authenticating with your bank</p>
                                    <p className="mb-4 text-sm font-medium text-foreground">₹{topupAmount} → Pulse Pay Wallet</p>

                                    {/* PIN dots */}
                                    <div className="flex items-center justify-center gap-3 mb-6">
                                        {[0, 1, 2, 3, 4, 5].map(i => (
                                            <div key={i} className={`h-4 w-4 rounded-full border-2 transition-all ${i < pin.length ? "bg-primary border-primary scale-110" : "border-muted-foreground"
                                                }`} />
                                        ))}
                                    </div>

                                    {/* Numeric keypad */}
                                    <div className="grid grid-cols-3 gap-2 mb-4 max-w-xs mx-auto">
                                        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) => (
                                            <button
                                                key={i}
                                                disabled={pinVerifying}
                                                onClick={() => {
                                                    if (k === "⌫") setPin(p => p.slice(0, -1));
                                                    else if (k && pin.length < 6) setPin(p => p + k);
                                                }}
                                                className={`rounded-xl py-3 text-lg font-semibold transition-all ${k ? "bg-secondary hover:bg-primary/20 text-foreground" : "opacity-0"}`}
                                            >{k}</button>
                                        ))}
                                    </div>

                                    <button
                                        onClick={submitPin} disabled={pinVerifying || pin.length < 4}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                                    >
                                        {pinVerifying ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</> : <><CheckCircle2 className="h-4 w-4" />Confirm Payment</>}
                                    </button>
                                </div>
                            ) : (
                                /* ── Top-up Options ── */
                                <>
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
                                                <button key={a} onClick={() => setTopupAmount(a)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${topupAmount === a ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>₹{a}</button>
                                            ))}
                                        </div>
                                    </div>

                                    <p className="mb-3 text-xs text-muted-foreground font-medium uppercase tracking-wide">Pay with</p>
                                    <div className="space-y-3 mb-4">
                                        {/* Demo UPI PIN simulation */}
                                        <button
                                            onClick={simulateUPITopup}
                                            className="flex w-full items-center gap-4 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-left transition hover:bg-blue-500/10"
                                        >
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20">
                                                <Smartphone className="h-5 w-5 text-blue-400" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-foreground text-sm">UPI Payment (Demo)</p>
                                                <p className="text-xs text-muted-foreground">Enter any 4+ digit PIN to confirm</p>
                                            </div>
                                        </button>
                                    </div>

                                    <button onClick={() => setShowTopup(false)} className="w-full rounded-xl border border-border py-2.5 text-sm text-muted-foreground hover:text-foreground">
                                        Cancel
                                    </button>
                                </>
                            )}
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
