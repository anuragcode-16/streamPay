/**
 * CameraQR.tsx — Robust QR Scanner
 *
 * Decoding strategy (phone photos often capture QR at low fraction of image):
 *   • Load image at native resolution
 *   • Try jsQR at 6 scales: 1x, 0.75x, 0.5x, 0.33x, 1.5x, 2x
 *   • For each scale also try a centre-crop (middle 65% of frame)
 *   • inversionAttempts: "attemptBoth" on every pass
 *   → 12 total attempts → virtually always finds the QR
 *
 * Session flow:
 *   START QR → POST /api/start-session → redirect /customer
 *   STOP  QR → POST /api/stop-session → POST /api/pay-wallet → /customer
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import jsQR from "jsqr";
import {
    Camera, QrCode, Play, Square, Loader2,
    Zap, ArrowLeft, CheckCircle2, AlertCircle, RefreshCw, Info,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const DEMO_MERCHANT_ID = "m_demo_gym001";
const DEMO_SERVICE_TYPE = "gym";
const startQRPayload = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "start" }));
const stopQRPayload = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "stop" }));

const IS_SECURE =
    window.isSecureContext ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

// ─── jsQR decode helper (multi-scale + centre-crop) ────────────────────────
function scanCanvas(canvas: HTMLCanvasElement): string | null {
    const ctx = canvas.getContext("2d")!;
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(d.data, d.width, d.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

function makeCanvas(img: HTMLImageElement, targetW: number, targetH: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = targetW; c.height = targetH;
    c.getContext("2d")!.drawImage(img, 0, 0, targetW, targetH);
    return c;
}

async function decodeQRFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            const W = img.naturalWidth || 800;
            const H = img.naturalHeight || 600;

            // Scale candidates: try large → small (larger = more detail, smaller = QR fills more)
            const scales = [1, 0.75, 0.5, 0.33, 1.5, 2]
                .filter(s => {
                    const w = Math.round(W * s);
                    return w >= 200 && w <= 4000;
                });

            for (const scale of scales) {
                const w = Math.round(W * scale);
                const h = Math.round(H * scale);

                // Full image at this scale
                const full = makeCanvas(img, w, h);
                const r1 = scanCanvas(full);
                if (r1) { resolve(r1); return; }

                // Centre 65% crop (removes distracting edges / background)
                const cx = Math.round(w * 0.175);
                const cy = Math.round(h * 0.175);
                const cw = Math.round(w * 0.65);
                const ch = Math.round(h * 0.65);
                if (cw >= 100 && ch >= 100) {
                    const crop = document.createElement("canvas");
                    crop.width = cw; crop.height = ch;
                    crop.getContext("2d")!.drawImage(full, cx, cy, cw, ch, 0, 0, cw, ch);
                    const r2 = scanCanvas(crop);
                    if (r2) { resolve(r2); return; }
                }
            }

            reject(new Error(
                "No QR code found.\n\n" +
                "Tips: hold the phone closer so the QR fills about 70% of the frame, ensure good lighting, and tap to focus before shooting."
            ));
        };

        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load image.")); };
        img.src = url;
    });
}

// ─── Parse QR payload (base64-JSON or raw JSON) ─────────────────────────────
function parsePayload(raw: string): { merchantId: string; serviceType: string; action: string } | null {
    try { return JSON.parse(atob(raw.trim())); } catch { }
    try { return JSON.parse(raw.trim()); } catch { }
    return null;
}

// ─── Component ───────────────────────────────────────────────────────────────
type Status = "idle" | "scanning" | "success" | "error";

export default function CameraQR() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const userId = user?.id || "user_demo_customer";

    const [status, setStatus] = useState<Status>("idle");
    const [msg, setMsg] = useState("");

    // Live camera
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const liveCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [liveCam, setLiveCam] = useState(false);
    const [liveCamErr, setLiveCamErr] = useState<string | null>(null);

    const fileRef = useRef<HTMLInputElement | null>(null);
    const galleryRef = useRef<HTMLInputElement | null>(null);
    const processingRef = useRef(false);

    // ── shared action executor ───────────────────────────────────────────────
    async function execute(payload: { merchantId: string; serviceType: string; action: string }) {
        if (processingRef.current) return;
        processingRef.current = true;

        const { merchantId, serviceType, action } = payload;
        setStatus("scanning");
        setMsg(action === "start" ? "Starting session…" : "Stopping & processing payment…");
        if (liveCam) stopLive();

        try {
            if (action === "start") {
                const res = await fetch(`${API_URL}/api/start-session`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId, serviceType }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to start session");
                setStatus("success");
                setMsg(`Session started — ${data.merchant?.name || merchantId}`);
                toast({ title: "▶️ Session Started!", description: `${data.merchant?.name} · ₹${(data.merchant?.price_per_minute_paise / 100).toFixed(0)}/min` });
                setTimeout(() => navigate("/customer"), 1000);

            } else if (action === "stop") {
                const stopRes = await fetch(`${API_URL}/api/stop-session`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId }),
                });
                const stopData = await stopRes.json();
                if (!stopRes.ok) throw new Error(stopData.error || "Failed to stop session");

                const { finalAmountPaise, session } = stopData;

                if (!finalAmountPaise || finalAmountPaise <= 0) {
                    setStatus("success"); setMsg("Session ended · No charges");
                    toast({ title: "⏹ Session ended", description: "No charges" });
                    setTimeout(() => navigate("/customer"), 1000);
                    return;
                }

                setMsg("Deducting from wallet…");
                const payRes = await fetch(`${API_URL}/api/pay-wallet`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, sessionId: session?.id }),
                });
                const payData = await payRes.json();
                if (!payRes.ok) throw new Error(payData.error || "Payment failed");

                const amt = `₹${(finalAmountPaise / 100).toFixed(2)}`;
                setStatus("success"); setMsg(`Paid ${amt} · Merchant notified ✓`);
                toast({ title: `✅ ${amt} paid!`, description: "Session ended · Merchant dashboard updated" });
                setTimeout(() => navigate("/customer"), 1400);
            }
        } catch (e: any) {
            setStatus("error"); setMsg(e.message);
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setTimeout(() => { processingRef.current = false; }, 3000);
        }
    }

    // ── Photo capture ────────────────────────────────────────────────────────
    async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        setStatus("scanning"); setMsg("Decoding QR from photo…");
        try {
            const raw = await decodeQRFromFile(file);
            const payload = parsePayload(raw);
            if (!payload?.merchantId || !payload?.action)
                throw new Error("Not a Steam Pay QR code. Scan the merchant's START or STOP QR.");
            await execute(payload);
        } catch (e: any) {
            setStatus("error"); setMsg(e.message);
            toast({ title: "❌ Scan failed", description: e.message, variant: "destructive" });
        }
    }

    // ── Live camera ──────────────────────────────────────────────────────────
    async function startLive() {
        setLiveCamErr(null);
        if (!IS_SECURE) {
            setLiveCamErr("Live camera needs HTTPS. Use 'Open Camera' photo mode instead.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
            });
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
            setLiveCam(true);
            loop();
        } catch (e: any) {
            const m = e?.message || "";
            setLiveCamErr(m.includes("NotAllowed") ? "Camera permission denied."
                : m.includes("NotFound") ? "No camera found."
                    : `Camera error: ${m}`);
        }
    }

    function stopLive() {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setLiveCam(false);
    }

    function loop() {
        const vid = videoRef.current;
        const canvas = liveCanvasRef.current;
        if (!vid || !canvas) return;
        if (vid.readyState === vid.HAVE_ENOUGH_DATA) {
            canvas.width = vid.videoWidth; canvas.height = vid.videoHeight;
            if (!liveCtxRef.current) liveCtxRef.current = canvas.getContext("2d");
            liveCtxRef.current!.drawImage(vid, 0, 0);
            const img = liveCtxRef.current!.getImageData(0, 0, canvas.width, canvas.height);
            const res = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
            if (res && !processingRef.current) {
                const p = parsePayload(res.data);
                if (p?.merchantId && p?.action) { execute(p); return; }
            }
        }
        rafRef.current = requestAnimationFrame(loop);
    }

    useEffect(() => () => { stopLive(); }, []);

    async function handleDemo(a: "start" | "stop") {
        await execute(parsePayload(a === "start" ? startQRPayload : stopQRPayload)!);
    }

    const busyScanning = status === "scanning";

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-border p-4 bg-card sticky top-0 z-10">
                <button onClick={() => { stopLive(); navigate(-1); }} className="rounded-xl p-2 hover:bg-muted">
                    <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </button>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                    <h1 className="font-display text-lg font-bold text-foreground">Scan QR Code</h1>
                    <p className="text-xs text-muted-foreground">Start or stop a session</p>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center p-5 gap-4 max-w-sm mx-auto w-full">

                {/* Status */}
                <AnimatePresence mode="wait">
                    {status !== "idle" && (
                        <motion.div key={status}
                            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                            className={`w-full rounded-2xl p-4 flex items-start gap-3 border ${status === "scanning" ? "bg-primary/5 border-primary/30"
                                    : status === "success" ? "bg-green-500/5 border-green-500/30"
                                        : "bg-destructive/5 border-destructive/30"
                                }`}
                        >
                            {status === "scanning" && <Loader2 className="h-5 w-5 animate-spin text-primary mt-0.5 shrink-0" />}
                            {status === "success" && <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />}
                            {status === "error" && <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />}
                            <div className="flex-1">
                                <p className={`text-sm font-semibold ${status === "success" ? "text-green-400" : status === "error" ? "text-destructive" : "text-foreground"}`}>
                                    {status === "scanning" ? "Processing…" : status === "success" ? "Done!" : "Scan failed"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{msg}</p>
                                {status === "error" && (
                                    <button onClick={() => setStatus("idle")} className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline">
                                        <RefreshCw className="h-3 w-3" />Try again
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── PHOTO SCAN (primary — works on HTTP) ── */}
                <div className="w-full glass rounded-3xl p-6 space-y-4 border border-border">
                    <div className="flex flex-col items-center gap-2 text-center">
                        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
                            <QrCode className="h-11 w-11 text-primary" />
                            <span className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                                <Camera className="h-3.5 w-3.5 text-white" />
                            </span>
                        </div>
                        <p className="font-display text-lg font-bold text-foreground">Photo Scan</p>
                        <p className="text-xs text-muted-foreground">
                            Hold phone close — QR should fill <strong className="text-foreground">most of the frame</strong>
                        </p>
                    </div>

                    <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
                    <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />

                    <button
                        onClick={() => { setStatus("idle"); fileRef.current?.click(); }}
                        disabled={busyScanning}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground hover:neon-glow active:scale-95 transition-all disabled:opacity-50"
                    >
                        <Camera className="h-5 w-5" />
                        Open Camera &amp; Scan
                    </button>
                    <button
                        onClick={() => { setStatus("idle"); galleryRef.current?.click(); }}
                        disabled={busyScanning}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-semibold text-muted-foreground hover:bg-muted cursor-pointer transition-colors disabled:opacity-50"
                    >
                        <QrCode className="h-4 w-4" />
                        Pick from Gallery
                    </button>

                    {/* Tip */}
                    <div className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
                        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Point camera at the merchant's <strong className="text-foreground">START</strong> or <strong className="text-foreground">STOP</strong> QR.
                            Tap to focus, ensure QR fills ≥60% of the frame, tap capture.
                        </p>
                    </div>
                </div>

                {/* ── LIVE CAMERA (HTTPS only) ── */}
                <div className="w-full glass rounded-2xl overflow-hidden border border-border">
                    <button
                        onClick={() => liveCam ? stopLive() : startLive()}
                        disabled={busyScanning}
                        className="flex w-full items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                    >
                        <Camera className={`h-4 w-4 ${liveCam ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                        <div className="flex-1 text-left">
                            <p className="text-sm font-semibold text-foreground">
                                {liveCam ? "Live Camera — tap to stop" : "Live Camera (continuous)"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {IS_SECURE ? "Auto-detects QR — no button needed" : "⚠️ Needs HTTPS — use Photo Scan above"}
                            </p>
                        </div>
                        {liveCam && <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />}
                    </button>

                    {liveCamErr && (
                        <p className="px-4 pb-3 text-xs text-yellow-400">{liveCamErr}</p>
                    )}
                    {liveCam && (
                        <div className="relative bg-black">
                            <video ref={videoRef} playsInline muted className="w-full max-h-56 object-cover" />
                            <canvas ref={liveCanvasRef} className="hidden" />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="h-40 w-40 rounded-xl border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
                            </div>
                        </div>
                    )}
                </div>

                {/* ── DEMO BUTTONS ── */}
                <div className="w-full glass rounded-2xl p-4 border border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">🧪 Demo — No Camera Needed</p>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => handleDemo("start")}
                            disabled={busyScanning}
                            className="flex flex-col items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 py-4 text-sm font-bold text-primary hover:bg-primary/20 active:scale-95 transition-all disabled:opacity-50"
                        >
                            <Play className="h-6 w-6" />Demo START
                        </button>
                        <button
                            onClick={() => handleDemo("stop")}
                            disabled={busyScanning}
                            className="flex flex-col items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/30 py-4 text-sm font-bold text-destructive hover:bg-destructive/20 active:scale-95 transition-all disabled:opacity-50"
                        >
                            <Square className="h-6 w-6" />Demo STOP
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
