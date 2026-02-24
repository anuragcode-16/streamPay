/**
 * CameraQR.tsx — Real Camera QR Scanner using html5-qrcode
 *
 * - Scans QR codes from camera
 * - Decodes Base64 payload → start or stop session
 * - Start: POST /api/start-session → navigate to customer home
 * - Stop:  POST /api/stop-session → show PaymentChoice modal
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { motion, AnimatePresence } from "framer-motion";
import { QrCode, Camera, CameraOff, Loader2, Zap, X } from "lucide-react";
import PaymentChoiceModal from "@/components/PaymentChoiceModal";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function CameraQR() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [scanning, setScanning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [cameraError, setCameraError] = useState("");
    const [showPayment, setShowPayment] = useState(false);
    const [stopData, setStopData] = useState<any>(null);
    const [manualPayload, setManualPayload] = useState("");

    const qrRef = useRef<Html5Qrcode | null>(null);
    const SCANNER_ID = "pulse-qr-scanner";
    const userId = user?.id || "user_demo_customer";

    // Start camera scanner
    async function startScanner() {
        setCameraError("");
        setScanning(true);
        try {
            const scanner = new Html5Qrcode(SCANNER_ID);
            qrRef.current = scanner;

            await scanner.start(
                { facingMode: "environment" }, // rear camera
                { fps: 10, qrbox: { width: 250, height: 250 } },
                async (decodedText) => {
                    await scanner.stop();
                    setScanning(false);
                    await processPayload(decodedText);
                },
                () => { } // ignore qr scan errors
            );
        } catch (err: any) {
            setCameraError(err.message || "Camera permission denied");
            setScanning(false);
        }
    }

    async function stopScanner() {
        try { await qrRef.current?.stop(); } catch { }
        setScanning(false);
    }

    useEffect(() => { return () => { stopScanner(); }; }, []);

    function decodePayload(raw: string) {
        try { return JSON.parse(raw); } catch { }
        try { return JSON.parse(atob(raw)); } catch { }
        return null;
    }

    async function processPayload(rawPayload: string) {
        const decoded = decodePayload(rawPayload.trim());
        if (!decoded || !decoded.action) {
            toast({ title: "Invalid QR Code", description: "Not a Pulse Pay QR", variant: "destructive" });
            return;
        }
        setLoading(true);
        try {
            if (decoded.action === "start") {
                const res = await fetch(`${API_URL}/api/start-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId: decoded.merchantId, merchantServiceId: decoded.merchantServiceId, serviceType: decoded.serviceType }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                toast({ title: "▶️ Session Started!", description: `${data.merchant.name} — ₹${(data.merchant.price_per_minute_paise / 100).toFixed(0)}/min` });
                navigate("/customer");
            } else if (decoded.action === "stop") {
                const res = await fetch(`${API_URL}/api/stop-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, merchantId: decoded.merchantId }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setStopData(data);
                setShowPayment(true);
            }
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally { setLoading(false); }
    }

    const DEMO_MERCHANT = "m_demo_gym001";
    const demoStartQR = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT, serviceType: "gym", action: "start" }));
    const demoStopQR = btoa(JSON.stringify({ merchantId: DEMO_MERCHANT, serviceType: "gym", action: "stop" }));

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                    <QrCode className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                    <h2 className="font-display text-2xl font-bold text-foreground">Scan QR Code</h2>
                    <p className="text-sm text-muted-foreground">Point camera at a Pulse Pay merchant QR</p>
                </div>
            </div>

            {/* Camera viewfinder */}
            <div className="glass rounded-2xl p-4">
                <div id={SCANNER_ID} className="w-full rounded-xl overflow-hidden bg-black" style={{ minHeight: 280 }} />

                {!scanning && (
                    <div className="flex flex-col items-center justify-center py-10 gap-4">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                            <Camera className="h-10 w-10 text-primary" />
                        </div>
                        <p className="text-sm text-muted-foreground text-center">Camera is off. Click Start to scan a QR code.</p>
                        {cameraError && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-4 py-2">{cameraError}</p>}
                    </div>
                )}

                <div className="mt-4 flex gap-3">
                    {!scanning ? (
                        <button
                            onClick={startScanner} disabled={loading}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground hover:neon-glow"
                        >
                            <Camera className="h-4 w-4" />Start Camera
                        </button>
                    ) : (
                        <button
                            onClick={stopScanner}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive py-3 font-bold text-destructive-foreground"
                        >
                            <CameraOff className="h-4 w-4" />Stop Camera
                        </button>
                    )}
                </div>
            </div>

            {/* Demo quick-scan buttons */}
            <div className="glass rounded-2xl p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Demo Quick Scan (bypass camera)
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                    {[
                        { label: "▶️ Start Demo Session", qr: demoStartQR, cls: "bg-primary hover:neon-glow" },
                        { label: "⏹️ Stop Demo Session", qr: demoStopQR, cls: "bg-destructive hover:opacity-90" },
                    ].map(({ label, qr, cls }) => (
                        <button
                            key={label} disabled={loading}
                            onClick={() => processPayload(qr)}
                            className={`flex items-center justify-center gap-2 rounded-xl ${cls} px-4 py-3 text-sm font-bold text-white transition disabled:opacity-50`}
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Manual payload entry */}
            <div className="glass rounded-2xl p-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Manual QR Payload</p>
                <textarea
                    value={manualPayload} onChange={e => setManualPayload(e.target.value)}
                    rows={3} placeholder="Paste Base64 QR payload here…"
                    className="w-full rounded-xl border border-border bg-secondary px-4 py-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <button
                    onClick={() => processPayload(manualPayload)} disabled={loading || !manualPayload.trim()}
                    className="mt-3 flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    Process
                </button>
            </div>

            {/* Payment Choice Modal */}
            {showPayment && stopData && (
                <PaymentChoiceModal
                    stopData={stopData} userId={userId}
                    onClose={() => { setShowPayment(false); navigate("/customer"); }}
                />
            )}
        </div>
    );
}
