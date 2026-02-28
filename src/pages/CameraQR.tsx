/**
 * CameraQR.tsx — Reliable QR Scanner (works on HTTP over LAN)
 *
 * Scan method:
 *  - Tap "Scan QR Code" → phone's native camera opens (input[capture])
 *  - Photo is decoded via jsQR (canvas-based, zero DOM dependencies, HTTP-safe)
 *  - Fallback "Live Camera" mode for HTTPS contexts
 *  - Demo buttons for laptop testing
 *
 * Session flow:
 *  START QR scanned → POST /api/start-session
 *  STOP  QR scanned → POST /api/stop-session → POST /api/pay-wallet
 *                   → payment:success emitted to merchant + customer
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import jsQR from "jsqr";
import {
    Camera, QrCode, Play, Square, Loader2,
    Zap, ArrowLeft, CheckCircle2, AlertCircle, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const DEMO_MERCHANT_ID = "m_demo_gym001";
const DEMO_SERVICE_TYPE = "gym";
const startQRPayload = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "start" }));
const stopQRPayload = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "stop" }));

// Live camera needs secure context (HTTPS or localhost)
const IS_SECURE = window.isSecureContext ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

// ── Decode QR from File using jsQR + Canvas ───────────────────────────────────
function decodeQRFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement("canvas");
            // Scale down very large images to speed up decode
            const maxDim = 1200;
            const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
            canvas.width = Math.round(img.naturalWidth * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });
            if (result) resolve(result.data);
            else reject(new Error("No QR code found. Make sure the QR is clear and fully visible in the photo."));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load image.")); };
        img.src = url;
    });
}

// ── Parse QR payload (base64 JSON or raw JSON) ────────────────────────────────
function parseQRPayload(raw: string): { merchantId: string; serviceType: string; action: string } | null {
    try { return JSON.parse(atob(raw.trim())); } catch { }
    try { return JSON.parse(raw.trim()); } catch { }
    return null;
}

type ScanStatus = "idle" | "scanning" | "success" | "error";

export default function CameraQR() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const userId = user?.id || "user_demo_customer";

    const [status, setStatus] = useState<ScanStatus>("idle");
    const [statusMsg, setStatusMsg] = useState("");
    const [lastAction, setLastAction] = useState<"start" | "stop" | null>(null);

    // Live camera refs
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const liveCanvas = useRef<HTMLCanvasElement | null>(null);
    const [liveCam, setLiveCam] = useState(false);
    const [liveCamErr, setLiveCamErr] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const processingRef = useRef(false);

    // ── Core action handler (shared by all scan modes) ────────────────────────
    async function executeAction(payload: { merchantId: string; serviceType: string; action: string }) {
        if (processingRef.current) return;
        processingRef.current = true;

        const { merchantId, serviceType, action } = payload;
        setLastAction(action as "start" | "stop");
        setStatus("scanning");
        setStatusMsg(action === "start" ? "Starting session…" : "Stopping session & processing payment…");

        // Stop live camera if running
        if (liveCam) stopLiveCamera();

        try {
            if (action === "start") {
                // ── START SESSION ─────────────────────────────────────────────
                const res = await fetch(`${API_URL}/api/start-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId, serviceType }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to start session");

                setStatus("success");
                setStatusMsg(`Session started at ${data.merchant?.name || merchantId}`);
                toast({
                    title: "▶️ Session Started!",
                    description: `${data.merchant?.name} · ₹${(data.merchant?.price_per_minute_paise / 100).toFixed(0)}/min`,
                });
                setTimeout(() => navigate("/customer"), 1200);

            } else if (action === "stop") {
                // ── STOP SESSION ─────────────────────────────────────────────
                const stopRes = await fetch(`${API_URL}/api/stop-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId }),
                });
                const stopData = await stopRes.json();
                if (!stopRes.ok) throw new Error(stopData.error || "Failed to stop session");

                const { finalAmountPaise, session } = stopData;

                if (!finalAmountPaise || finalAmountPaise <= 0) {
                    setStatus("success");
                    setStatusMsg("Session ended · No charges");
                    toast({ title: "⏹ Session stopped", description: "No charges" });
                    setTimeout(() => navigate("/customer"), 1200);
                    return;
                }

                setStatusMsg("Deducting payment from wallet…");

                // ── PAY FROM WALLET (server emits payment:success to merchant) ─
                const payRes = await fetch(`${API_URL}/api/pay-wallet`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, sessionId: session?.id }),
                });
                const payData = await payRes.json();
                if (!payRes.ok) throw new Error(payData.error || "Payment failed");

                const amount = `₹${(finalAmountPaise / 100).toFixed(2)}`;
                setStatus("success");
                setStatusMsg(`Paid ${amount} · Merchant notified ✓`);
                toast({
                    title: `✅ ${amount} paid!`,
                    description: "Session ended · Merchant dashboard updated",
                });
                setTimeout(() => navigate("/customer"), 1600);
            } else {
                throw new Error(`Unknown action: ${action}`);
            }
        } catch (err: any) {
            setStatus("error");
            setStatusMsg(err.message);
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setTimeout(() => { processingRef.current = false; }, 3000);
        }
    }

    // ── Photo capture handler ─────────────────────────────────────────────────
    async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";

        setStatus("scanning");
        setStatusMsg("Reading QR from photo…");
        try {
            const raw = await decodeQRFromFile(file);
            const payload = parseQRPayload(raw);
            if (!payload || !payload.merchantId || !payload.action) {
                throw new Error("QR code is not a Steam Pay code. Scan the merchant's START or STOP QR.");
            }
            await executeAction(payload);
        } catch (err: any) {
            setStatus("error");
            setStatusMsg(err.message);
            toast({ title: "❌ Scan failed", description: err.message, variant: "destructive" });
        }
    }

    // ── Live camera scanner ───────────────────────────────────────────────────
    async function startLiveCamera() {
        setLiveCamErr(null);
        if (!IS_SECURE) {
            setLiveCamErr("Live camera requires HTTPS or localhost. Use the Photo Scan button instead — it works perfectly!");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            setLiveCam(true);
            scanLoop();
        } catch (e: any) {
            const msg = e?.message || "";
            setLiveCamErr(
                msg.includes("NotAllowed") ? "Camera permission denied. Allow camera in your browser settings."
                    : msg.includes("NotFound") ? "No camera found on this device."
                        : `Camera error: ${msg}`
            );
        }
    }

    function stopLiveCamera() {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setLiveCam(false);
    }

    function scanLoop() {
        if (!videoRef.current || !liveCanvas.current) return;
        const ctx = liveCanvas.current.getContext("2d")!;
        const vid = videoRef.current;
        if (vid.readyState === vid.HAVE_ENOUGH_DATA) {
            liveCanvas.current.width = vid.videoWidth;
            liveCanvas.current.height = vid.videoHeight;
            ctx.drawImage(vid, 0, 0, vid.videoWidth, vid.videoHeight);
            const imgData = ctx.getImageData(0, 0, vid.videoWidth, vid.videoHeight);
            const result = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "dontInvert" });
            if (result && !processingRef.current) {
                const payload = parseQRPayload(result.data);
                if (payload?.merchantId && payload?.action) {
                    executeAction(payload);
                    return; // stop loop — executeAction will stop camera
                }
            }
        }
        rafRef.current = requestAnimationFrame(scanLoop);
    }

    useEffect(() => () => { stopLiveCamera(); }, []);

    // ── Demo (button-based) ───────────────────────────────────────────────────
    async function handleDemo(action: "start" | "stop") {
        const raw = action === "start" ? startQRPayload : stopQRPayload;
        const payload = parseQRPayload(raw)!;
        await executeAction(payload);
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">

            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border p-4 bg-card sticky top-0 z-10">
                <button
                    onClick={() => { stopLiveCamera(); navigate(-1); }}
                    className="rounded-xl p-2 hover:bg-muted transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </button>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                    <h1 className="font-display text-lg font-bold text-foreground">Scan QR Code</h1>
                    <p className="text-xs text-muted-foreground">Tap to scan · Session starts/stops instantly</p>
                </div>
            </div>

            <main className="flex-1 flex flex-col items-center justify-center p-6 gap-5 max-w-sm mx-auto w-full">

                {/* STATUS CARD */}
                <AnimatePresence mode="wait">
                    {status !== "idle" && (
                        <motion.div
                            key={status}
                            initial={{ opacity: 0, y: -10, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className={`w-full rounded-2xl p-4 flex items-start gap-3 border ${status === "scanning" ? "bg-primary/5 border-primary/30"
                                    : status === "success" ? "bg-green-500/5 border-green-500/30"
                                        : "bg-destructive/5 border-destructive/30"
                                }`}
                        >
                            {status === "scanning" && <Loader2 className="h-5 w-5 animate-spin text-primary mt-0.5 shrink-0" />}
                            {status === "success" && <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />}
                            {status === "error" && <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />}
                            <div>
                                <p className={`text-sm font-semibold ${status === "success" ? "text-green-400" : status === "error" ? "text-destructive" : "text-foreground"}`}>
                                    {status === "scanning" ? "Processing…" : status === "success" ? "Done!" : "Error"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">{statusMsg}</p>
                                {status === "error" && (
                                    <button onClick={() => setStatus("idle")} className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline">
                                        <RefreshCw className="h-3 w-3" />Try again
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── MAIN SCAN BUTTON (Photo capture) ────────────────── */}
                <div className="w-full glass rounded-3xl p-6 flex flex-col items-center gap-5 border border-border">

                    <div className="flex flex-col items-center gap-2 text-center">
                        <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10">
                            <QrCode className="h-12 w-12 text-primary" />
                            <span className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                                <Camera className="h-3.5 w-3.5" />
                            </span>
                        </div>
                        <p className="font-display text-xl font-bold text-foreground">Photo Scan</p>
                        <p className="text-xs text-muted-foreground">
                            Opens your camera. Point at the merchant's <br />
                            <strong className="text-foreground">START</strong> or <strong className="text-foreground">STOP</strong> QR and capture.
                        </p>
                    </div>

                    {/* Hidden file inputs */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handlePhotoFile}
                    />
                    <input
                        id="gallery-pick"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoFile}
                    />

                    <button
                        onClick={() => { setStatus("idle"); fileInputRef.current?.click(); }}
                        disabled={status === "scanning"}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground hover:neon-glow active:scale-95 transition-transform disabled:opacity-50"
                    >
                        <Camera className="h-5 w-5" />
                        Open Camera &amp; Scan QR
                    </button>

                    <label
                        htmlFor="gallery-pick"
                        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                    >
                        <QrCode className="h-4 w-4" />
                        Pick from Gallery / Screenshots
                    </label>
                </div>

                {/* ── LIVE CAMERA ──────────────────────────────────────── */}
                <div className="w-full glass rounded-2xl overflow-hidden border border-border">
                    <button
                        onClick={() => liveCam ? stopLiveCamera() : startLiveCamera()}
                        disabled={status === "scanning"}
                        className="flex w-full items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                    >
                        <Camera className={`h-4 w-4 ${liveCam ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="flex-1 text-left">
                            <p className="text-sm font-semibold text-foreground">
                                {liveCam ? "Live Camera (tap to stop)" : "Continuous Live Camera"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {IS_SECURE ? "Auto-scans viewfinder · no button needed" : "Requires HTTPS · use Photo Scan instead"}
                            </p>
                        </div>
                        {liveCam && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                    </button>
                    {(liveCam || liveCamErr) && (
                        <div>
                            {liveCamErr && (
                                <p className="px-4 pb-3 text-xs text-yellow-400">{liveCamErr}</p>
                            )}
                            {liveCam && (
                                <div className="relative bg-black">
                                    <video ref={videoRef} playsInline muted className="w-full" style={{ maxHeight: 260 }} />
                                    <canvas ref={liveCanvas} className="hidden" />
                                    {/* Overlay crosshair */}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="h-44 w-44 rounded-2xl border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── DEMO BUTTONS ─────────────────────────────────────── */}
                <div className="w-full glass rounded-2xl p-4 border border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Demo — No Camera</p>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => handleDemo("start")}
                            disabled={status === "scanning"}
                            className="flex flex-col items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/30 py-4 text-sm font-bold text-primary hover:bg-primary/20 active:scale-95 transition-all disabled:opacity-50"
                        >
                            <Play className="h-6 w-6" />
                            Demo START
                        </button>
                        <button
                            onClick={() => handleDemo("stop")}
                            disabled={status === "scanning"}
                            className="flex flex-col items-center gap-1.5 rounded-xl bg-destructive/10 border border-destructive/30 py-4 text-sm font-bold text-destructive hover:bg-destructive/20 active:scale-95 transition-all disabled:opacity-50"
                        >
                            <Square className="h-6 w-6" />
                            Demo STOP
                        </button>
                    </div>
                </div>

            </main>
        </div>
    );
}
