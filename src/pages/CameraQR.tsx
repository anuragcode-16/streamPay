/**
 * CameraQR.tsx — Real Camera QR Scanner
 *
 * Uses html5-qrcode (MediaDevices API) to scan merchant QR codes via the
 * device camera (works on phone browsers on the same local WiFi / ngrok URL).
 *
 * Flow:
 *   Scan START QR  →  POST /api/start-session  →  redirect to /customer
 *   Scan STOP QR   →  POST /api/stop-session   →  open Razorpay or wallet-pay
 *
 * Demo fallback: tap "Demo Start" / "Demo Stop" buttons without needing camera.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Html5Qrcode } from "html5-qrcode";
import { QrCode, Camera, CameraOff, Play, Square, Loader2, Zap, Wallet, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import walletService from "@/services/walletService";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const RZP_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_SLAzRB6IuBdDcI";
const DEMO_MERCHANT_ID = "m_demo_gym001";
const DEMO_SERVICE_TYPE = "gym";

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

const startQRPayload = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "start" }));
const stopQRPayload = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "stop" }));

export default function CameraQR() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [scanning, setScanning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [camError, setCamError] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<string | null>(null);

    const html5QrRef = useRef<Html5Qrcode | null>(null);
    const processingRef = useRef(false);  // debounce duplicate scans

    const userId = user?.id || "user_demo_customer";

    // ── Start / stop camera ────────────────────────────────────────────────────
    async function startCamera() {
        setCamError(null);
        try {
            const qr = new Html5Qrcode("qr-reader");
            html5QrRef.current = qr;
            await qr.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 240, height: 240 } },
                (decoded) => {
                    if (!processingRef.current) {
                        processingRef.current = true;
                        setLastResult(decoded);
                        handleScan(decoded).finally(() => setTimeout(() => { processingRef.current = false; }, 3000));
                    }
                },
                () => { }   // errors are expected while scanning
            );
            setScanning(true);
        } catch (e: any) {
            setCamError(e?.message || "Camera unavailable");
        }
    }

    async function stopCamera() {
        if (html5QrRef.current?.isScanning) {
            await html5QrRef.current.stop();
            html5QrRef.current.clear();
        }
        setScanning(false);
    }

    // Clean up on unmount
    useEffect(() => () => { stopCamera(); }, []);

    // ── Core scan handler ──────────────────────────────────────────────────────
    async function handleScan(raw: string) {
        let decoded: any;
        try { decoded = JSON.parse(atob(raw.trim())); }
        catch {
            try { decoded = JSON.parse(raw.trim()); }
            catch { toast({ title: "Invalid QR", variant: "destructive" }); return; }
        }
        const { merchantId, serviceType, action } = decoded || {};
        if (!merchantId || !action) { toast({ title: "Unknown QR format", variant: "destructive" }); return; }

        setLoading(true);
        try {
            if (action === "start") {
                await stopCamera();
                const res = await fetch(`${API_URL}/api/start-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId, serviceType }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to start");
                toast({ title: "▶️ Session Started!", description: `${data.merchant?.name} — ₹${data.merchant?.price_per_minute_paise / 100}/min` });
                navigate("/customer");

            } else if (action === "stop") {
                await stopCamera();
                const res = await fetch(`${API_URL}/api/stop-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to stop");

                const finalPaise: number = data.finalAmountPaise ?? 0;

                if (finalPaise <= 0) {
                    toast({ title: "Session stopped", description: "No charges" });
                    navigate("/customer");
                    return;
                }

                // ── Payment: try wallet first, fallback to Razorpay ─────────────────
                await openPaymentFlow(data.session?.id || decoded.sessionId, finalPaise);
            }
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }

    // ── Payment choice: wallet deduct → Razorpay fallback ─────────────────────
    async function openPaymentFlow(sessionId: string, finalPaise: number) {
        const walletBalance = walletService.getBalance(userId);

        if (walletBalance >= finalPaise) {
            try {
                const updated = walletService.debit(userId, finalPaise, sessionId, "Merchant");
                toast({
                    title: `✅ ₹${(finalPaise / 100).toFixed(2)} paid from wallet`,
                    description: `New balance: ₹${(updated.balance_paise / 100).toFixed(2)}`,
                });
                navigate("/customer");
            } catch (e: any) {
                toast({ title: "Wallet error", description: e.message, variant: "destructive" });
            }
            return;
        }

        // Not enough wallet — open Razorpay directly (no backend order needed)
        try {
            const loaded = await loadRazorpay();
            if (!loaded) throw new Error("Razorpay script failed");

            await new Promise<void>(resolve => {
                const rzp = new window.Razorpay({
                    key: RZP_KEY,
                    amount: finalPaise,
                    currency: "INR",
                    name: "Pulse Pay",
                    description: `Session #${sessionId.slice(0, 8)}`,
                    theme: { color: "#6366f1" },
                    prefill: { name: user?.email || "", vpa: "success@razorpay" },
                    config: {
                        display: {
                            blocks: {
                                upi: { name: "Pay via UPI", instruments: [{ method: "upi" }] },
                                card: { name: "Pay via Card", instruments: [{ method: "card" }] },
                            },
                            sequence: ["block.upi", "block.card"],
                            preferences: { show_default_blocks: false },
                        },
                    },
                    handler: (response: any) => {
                        toast({ title: "💚 Payment Successful!", description: `ID: ${response.razorpay_payment_id}` });
                        resolve();
                        navigate("/customer");
                    },
                    modal: { ondismiss: () => { toast({ title: "Payment cancelled", variant: "destructive" }); resolve(); } },
                });
                rzp.open();
            });
        } catch (e: any) {
            toast({ title: "Payment error", description: e.message, variant: "destructive" });
        }
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border p-4">
                <button onClick={() => { stopCamera(); navigate(-1); }} className="rounded-xl p-2 hover:bg-muted">
                    <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </button>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                    <h1 className="font-display text-lg font-bold text-foreground">Scan QR Code</h1>
                    <p className="text-xs text-muted-foreground">Point your camera at a merchant QR</p>
                </div>
            </div>

            <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4">

                {/* Camera viewfinder */}
                <div className="glass rounded-2xl overflow-hidden">
                    <div
                        id="qr-reader"
                        className="w-full aspect-square bg-black/90 relative flex items-center justify-center"
                        style={{ minHeight: 280 }}
                    >
                        {!scanning && !camError && (
                            <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                <Camera className="h-12 w-12 opacity-40" />
                                <p className="text-sm">Camera not started</p>
                            </div>
                        )}
                        {camError && (
                            <div className="flex flex-col items-center gap-3 text-destructive p-6 text-center">
                                <CameraOff className="h-10 w-10" />
                                <p className="text-sm font-medium">{camError}</p>
                                <p className="text-xs text-muted-foreground">Use the demo buttons below</p>
                            </div>
                        )}
                        {scanning && (
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                <div className="h-48 w-48 rounded-2xl border-2 border-primary/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                            </div>
                        )}
                    </div>

                    {/* Camera controls */}
                    <div className="p-4">
                        {!scanning ? (
                            <button
                                onClick={startCamera}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground hover:neon-glow"
                            >
                                <Camera className="h-5 w-5" />Start Camera
                            </button>
                        ) : (
                            <button
                                onClick={stopCamera}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/20 border border-destructive/40 py-3 font-bold text-destructive"
                            >
                                <CameraOff className="h-5 w-5" />Stop Camera
                            </button>
                        )}
                    </div>
                </div>

                {/* Processing indicator */}
                <AnimatePresence>
                    {loading && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="glass rounded-2xl p-4 flex items-center gap-3">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            <span className="text-sm text-foreground">Processing session…</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Demo buttons — works on laptop without camera */}
                <div className="glass rounded-2xl p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                        🧪 Demo Buttons (no camera needed)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => handleScan(startQRPayload)}
                            disabled={loading}
                            className="flex flex-col items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 p-4 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-50"
                        >
                            <Play className="h-6 w-6" />
                            Demo START
                        </button>
                        <button
                            onClick={() => handleScan(stopQRPayload)}
                            disabled={loading}
                            className="flex flex-col items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/30 p-4 text-sm font-bold text-destructive hover:bg-destructive/20 disabled:opacity-50"
                        >
                            <Square className="h-6 w-6" />
                            Demo STOP
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 text-center">
                        On phone: start the camera and point at the merchant's QR code
                    </p>
                </div>

                {/* Instructions */}
                <div className="glass rounded-2xl p-5 space-y-3">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <QrCode className="h-4 w-4 text-primary" />Using on your phone?
                    </p>
                    <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                        <li>Open the app URL on your phone (same WiFi or ngrok link)</li>
                        <li>Log in as customer</li>
                        <li>Tap "Scan QR Code" in the sidebar</li>
                        <li>Allow camera access and point at the START QR on the merchant screen</li>
                        <li>When done, point at the STOP QR — payment initiates automatically</li>
                    </ol>
                </div>

            </main>
        </div>
    );
}
