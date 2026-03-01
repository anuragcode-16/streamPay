/**
 * CameraQR.tsx — Mobile-first QR Scanner
 *
 * The key fix: file inputs are wrapped in <label> elements so the camera
 * opens as a DIRECT user gesture — programmatic .click() is blocked by
 * mobile browsers and prevents the camera from opening.
 *
 * Decoding chain (photo mode):
 *   1. BarcodeDetector (native browser API, fastest, Chrome Android 83+)
 *   2. jsQR multi-pass (4 scales × raw + greyscale+contrast + 3 inversions)
 *
 * Session flow:
 *   START QR → POST /api/start-session
 *   STOP  QR → POST /api/stop-session → POST /api/pay-wallet
 *            → server emits payment:success to merchant + customer
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import jsQR from "jsqr";
import {
    Camera, QrCode, Play, Square, Loader2,
    Zap, ArrowLeft, CheckCircle2, AlertCircle, RefreshCw, ImageIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL?.includes("localhost")
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : (import.meta.env.VITE_API_URL || "http://localhost:4000");
const DEMO_MERCHANT_ID = "m_demo_gym001";
const DEMO_SERVICE_TYPE = "gym";

declare const BarcodeDetector: any;
const hasBarcodeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

// ── QR Payload helpers ────────────────────────────────────────────────────────
const DEMO_START = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "start" }));
const DEMO_STOP = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "stop" }));

function parsePayload(raw: string): { merchantId: string; serviceType: string; action: string } | null {
    try { return JSON.parse(atob(raw.trim())); } catch { }
    try { return JSON.parse(raw.trim()); } catch { }
    return null;
}

// ── Decoding: BarcodeDetector first, then jsQR multi-pass ────────────────────
function applyContrast(src: HTMLCanvasElement): HTMLCanvasElement {
    const out = document.createElement("canvas");
    out.width = src.width; out.height = src.height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(src, 0, 0);
    const d = ctx.getImageData(0, 0, out.width, out.height);
    for (let i = 0; i < d.data.length; i += 4) {
        const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        const c = Math.min(255, Math.max(0, (g - 128) * 1.8 + 128));
        d.data[i] = d.data[i + 1] = d.data[i + 2] = c;
    }
    ctx.putImageData(d, 0, 0);
    return out;
}

function jsqrPass(canvas: HTMLCanvasElement): string | null {
    const ctx = canvas.getContext("2d")!;
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (const inv of ["attemptBoth", "dontInvert", "onlyInvert"] as const) {
        const r = jsQR(d.data, d.width, d.height, { inversionAttempts: inv });
        if (r) return r.data;
    }
    return null;
}

async function nativeDetect(img: HTMLImageElement): Promise<string | null> {
    if (!hasBarcodeDetector) return null;
    try {
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        const results = await detector.detect(img);
        return results[0]?.rawValue ?? null;
    } catch { return null; }
}

async function decodeImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = async () => {
            URL.revokeObjectURL(url);

            // Pass 1: native BarcodeDetector (fastest, most accurate)
            const native = await nativeDetect(img);
            if (native) { resolve(native); return; }

            // Pass 2: jsQR at 4 scales × (raw + contrast)
            const W = img.naturalWidth, H = img.naturalHeight;
            for (const scale of [Math.min(1, 1600 / Math.max(W, H)), 0.75, 1.5, 0.5]) {
                const w = Math.max(1, Math.round(W * scale));
                const h = Math.max(1, Math.round(H * scale));
                const c = document.createElement("canvas");
                c.width = w; c.height = h;
                c.getContext("2d")!.drawImage(img, 0, 0, w, h);
                const r1 = jsqrPass(c);
                if (r1) { resolve(r1); return; }
                const r2 = jsqrPass(applyContrast(c));
                if (r2) { resolve(r2); return; }
            }

            reject(new Error(
                "QR not detected — hold phone steady, fill the frame with the QR code, avoid screen glare"
            ));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Could not read image — try again"));
        };
        img.src = url;
    });
}

// ── Live camera scanning (HTTPS / localhost only) ─────────────────────────────
const IS_SECURE = window.isSecureContext || ["localhost", "127.0.0.1"].includes(window.location.hostname);

type ScanStatus = "idle" | "processing" | "success" | "error";

export default function CameraQR() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const userId = user?.id || "user_demo_customer";

    const [status, setStatus] = useState<ScanStatus>("idle");
    const [msg, setMsg] = useState("");
    const [tips, setTips] = useState(false);

    // Live camera
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const [liveCam, setLiveCam] = useState(false);
    const [liveCamErr, setLiveCamErr] = useState<string | null>(null);

    const processingRef = useRef(false);

    useEffect(() => () => { stopLive(); }, []);

    // ── Core action (shared by all scan modes) ────────────────────────────────
    async function executeAction(payload: { merchantId: string; serviceType: string; action: string }) {
        if (processingRef.current) return;
        processingRef.current = true;
        stopLive();

        const { merchantId, serviceType, action } = payload;
        setStatus("processing");
        setMsg(action === "start" ? "Starting your session…" : "Ending session & processing payment…");

        try {
            if (action === "start") {
                const res = await fetch(`${API_URL}/api/start-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId, serviceType, email: user?.email }),
                });
                const d = await res.json();
                if (!res.ok) throw new Error(d.error || "Failed to start session");

                setStatus("success");
                setMsg(`Session started at ${d.merchant?.name || merchantId}`);
                toast({ title: "▶️ Session Started!", description: `${d.merchant?.name} · ₹${(d.merchant?.price_per_minute_paise / 100).toFixed(0)}/min` });
                setTimeout(() => navigate("/customer"), 1200);

            } else if (action === "stop") {
                const stopRes = await fetch(`${API_URL}/api/stop-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId }),
                });
                const sd = await stopRes.json();
                if (!stopRes.ok) throw new Error(sd.error || "Failed to stop session");

                const { finalAmountPaise, session } = sd;
                if (!finalAmountPaise || finalAmountPaise <= 0) {
                    setStatus("success"); setMsg("Session ended — no charges");
                    toast({ title: "⏹ Session ended", description: "No charges" });
                    setTimeout(() => navigate("/customer"), 1200);
                    return;
                }

                setMsg(`Paying ₹${(finalAmountPaise / 100).toFixed(2)} from wallet…`);
                const payRes = await fetch(`${API_URL}/api/pay-wallet`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, sessionId: session?.id }),
                });
                const pd = await payRes.json();
                if (!payRes.ok) throw new Error(pd.error || "Payment failed");

                setStatus("success");
                setMsg(`✓ ₹${(finalAmountPaise / 100).toFixed(2)} paid · Merchant notified`);
                toast({ title: `✅ ₹${(finalAmountPaise / 100).toFixed(2)} paid!`, description: "Merchant dashboard updated live" });
                setTimeout(() => navigate("/customer"), 1600);
            }
        } catch (e: any) {
            setStatus("error");
            setMsg(e.message);
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setTimeout(() => { processingRef.current = false; }, 3000);
        }
    }

    // ── Photo file handler ───────────────────────────────────────────────────
    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";

        setStatus("processing"); setMsg("Reading QR from photo…");
        try {
            const raw = await decodeImage(file);
            const pl = parsePayload(raw);
            if (!pl?.merchantId || !pl?.action) throw new Error("Not a Stream Pay QR code — scan the merchant's START or STOP QR");
            await executeAction(pl);
        } catch (e: any) {
            setStatus("error");
            setMsg(e.message);
        }
    }

    // ── Live camera ──────────────────────────────────────────────────────────
    async function startLive() {
        if (!IS_SECURE) { setLiveCamErr("Requires HTTPS — use Photo Scan instead"); return; }
        setLiveCamErr(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: { ideal: 1280 } },
            });
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
            setLiveCam(true);
            rafLoop();
        } catch (e: any) {
            setLiveCamErr(
                e.message?.includes("NotAllowed") ? "Camera permission denied — allow in browser settings"
                    : e.message?.includes("NotFound") ? "No camera found on this device"
                        : `Camera error: ${e.message}`
            );
        }
    }

    function stopLive() {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setLiveCam(false);
    }

    function rafLoop() {
        const vid = videoRef.current; const cvs = canvasRef.current;
        if (!vid || !cvs) return;
        if (vid.readyState >= vid.HAVE_ENOUGH_DATA) {
            cvs.width = vid.videoWidth; cvs.height = vid.videoHeight;
            cvs.getContext("2d")!.drawImage(vid, 0, 0);
            const r = jsqrPass(cvs);
            if (r && !processingRef.current) {
                const pl = parsePayload(r);
                if (pl?.merchantId && pl?.action) { executeAction(pl); return; }
            }
        }
        rafRef.current = requestAnimationFrame(rafLoop);
    }

    const busy = status === "processing";

    return (
        <div className="min-h-screen bg-background flex flex-col">

            {/* Header */}
            <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card p-4">
                <button onClick={() => { stopLive(); navigate(-1); }}
                    className="rounded-xl p-2 hover:bg-muted transition-colors">
                    <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </button>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                    <p className="font-display font-bold text-foreground">Scan QR Code</p>
                    <p className="text-xs text-muted-foreground">Start or stop a session instantly</p>
                </div>
            </header>

            <main className="flex-1 flex flex-col gap-4 p-5 max-w-sm mx-auto w-full">

                {/* Status banner */}
                <AnimatePresence mode="wait">
                    {status !== "idle" && (
                        <motion.div key={status}
                            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className={`rounded-2xl p-4 flex items-start gap-3 border ${status === "processing" ? "bg-primary/5 border-primary/30"
                                : status === "success" ? "bg-green-500/5 border-green-500/30"
                                    : "bg-destructive/5 border-destructive/30"
                                }`}>
                            {status === "processing" && <Loader2 className="h-5 w-5 text-primary animate-spin mt-0.5 shrink-0" />}
                            {status === "success" && <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />}
                            {status === "error" && <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />}
                            <div className="flex-1">
                                <p className={`text-sm font-semibold ${status === "success" ? "text-green-400" : status === "error" ? "text-destructive" : "text-foreground"}`}>
                                    {status === "processing" ? "Please wait…" : status === "success" ? "Done!" : "Failed"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{msg}</p>
                                {status === "error" && (
                                    <button onClick={() => setStatus("idle")}
                                        className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline">
                                        <RefreshCw className="h-3 w-3" />Try again
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ═══════════════════════════════════════════════════════════
                    PHOTO SCAN — Primary mode. Works on HTTP over LAN.
                    Uses <label> wrapping so the file picker opens as a
                    direct user gesture (NOT programmatic .click()).
                ═══════════════════════════════════════════════════════════ */}
                <div className="glass rounded-3xl border border-border overflow-hidden">
                    {/* Big camera button — label wraps the hidden input */}
                    <label
                        htmlFor="qr-camera"
                        className={`flex flex-col items-center gap-4 p-8 cursor-pointer select-none transition-all active:scale-95 ${busy ? "pointer-events-none opacity-50" : "hover:bg-primary/5"}`}
                    >
                        <div className="relative flex h-28 w-28 items-center justify-center rounded-3xl bg-primary/10">
                            <Camera className="h-14 w-14 text-primary" />
                            <span className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary shadow-lg">
                                <QrCode className="h-4 w-4 text-white" />
                            </span>
                        </div>
                        <div className="text-center">
                            <p className="font-display text-xl font-bold text-foreground">Tap to Open Camera</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Point at merchant's <strong className="text-foreground">START</strong> or <strong className="text-foreground">STOP</strong> QR code
                            </p>
                        </div>
                    </label>

                    {/* Hidden file input — capture="environment" forces back camera */}
                    <input
                        id="qr-camera"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleFile}
                        disabled={busy}
                    />

                    <div className="border-t border-border">
                        {/* Gallery / screenshot fallback */}
                        <label
                            htmlFor="qr-gallery"
                            className={`flex items-center justify-center gap-2 p-3 cursor-pointer text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${busy ? "pointer-events-none opacity-50" : ""}`}
                        >
                            <ImageIcon className="h-4 w-4" />
                            Upload QR screenshot from gallery
                        </label>
                        <input
                            id="qr-gallery"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFile}
                            disabled={busy}
                        />
                    </div>
                </div>

                {/* Tips toggle */}
                <button onClick={() => setTips(t => !t)}
                    className="text-xs text-muted-foreground hover:text-foreground text-center">
                    {tips ? "▲ Hide tips" : "▼ Photo not scanning? Tips"}
                </button>
                <AnimatePresence>
                    {tips && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden">
                            <div className="glass rounded-2xl p-4 space-y-2 border border-border text-xs text-muted-foreground">
                                <p>📱 <strong className="text-foreground">Fill the frame</strong> — the QR should take up most of the photo</p>
                                <p>💡 <strong className="text-foreground">Avoid glare</strong> — tilt the phone or screen slightly</p>
                                <p>📐 <strong className="text-foreground">Hold steady</strong> — blur is the #1 cause of decode failure</p>
                                <p>🖥️ <strong className="text-foreground">Zoom in</strong> — make QR larger on merchant screen (Ctrl +)</p>
                                <p>📸 <strong className="text-foreground">Gallery</strong> — take a screenshot on laptop, share to phone, upload</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ═══════════════════════════════════════════════════════════
                    LIVE CAMERA — Continuous scan (requires HTTPS)
                ═══════════════════════════════════════════════════════════ */}
                <div className="glass rounded-2xl border border-border overflow-hidden">
                    <button onClick={() => liveCam ? stopLive() : startLive()} disabled={busy}
                        className="flex w-full items-center gap-3 px-4 py-3 hover:bg-muted transition-colors disabled:opacity-50">
                        <Camera className={`h-4 w-4 ${liveCam ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="flex-1 text-left">
                            <p className="text-sm font-semibold text-foreground">
                                {liveCam ? "Live Camera — scanning…" : "Live Camera (continuous)"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {IS_SECURE ? "Auto-scans the viewfinder — no button press needed"
                                    : "⚠ Requires HTTPS — use photo mode above instead"}
                            </p>
                        </div>
                        {liveCam && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                    </button>
                    {liveCamErr && <p className="px-4 pb-3 text-xs text-yellow-400">{liveCamErr}</p>}
                    <div className={`relative bg-black ${liveCam ? "block" : "hidden"}`}>
                        <video ref={videoRef} playsInline muted className="w-full" style={{ maxHeight: 260, objectFit: "cover" }} />
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="h-48 w-48 rounded-2xl border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════
                    DEMO BUTTONS — no camera needed
                ═══════════════════════════════════════════════════════════ */}
                <div className="glass rounded-2xl p-4 border border-border">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Demo — no camera
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => executeAction(parsePayload(DEMO_START)!)} disabled={busy}
                            className="flex flex-col items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 py-4 font-bold text-sm text-primary hover:bg-primary/20 active:scale-95 transition-all disabled:opacity-50">
                            <Play className="h-6 w-6" />Demo START
                        </button>
                        <button onClick={() => executeAction(parsePayload(DEMO_STOP)!)} disabled={busy}
                            className="flex flex-col items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/30 py-4 font-bold text-sm text-destructive hover:bg-destructive/20 active:scale-95 transition-all disabled:opacity-50">
                            <Square className="h-6 w-6" />Demo STOP
                        </button>
                    </div>
                </div>

            </main>
        </div>
    );
}
