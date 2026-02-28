/**
 * CameraQR.tsx — QR Scanner with Three Modes
 *
 * 1. 📷 PHOTO CAPTURE (works on HTTP over LAN) — opens native camera app,
 *    user takes a photo of the QR, html5-qrcode decodes it from the image file.
 *    This is the recommended mode for phone testing over local network.
 *
 * 2. 🎥 LIVE CAMERA — getUserMedia continuous scan. Requires HTTPS or localhost.
 *    Shows a clear "requires HTTPS" message otherwise.
 *
 * 3. 🧪 DEMO BUTTONS — no camera needed, for laptop testing.
 *
 * Flow:
 *   Scan START QR  →  POST /api/start-session  →  redirect to /customer
 *   Scan STOP QR   →  POST /api/stop-session   →  POST /api/pay-wallet  →  /customer
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Html5Qrcode } from "html5-qrcode";
import {
    QrCode, Camera, CameraOff, Play, Square, Loader2,
    Zap, ArrowLeft, ImagePlus, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const DEMO_MERCHANT_ID = "m_demo_gym001";
const DEMO_SERVICE_TYPE = "gym";

const startQRPayload = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "start" }));
const stopQRPayload = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "stop" }));

// Check if running on HTTPS or localhost (camera live scan requires secure context)
const isSecureContext = window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

export default function CameraQR() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [scanning, setScanning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [camError, setCamError] = useState<string | null>(null);
    const [lastScan, setLastScan] = useState<string | null>(null);
    const [mode, setMode] = useState<"photo" | "live" | "demo">("photo");

    const html5QrRef = useRef<Html5Qrcode | null>(null);
    const processingRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const userId = user?.id || "user_demo_customer";

    // ── Core scan handler (same for all 3 modes) ───────────────────────────────
    async function handleScan(raw: string) {
        if (processingRef.current) return;
        processingRef.current = true;

        let decoded: any;
        try { decoded = JSON.parse(atob(raw.trim())); }
        catch {
            try { decoded = JSON.parse(raw.trim()); }
            catch {
                toast({ title: "❌ Invalid QR code", variant: "destructive" });
                processingRef.current = false;
                return;
            }
        }

        const { merchantId, serviceType, action } = decoded || {};
        if (!merchantId || !action) {
            toast({ title: "❌ Unknown QR format", variant: "destructive" });
            processingRef.current = false;
            return;
        }

        setLastScan(action);
        setLoading(true);
        // Stop live camera before API call if running
        if (scanning) await stopCamera();

        try {
            if (action === "start") {
                const res = await fetch(`${API_URL}/api/start-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId, serviceType }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to start session");
                toast({
                    title: "▶️ Session Started!",
                    description: `${data.merchant?.name} — ₹${(data.merchant?.price_per_minute_paise / 100).toFixed(0)}/min`,
                });
                navigate("/customer");

            } else if (action === "stop") {
                const stopRes = await fetch(`${API_URL}/api/stop-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId }),
                });
                const stopData = await stopRes.json();
                if (!stopRes.ok) throw new Error(stopData.error || "Failed to stop session");

                const { finalAmountPaise, session } = stopData;

                if (!finalAmountPaise || finalAmountPaise <= 0) {
                    toast({ title: "⏹ Session stopped", description: "No charges" });
                    navigate("/customer");
                    return;
                }

                // Pay via server — emits payment:success to merchant + customer
                const payRes = await fetch(`${API_URL}/api/pay-wallet`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, sessionId: session?.id }),
                });
                const payData = await payRes.json();
                if (!payRes.ok) throw new Error(payData.error || "Payment failed");

                toast({
                    title: `✅ ₹${(finalAmountPaise / 100).toFixed(2)} paid!`,
                    description: "Session ended · Merchant notified",
                });
                navigate("/customer");
            }
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
            setTimeout(() => { processingRef.current = false; }, 3000);
        }
    }

    // ── PHOTO MODE: file input → scanFile ──────────────────────────────────────
    async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        // Reset so same file can be re-selected
        e.target.value = "";

        setLoading(true);
        const tempId = `qr-file-${Date.now()}`;
        const div = document.createElement("div");
        div.id = tempId;
        div.style.display = "none";
        document.body.appendChild(div);

        try {
            const qr = new Html5Qrcode(tempId);
            const result = await qr.scanFile(file, false);
            await qr.clear();
            document.body.removeChild(div);
            await handleScan(result);
        } catch {
            document.body.removeChild(div);
            setLoading(false);
            toast({ title: "❌ No QR found in photo", description: "Make sure the QR code is clear and centred", variant: "destructive" });
        }
    }

    // ── LIVE MODE: getUserMedia continuous scan ────────────────────────────────
    async function startCamera() {
        setCamError(null);
        if (!isSecureContext) {
            setCamError("Live camera requires HTTPS. Use Photo mode instead.");
            return;
        }
        try {
            const qr = new Html5Qrcode("qr-reader");
            html5QrRef.current = qr;
            await qr.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 220, height: 220 } },
                (decoded) => {
                    if (!processingRef.current) handleScan(decoded);
                },
                () => { } // frame errors are expected
            );
            setScanning(true);
        } catch (e: any) {
            const msg = e?.message || "Camera unavailable";
            setCamError(msg.includes("NotAllowed")
                ? "Camera permission denied. Allow camera in browser settings."
                : msg.includes("NotFound")
                    ? "No camera found on this device."
                    : `Camera error: ${msg}`
            );
        }
    }

    async function stopCamera() {
        if (html5QrRef.current?.isScanning) {
            await html5QrRef.current.stop();
            html5QrRef.current.clear();
        }
        setScanning(false);
    }

    useEffect(() => () => { stopCamera(); }, []);

    return (
        <div className="flex min-h-screen flex-col bg-background">

            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border p-4 bg-card">
                <button onClick={() => { stopCamera(); navigate(-1); }} className="rounded-xl p-2 hover:bg-muted">
                    <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </button>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                    <h1 className="font-display text-lg font-bold text-foreground">Scan QR Code</h1>
                    <p className="text-xs text-muted-foreground">Start or stop a pay-as-you-use session</p>
                </div>
            </div>

            <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4">

                {/* Mode tabs */}
                <div className="flex gap-1 rounded-xl bg-secondary p-1">
                    {[
                        { id: "photo", label: "📷 Photo", desc: "Works on HTTP" },
                        { id: "live", label: "🎥 Live", desc: "Needs HTTPS" },
                        { id: "demo", label: "🧪 Demo", desc: "No camera" },
                    ].map(m => (
                        <button key={m.id}
                            onClick={() => { if (scanning) stopCamera(); setMode(m.id as any); setCamError(null); }}
                            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${mode === m.id ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
                            {m.label}
                            <span className="block text-[10px] font-normal opacity-70">{m.desc}</span>
                        </button>
                    ))}
                </div>

                {/* Loading overlay */}
                <AnimatePresence>
                    {loading && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="glass rounded-2xl p-4 flex items-center gap-3 border border-primary/30">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            <div>
                                <p className="text-sm font-bold text-foreground">
                                    {lastScan === "start" ? "Starting session…" : "Processing payment…"}
                                </p>
                                <p className="text-xs text-muted-foreground">Please wait</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── PHOTO MODE ──────────────────────────────────────────────────── */}
                {mode === "photo" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                        <div className="glass rounded-2xl p-6 text-center space-y-4">
                            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-2xl bg-primary/10">
                                <ImagePlus className="h-10 w-10 text-primary" />
                            </div>
                            <div>
                                <p className="font-display text-lg font-bold text-foreground">Take a Photo of the QR</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Your phone camera will open. Point it at the merchant's QR code and capture.
                                </p>
                            </div>

                            {/* Hidden file input for camera capture */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={handlePhotoCapture}
                            />

                            <div className="grid gap-3">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={loading}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-bold text-primary-foreground hover:neon-glow disabled:opacity-50"
                                >
                                    <Camera className="h-5 w-5" />
                                    Open Camera &amp; Scan QR
                                </button>

                                {/* Also allow picking from gallery */}
                                <input
                                    type="file"
                                    accept="image/*"
                                    id="gallery-upload"
                                    className="hidden"
                                    onChange={handlePhotoCapture}
                                />
                                <label htmlFor="gallery-upload"
                                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-bold text-muted-foreground hover:bg-muted cursor-pointer">
                                    <QrCode className="h-4 w-4" />
                                    Upload from Gallery
                                </label>
                            </div>

                            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-left space-y-1">
                                <p className="text-xs font-semibold text-primary">📋 How to use</p>
                                <p className="text-xs text-muted-foreground">1. Tap "Open Camera" above</p>
                                <p className="text-xs text-muted-foreground">2. Point at the merchant's START or STOP QR code</p>
                                <p className="text-xs text-muted-foreground">3. Capture the photo — session starts/stops automatically</p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ── LIVE CAMERA MODE ────────────────────────────────────────────── */}
                {mode === "live" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                        {!isSecureContext && (
                            <div className="glass rounded-2xl p-4 border border-yellow-500/30 bg-yellow-500/5">
                                <p className="text-sm font-bold text-yellow-400">⚠️ HTTPS Required</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Live camera scanning requires a secure connection (HTTPS). You're on HTTP over LAN.
                                    <strong className="text-foreground"> Use "Photo" mode instead</strong> — it works perfectly on HTTP.
                                </p>
                            </div>
                        )}

                        <div className="glass rounded-2xl overflow-hidden relative">
                            <div id="qr-reader" className="w-full bg-black/90" style={{ minHeight: 280 }}></div>
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                {!scanning && !camError && (
                                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                        <Camera className="h-12 w-12 opacity-40" />
                                        <p className="text-sm">Camera not started</p>
                                    </div>
                                )}
                                {camError && (
                                    <div className="flex flex-col items-center gap-3 text-destructive p-6 text-center pointer-events-auto">
                                        <CameraOff className="h-10 w-10" />
                                        <p className="text-sm font-medium">{camError}</p>
                                    </div>
                                )}
                                {scanning && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                        <div className="h-48 w-48 rounded-2xl border-2 border-primary/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            {!scanning ? (
                                <button onClick={startCamera}
                                    disabled={!isSecureContext}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground hover:neon-glow disabled:opacity-40">
                                    <Camera className="h-5 w-5" />Start Live Camera
                                </button>
                            ) : (
                                <button onClick={stopCamera}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/20 border border-destructive/40 py-3 font-bold text-destructive">
                                    <CameraOff className="h-5 w-5" />Stop Camera
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* ── DEMO BUTTONS MODE ────────────────────────────────────────────── */}
                {mode === "demo" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-2xl p-5 space-y-4">
                        <div>
                            <p className="font-display font-semibold text-foreground">Demo Scan (No Camera)</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Simulates scanning the merchant's QR code</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleScan(startQRPayload)}
                                disabled={loading}
                                className="flex flex-col items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 p-5 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-50"
                            >
                                <Play className="h-7 w-7" />
                                Demo START
                            </button>
                            <button
                                onClick={() => handleScan(stopQRPayload)}
                                disabled={loading}
                                className="flex flex-col items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/30 p-5 text-sm font-bold text-destructive hover:bg-destructive/20 disabled:opacity-50"
                            >
                                <Square className="h-7 w-7" />
                                Demo STOP
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                            Uses the demo merchant (PowerZone Gym)
                        </p>
                    </motion.div>
                )}

                {/* Scan result badge */}
                <AnimatePresence>
                    {lastScan && !loading && (
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                            className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/30 px-4 py-3">
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                            <span className="text-sm text-green-400 font-medium">
                                QR scanned — {lastScan === "start" ? "session started" : "session stopped & paid"}
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

            </main>
        </div>
    );
}
