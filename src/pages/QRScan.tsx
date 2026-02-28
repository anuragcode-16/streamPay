/**
 * QRScan.tsx — QR Scan Simulation + Manual Payload Entry
 *
 * In a real mobile app you'd use a camera-based QR scanner.
 * For the web demo we display the QR code and allow the customer to:
 *   1. Click a pre-filled button (demo start / demo stop)
 *   2. Paste a raw base64 payload manually
 *
 * On scan (action = "start"):  → POST /api/start-session
 * On scan (action = "stop"):   → POST /api/stop-session → open Razorpay Checkout
 */
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import QRCode from "react-qr-code";
import { QrCode, Play, Square, Loader2, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const DEMO_MERCHANT_ID = "m_demo_gym001";
const DEMO_SERVICE_TYPE = "gym";

declare global {
    interface Window {
        Razorpay: any;
    }
}

/** Load Razorpay Checkout.js script once */
function loadRazorpay(): Promise<boolean> {
    return new Promise((resolve) => {
        if (window.Razorpay) return resolve(true);
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
}

export default function QRScan() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [loading, setLoading] = useState(false);
    const [payload, setPayload] = useState("");
    const [activeSession, setActiveSession] = useState<any>(null);

    // Pre-fill from URL ?payload=<base64>
    useEffect(() => {
        const p = searchParams.get("payload");
        if (p) setPayload(p);
    }, [searchParams]);

    const userId = user?.id || "user_demo_customer";

    // Build demo QR payloads
    const startQRData = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "start" }));
    const stopQRData = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "stop" }));

    async function handleScan(qrPayload: string) {
        if (!qrPayload.trim()) {
            toast({ title: "Enter a QR payload first", variant: "destructive" });
            return;
        }

        let decoded: any;
        try {
            decoded = JSON.parse(atob(qrPayload.trim()));
        } catch {
            try { decoded = JSON.parse(qrPayload.trim()); } catch {
                toast({ title: "Invalid QR payload", variant: "destructive" });
                return;
            }
        }

        setLoading(true);
        try {
            if (decoded.action === "start") {
                const res = await fetch(`${API_URL}/api/start-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId: decoded.merchantId, serviceType: decoded.serviceType, email: user?.email }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to start session");
                setActiveSession(data.session);
                toast({ title: "✅ Session Started!", description: `${data.merchant.name} — ₹${data.merchant.price_per_minute_paise / 100}/min` });
                navigate("/customer");

            } else if (decoded.action === "stop") {
                const res = await fetch(`${API_URL}/api/stop-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId: decoded.merchantId }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to stop session");

                const { finalAmountPaise, session } = data;
                if (!finalAmountPaise || finalAmountPaise <= 0) {
                    toast({ title: "Session stopped", description: "No charges (empty ledger)" });
                    navigate("/customer");
                    return;
                }

                // Pay via server wallet — emits payment:success to merchant + customer
                const payRes = await fetch(`${API_URL}/api/pay-wallet`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, sessionId: session?.id }),
                });
                const payData = await payRes.json();
                if (!payRes.ok) throw new Error(payData.error || "Payment failed");
                toast({ title: `✅ ₹${(finalAmountPaise / 100).toFixed(2)} paid from wallet!`, description: "Payment confirmed" });
                navigate("/customer");
            }
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen bg-background">
            <main className="flex-1 p-8 max-w-2xl mx-auto">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>

                    {/* Header */}
                    <div className="mb-8 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                            <Zap className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div>
                            <h1 className="font-display text-2xl font-bold text-foreground">Scan QR Code</h1>
                            <p className="text-sm text-muted-foreground">Start or stop a pay-as-you-use session</p>
                        </div>
                    </div>

                    {/* Demo QR Codes */}
                    <div className="mb-8 grid gap-4 sm:grid-cols-2">
                        {[
                            { label: "START Session", qr: startQRData, action: "start", color: "bg-primary" },
                            { label: "STOP Session", qr: stopQRData, action: "stop", color: "bg-destructive" },
                        ].map(({ label, qr, action, color }) => (
                            <div key={action} className="glass rounded-2xl p-5 text-center">
                                <p className="mb-3 text-sm font-semibold text-muted-foreground">{label}</p>
                                <div className="mb-4 flex justify-center rounded-xl bg-white p-3">
                                    <QRCode value={qr} size={140} />
                                </div>
                                <button
                                    onClick={() => handleScan(qr)}
                                    disabled={loading}
                                    className={`flex w-full items-center justify-center gap-2 rounded-xl ${color} px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50`}
                                >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : action === "start" ? <Play className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                    Simulate {label}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Manual payload entry */}
                    <div className="glass rounded-2xl p-6">
                        <div className="mb-3 flex items-center gap-2">
                            <QrCode className="h-5 w-5 text-primary" />
                            <h3 className="font-display font-semibold text-foreground">Manual QR Payload</h3>
                        </div>
                        <p className="mb-3 text-xs text-muted-foreground">
                            Paste a Base64-encoded QR payload (e.g. from <code className="rounded bg-muted px-1">/scan?payload=…</code>)
                        </p>
                        <textarea
                            value={payload}
                            onChange={(e) => setPayload(e.target.value)}
                            placeholder="eyJtZXJjaGFudElkIjoibV9kZW1vX2d5bTAwMSIsInNlcnZpY2VUeXBlIjoiZ3ltIiwiYWN0aW9uIjoic3RhcnQifQ=="
                            rows={3}
                            className="w-full rounded-xl border border-border bg-secondary px-4 py-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                        <button
                            onClick={() => handleScan(payload)}
                            disabled={loading || !payload.trim()}
                            className="mt-3 flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:neon-glow disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                            Process Payload
                        </button>
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
