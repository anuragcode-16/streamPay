/**
 * PaymentChoiceModal.tsx — Pay with Wallet OR Razorpay
 *
 * Shown after stop-session when finalAmountPaise > 0.
 * Handles:
 *  - Wallet payment (POST /api/pay-wallet)
 *  - Razorpay checkout (POST /api/create-order → Razorpay Checkout JS)
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Wallet, CreditCard, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

declare global { interface Window { Razorpay: any; } }

function loadRazorpay(): Promise<boolean> {
    return new Promise((resolve) => {
        if (window.Razorpay) return resolve(true);
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.body.appendChild(s);
    });
}

interface PaymentChoiceProps {
    stopData: {
        session: { id: string };
        finalAmountPaise: number;
        durationSec: number;
        walletBalance: number;
        canPayWallet: boolean;
    };
    userId: string;
    onClose: () => void;
}

export default function PaymentChoiceModal({ stopData, userId, onClose }: PaymentChoiceProps) {
    const { toast } = useToast();
    const [paying, setPaying] = useState<"wallet" | "razorpay" | null>(null);
    const [paid, setPaid] = useState(false);

    const { session, finalAmountPaise, durationSec, walletBalance, canPayWallet } = stopData;
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;

    async function payWithWallet() {
        setPaying("wallet");
        try {
            const res = await fetch(`${API_URL}/api/pay-wallet`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, sessionId: session.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setPaid(true);
            toast({ title: "✅ Paid from Wallet!", description: `₹${(finalAmountPaise / 100).toFixed(2)} deducted. New balance: ₹${((data.newBalancePaise || 0) / 100).toFixed(2)}` });
            setTimeout(onClose, 2500);
        } catch (err: any) {
            toast({ title: "Wallet payment failed", description: err.message, variant: "destructive" });
        } finally { setPaying(null); }
    }

    async function payWithRazorpay() {
        setPaying("razorpay");
        try {
            const res = await fetch(`${API_URL}/api/create-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: session.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            const ok = await loadRazorpay();
            if (!ok) throw new Error("Razorpay checkout failed to load");

            await new Promise<void>((resolve) => {
                const rzp = new window.Razorpay({
                    key: import.meta.env.VITE_RAZORPAY_KEY_ID,
                    order_id: data.order.id,
                    amount: data.amountPaise,
                    currency: "INR",
                    name: "Stream Pay",
                    description: `Session #${session.id?.slice(0, 8)}`,
                    prefill: { email: "" },
                    theme: { color: "#6366f1" },
                    handler: () => {
                        toast({ title: "💳 Payment submitted!", description: "Waiting for webhook confirmation…" });
                        resolve();
                        setTimeout(onClose, 1500);
                    },
                    modal: { ondismiss: () => { resolve(); } },
                });
                rzp.open();
            });
        } catch (err: any) {
            toast({ title: "Razorpay error", description: err.message, variant: "destructive" });
        } finally { setPaying(null); }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget && !paying) onClose(); }}
        >
            <motion.div
                initial={{ scale: 0.9, y: 30, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                className="w-full max-w-sm glass rounded-2xl p-6"
            >
                {paid ? (
                    <div className="flex flex-col items-center py-6 text-center">
                        <CheckCircle2 className="h-16 w-16 text-green-400 mb-3" />
                        <h3 className="font-display text-xl font-bold text-foreground">Payment Successful!</h3>
                        <p className="text-sm text-muted-foreground mt-1">Session settled from wallet</p>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="font-display text-xl font-bold text-foreground">Session Complete</h3>
                                <p className="text-sm text-muted-foreground">Choose how to pay</p>
                            </div>
                            <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
                                <X className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </div>

                        {/* Summary card */}
                        <div className="mb-5 rounded-xl bg-secondary/60 p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground">Duration</span>
                                <span className="text-sm font-medium text-foreground">{mins}m {secs}s</span>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground">Total Amount</span>
                                <span className="font-display text-2xl font-bold text-gradient">₹{(finalAmountPaise / 100).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Wallet Balance</span>
                                <span className={`text-sm font-medium ${canPayWallet ? "text-green-400" : "text-yellow-400"}`}>
                                    ₹{(walletBalance / 100).toFixed(2)}
                                </span>
                            </div>
                        </div>

                        {/* Payment options */}
                        <div className="space-y-3">
                            {/* Wallet */}
                            <button
                                onClick={payWithWallet}
                                disabled={!canPayWallet || paying !== null}
                                className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${canPayWallet
                                        ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                                        : "border-border bg-secondary/30 opacity-50 cursor-not-allowed"
                                    }`}
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 shrink-0">
                                    {paying === "wallet" ? <Loader2 className="h-5 w-5 text-primary animate-spin" /> : <Wallet className="h-5 w-5 text-primary" />}
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground text-sm">Pay with Wallet</p>
                                    <p className="text-xs text-muted-foreground">
                                        {canPayWallet
                                            ? `Balance: ₹${(walletBalance / 100).toFixed(2)} — Instant debit`
                                            : "Insufficient wallet balance"}
                                    </p>
                                </div>
                            </button>

                            {/* Razorpay */}
                            <button
                                onClick={payWithRazorpay}
                                disabled={paying !== null}
                                className="flex w-full items-center gap-4 rounded-xl border border-[#2DD4BF]/30 bg-[#2DD4BF]/5 p-4 text-left transition hover:bg-[#2DD4BF]/10 disabled:opacity-50"
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2DD4BF]/20 shrink-0">
                                    {paying === "razorpay" ? <Loader2 className="h-5 w-5 text-[#2DD4BF] animate-spin" /> : <CreditCard className="h-5 w-5 text-[#2DD4BF]" />}
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground text-sm">Pay via Razorpay</p>
                                    <p className="text-xs text-muted-foreground">UPI · Cards · NetBanking — test VPA: <span className="font-mono text-primary">success@razorpay</span></p>
                                </div>
                            </button>
                        </div>

                        {!canPayWallet && (
                            <p className="mt-3 flex items-center gap-1.5 text-xs text-yellow-400">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Top up your wallet to pay directly next time
                            </p>
                        )}
                    </>
                )}
            </motion.div>
        </div>
    );
}
