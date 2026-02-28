/**
 * InvoicePage.tsx — Downloadable Session Invoice
 *
 * Route: /invoice/:sessionId
 * Fetches GET /api/invoice/:sessionId → structured JSON
 * Renders a printable/downloadable receipt
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Download, ArrowLeft, Zap, CheckCircle2, Clock, MapPin, Hash, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

interface Invoice {
    invoiceId: string; generatedAt: string;
    merchant: { name: string; serviceType: string; location: string };
    session: {
        id: string; startedAt: string; endedAt: string;
        durationSec: number | null; finalAmountPaise: number;
        finalAmountINR: string; status: string; paymentStatus: string;
    };
    ledgerSummary: { totalTicks: number; totalDebitedPaise: number };
    payment: any;
}

export default function InvoicePage() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { if (sessionId) fetchInvoice(); }, [sessionId]);

    async function fetchInvoice() {
        try {
            const res = await fetch(`${API_URL}/api/invoice/${sessionId}`);
            if (!res.ok) throw new Error("Invoice not found");
            const data = await res.json();
            setInvoice(data);
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally { setLoading(false); }
    }

    function downloadJSON() {
        if (!invoice) return;
        const blob = new Blob([JSON.stringify(invoice, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${invoice.invoiceId}.json`; a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Invoice downloaded!" });
    }

    if (loading) return (
        <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />Loading invoice…
        </div>
    );

    if (!invoice) return (
        <div className="text-center py-20 text-muted-foreground">Invoice not found.</div>
    );

    const { session, merchant, ledgerSummary, payment } = invoice;
    const durMins = Math.floor((session.durationSec || 0) / 60);
    const durSecs = (session.durationSec || 0) % 60;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-lg mx-auto space-y-4"
        >
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" />Back
                </button>
                <button
                    onClick={downloadJSON}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:neon-glow"
                >
                    <Download className="h-4 w-4" />Download JSON
                </button>
            </div>

            {/* Invoice card */}
            <div className="glass rounded-2xl p-6 print:shadow-none">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                            <Zap className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div>
                            <p className="font-display text-lg font-bold text-foreground">PULSE<span className="neon-text">PAY</span></p>
                            <p className="text-xs text-muted-foreground">Tax Invoice</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="font-mono text-sm font-bold text-primary">{invoice.invoiceId}</p>
                        <p className="text-xs text-muted-foreground">{new Date(invoice.generatedAt).toLocaleDateString("en-IN")}</p>
                    </div>
                </div>

                {/* Merchant info */}
                <div className="mb-5 rounded-xl bg-secondary/40 p-4">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Service Provider</p>
                    <p className="font-display font-bold text-foreground text-lg">{merchant.name}</p>
                    <p className="text-sm text-muted-foreground capitalize">{merchant.serviceType}</p>
                    {merchant.location && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3" />{merchant.location}
                        </p>
                    )}
                </div>

                {/* Session details */}
                <div className="space-y-3 mb-5">
                    {[
                        { label: "Session ID", value: session.id?.slice(0, 16) + "…", icon: Hash },
                        { label: "Started", value: new Date(session.startedAt).toLocaleString("en-IN"), icon: Clock },
                        { label: "Ended", value: session.endedAt ? new Date(session.endedAt).toLocaleString("en-IN") : "—", icon: Clock },
                        { label: "Duration", value: `${durMins}m ${durSecs}s`, icon: Clock },
                        { label: "Debit Ticks", value: `${ledgerSummary.totalTicks} ticks (₹${(ledgerSummary.totalDebitedPaise / 100).toFixed(2)})`, icon: Zap },
                    ].map(({ label, value, icon: Icon }) => (
                        <div key={label} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-muted-foreground">
                                <Icon className="h-3.5 w-3.5" />{label}
                            </span>
                            <span className="font-medium text-foreground font-mono text-xs">{value}</span>
                        </div>
                    ))}
                </div>

                {/* Grand total */}
                <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 mb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Total Charged</p>
                            <p className="text-xs text-muted-foreground">(sum of ledger ticks)</p>
                        </div>
                        <p className="font-display text-3xl font-bold text-gradient">₹{session.finalAmountINR}</p>
                    </div>
                </div>

                {/* Payment status */}
                <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${session.paymentStatus === "paid"
                        ? "bg-green-500/10 border border-green-500/20"
                        : "bg-yellow-500/10 border border-yellow-500/20"
                    }`}>
                    <div className="flex items-center gap-2">
                        {session.paymentStatus === "paid"
                            ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                            : <Clock className="h-4 w-4 text-yellow-400" />}
                        <span className="text-sm font-medium text-foreground capitalize">{session.paymentStatus}</span>
                    </div>
                    {payment && (
                        <p className="font-mono text-xs text-muted-foreground">{payment.payment_id}</p>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-6 pt-4 border-t border-border text-center">
                    <p className="text-xs text-muted-foreground">Thank you for using Steam Pay · STEAMPAY.test</p>
                    <p className="text-xs text-muted-foreground mt-0.5">This is a computer-generated invoice. No signature required.</p>
                </div>
            </div>
        </motion.div>
    );
}
