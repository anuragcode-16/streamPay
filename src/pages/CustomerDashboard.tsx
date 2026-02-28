/**
 * CustomerDashboard.tsx — x402 Edition
 *
 * Payments via Coinbase x402 (USDC on Base Sepolia):
 *  - Connect MetaMask wallet (WalletConnect component)
 *  - Start session  → POST /api/start-session (x402 protected, 0.001 USDC)
 *  - Live timer via session:update WebSocket ticks
 *  - Stop session   → POST /api/stop-session  (x402 protected, session cost in USDC)
 *  - History tab shows past sessions with on-chain txHash links
 *
 * QR scanning removed — sessions are started/stopped via direct API calls.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import {
  Zap, Activity, Clock, CheckCircle2, Loader2, PauseCircle, ExternalLink,
  Play, Square, Wallet, BarChart2, History,
} from "lucide-react";
import WalletConnect, { WalletState } from "@/components/WalletConnect";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const BASESCAN_URL = "https://sepolia.basescan.org/tx/";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SessionEntry {
  sessionId: string;
  merchantId: string;
  merchantName: string;
  serviceType: string;
  startedAt: string;
  pricePerMinutePaise: number;
  elapsedSec: number;
  runningCostUSDC: number;
  status: "active" | "paused_low_balance" | "stopped" | "paid";
  txHash?: string | null;
  finalCostUSDC?: number;
}

function paiseToUSDC(paise: number) { return (paise * 0.0001); }
function fmtUSDC(v: number) { return `$${v.toFixed(4)}`; }
function fmtTime(s: number) { return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const userId = user?.id || "user_demo_customer";

  const [tab, setTab] = useState<"sessions" | "history">("sessions");
  const [wallet, setWallet] = useState<WalletState>({ address: null, usdcBalance: null, connected: false });
  const [sessionMap, setSessionMap] = useState<Map<string, SessionEntry>>(new Map());
  const [history, setHistory] = useState<SessionEntry[]>([]);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState<string | null>(null); // sessionId being stopped

  const socketRef = useRef<Socket | null>(null);

  const updateSession = useCallback((sessionId: string, updates: Partial<SessionEntry>) => {
    setSessionMap(prev => {
      const m = new Map(prev);
      const s = m.get(sessionId);
      if (s) m.set(sessionId, { ...s, ...updates });
      return m;
    });
  }, []);

  // ── Socket.IO ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join:user", userId);
    });

    socket.on("session:start", (data: any) => {
      const entry: SessionEntry = {
        sessionId: data.sessionId, merchantId: data.merchantId,
        merchantName: data.merchantName || data.merchantId,
        serviceType: data.serviceType, startedAt: data.startedAt,
        pricePerMinutePaise: data.pricePerMinutePaise, elapsedSec: 0,
        runningCostUSDC: 0, status: "active", txHash: data.txHash,
      };
      setSessionMap(prev => new Map(prev).set(data.sessionId, entry));
      toast({ title: "▶️ Session started", description: `${entry.merchantName} · ${fmtUSDC(paiseToUSDC(data.pricePerMinutePaise))}/min` });
    });

    socket.on("session:update", ({ sessionId, elapsedSec, totalDebitedPaise }: any) => {
      updateSession(sessionId, {
        elapsedSec,
        runningCostUSDC: paiseToUSDC(totalDebitedPaise ?? 0),
      });
    });

    socket.on("session:paused", ({ sessionId }: any) => {
      updateSession(sessionId, { status: "paused_low_balance" });
    });

    socket.on("session:stop", ({ sessionId, finalAmountPaise, finalCostUSDC, txHash }: any) => {
      updateSession(sessionId, { status: "stopped", finalCostUSDC: finalCostUSDC || paiseToUSDC(finalAmountPaise || 0), txHash });
    });

    socket.on("payment:success", ({ sessionId, amountUSDC, txHash }: any) => {
      updateSession(sessionId, { status: "paid", finalCostUSDC: amountUSDC, txHash });
      setSessionMap(prev => {
        const m = new Map(prev);
        const s = m.get(sessionId);
        if (s) {
          setHistory(h => [{ ...s, status: "paid", finalCostUSDC: amountUSDC, txHash }, ...h.filter(e => e.sessionId !== sessionId)]);
        }
        return m;
      });
      setStopping(null);
      toast({ title: `✅ ${fmtUSDC(amountUSDC || 0)} USDC paid!`, description: txHash ? `txHash: ${txHash.slice(0, 18)}…` : "Payment settled on Base Sepolia" });
    });

    return () => { socket.disconnect(); };
  }, [userId, updateSession]);

  // ── x402-fetch helper ─────────────────────────────────────────────────────
  // Uses the wallet's Ethereum provider to sign the USDC payment when a 402 is received
  async function fetchWithX402(url: string, options: RequestInit = {}): Promise<Response> {
    const eth = (window as any).ethereum;
    if (!eth || !wallet.address) throw new Error("No wallet connected");

    // First attempt
    let res = await fetch(url, options);
    if (res.status !== 402) return res;

    // Parse the 402 response
    const paymentRequired = await res.json();
    const accepts = paymentRequired.accepts || [];
    if (accepts.length === 0) throw new Error("No payment schemes offered by server");

    const req = accepts[0]; // Use first (USDC on Base Sepolia)

    // Sign via EIP-3009 (USDC transferWithAuthorization)
    // x402-fetch package handles this if available
    let fetchWithPayment: any = null;
    try {
      const x402 = await import("x402-fetch");
      fetchWithPayment = x402.fetchWithPayment || x402.default?.fetchWithPayment;
    } catch { /* x402-fetch not installed = fallback */ }

    if (fetchWithPayment) {
      return fetchWithPayment(url, options, { wallet: eth, walletAddress: wallet.address, paymentRequirements: req });
    }

    // Manual fallback — call the stop even without payment signature (graceful degradation for dev)
    console.warn("[x402] x402-fetch not available — calling without payment signature (dev mode)");
    const retryOptions = {
      ...options,
      headers: { ...((options.headers as Record<string, string>) || {}), "X-Demo-Mode": "true" },
    };
    return fetch(url, retryOptions);
  }

  // ── Start Session ─────────────────────────────────────────────────────────
  async function startSession(merchantId = "m_demo_gym001", serviceType = "gym") {
    if (!wallet.connected) {
      toast({ title: "Connect wallet first", description: "Use the 'Connect Wallet' button to connect MetaMask", variant: "destructive" });
      return;
    }
    setStarting(true);
    try {
      const res = await fetchWithX402(`${API_URL}/api/start-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, merchantId, serviceType }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to start session");
      // session:start socket event will handle UI update
    } catch (e: any) {
      toast({ title: "Session start failed", description: e.message, variant: "destructive" });
    } finally { setStarting(false); }
  }

  // ── Stop Session ──────────────────────────────────────────────────────────
  async function stopSession(session: SessionEntry) {
    setStopping(session.sessionId);
    try {
      const res = await fetchWithX402(`${API_URL}/api/stop-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, merchantId: session.merchantId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to stop session");
      // payment:success socket event will handle UI update
    } catch (e: any) {
      toast({ title: "Stop session failed", description: e.message, variant: "destructive" });
      setStopping(null);
    }
  }

  const liveSessions = [...sessionMap.values()].filter(s => ["active", "paused_low_balance"].includes(s.status));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-display font-bold text-foreground">SteamPay</p>
            <p className="text-xs text-muted-foreground">Powered by x402 · Base Sepolia</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {liveSessions.length > 0 && (
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto p-5 space-y-4">
        {/* Wallet Section */}
        <div className="glass rounded-3xl p-5 border border-border">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Your Wallet</p>
          <WalletConnect onWalletChange={setWallet} />
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-border bg-card overflow-hidden">
          {([
            { id: "sessions", label: "Sessions", icon: Activity },
            { id: "history", label: "History", icon: History },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {/* Sessions Tab */}
        {tab === "sessions" && (
          <div className="space-y-4">
            {/* Start new session */}
            <div className="glass rounded-2xl p-5 border border-border space-y-3">
              <p className="text-sm font-semibold text-foreground">Start a Demo Session</p>
              <p className="text-xs text-muted-foreground">A 0.001 USDC identity check is requested. Your wallet will prompt you to sign.</p>
              <button onClick={() => startSession()} disabled={starting || !wallet.connected}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-sm text-primary-foreground hover:opacity-90 active:scale-95 transition-all disabled:opacity-50">
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {starting ? "Requesting payment…" : "Start Demo Session (PowerZone Gym)"}
              </button>
            </div>

            {/* Live session cards */}
            <AnimatePresence>
              {liveSessions.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="rounded-2xl border border-border bg-card p-8 text-center">
                  <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-muted-foreground">No active sessions. Connect your wallet and start one above.</p>
                </motion.div>
              ) : liveSessions.map(session => (
                <motion.div key={session.sessionId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`glass rounded-2xl p-5 border ${session.status === "active" ? "border-primary/30" : "border-yellow-500/30"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-display font-bold text-foreground">{session.merchantName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{session.serviceType}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${session.status === "active" ? "bg-primary/10 text-primary" : "bg-yellow-400/10 text-yellow-400"}`}>
                      {session.status === "active" ? "🟢 Live" : "⏸ Paused"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl bg-muted/50 p-3 text-center">
                      <p className="text-lg font-mono font-bold text-foreground">{fmtTime(session.elapsedSec)}</p>
                      <p className="text-xs text-muted-foreground">Elapsed</p>
                    </div>
                    <div className="rounded-xl bg-primary/5 p-3 text-center">
                      <p className="text-lg font-mono font-bold text-primary">{fmtUSDC(session.runningCostUSDC)}</p>
                      <p className="text-xs text-muted-foreground">Running cost (USDC)</p>
                    </div>
                  </div>
                  <button onClick={() => stopSession(session)} disabled={stopping === session.sessionId}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-destructive/10 border border-destructive/30 py-2.5 font-bold text-sm text-destructive hover:bg-destructive/20 active:scale-95 transition-all disabled:opacity-60">
                    {stopping === session.sessionId
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Requesting payment…</>
                      : <><Square className="h-4 w-4" />Stop &amp; Pay ({fmtUSDC(session.runningCostUSDC)} USDC)</>
                    }
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* History Tab */}
        {tab === "history" && (
          <div className="space-y-3">
            {[...sessionMap.values()].filter(s => ["stopped", "paid"].includes(s.status)).concat(history)
              .filter((s, i, arr) => arr.findIndex(x => x.sessionId === s.sessionId) === i)
              .sort((a, b) => -a.startedAt.localeCompare(b.startedAt))
              .map(session => (
                <div key={session.sessionId} className="glass rounded-2xl p-4 border border-border">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{session.merchantName}</p>
                      <p className="text-xs text-muted-foreground">{new Date(session.startedAt).toLocaleString()} · {fmtTime(session.elapsedSec)}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-bold text-sm text-primary">{fmtUSDC(session.finalCostUSDC ?? session.runningCostUSDC)}</p>
                      <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${session.status === "paid" ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
                        {session.status === "paid" ? "✅ paid" : "stopped"}
                      </span>
                    </div>
                  </div>
                  {session.txHash && (
                    <a href={`${BASESCAN_URL}${session.txHash}`} target="_blank" rel="noreferrer"
                      className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" />
                      View on Base Sepolia Scan
                    </a>
                  )}
                </div>
              ))}
            {sessionMap.size === 0 && history.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <BarChart2 className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">No sessions yet.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
