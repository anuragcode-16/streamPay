/**
 * CustomerDashboard.tsx — Full MVP Customer View
 *
 * Tabs:
 *   home    — active session card (live timer/cost/wallet balance), nearby CTA, ads
 *   scan    — navigate to /scan (CameraQR page)
 *   wallet  — WalletPage component
 *   nearby  — NearbyPage component
 *   history — full transaction history with invoice links
 *
 * Socket events handled:
 *   session:start   — set active session
 *   session:update  — live elapsed + cost + wallet balance
 *   session:paused  — show low-balance warning
 *   session:stop    — open PaymentChoiceModal
 *   payment:success — show invoice link
 *   wallet:update   — live balance
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import {
  Zap, Wallet, QrCode, MapPin, History, LogOut, Clock,
  AlertTriangle, CheckCircle2, Loader2, TrendingDown, Download, ArrowUpRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import WalletPage from "./WalletPage";
import NearbyPage from "./NearbyPage";
import PaymentChoiceModal from "@/components/PaymentChoiceModal";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

function pad(n: number) { return String(n).padStart(2, "0"); }
function formatTime(sec: number) { return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; }
function formatPaise(p: number) { return `₹${(p / 100).toFixed(2)}`; }

interface ActiveSession {
  sessionId: string; merchantId: string; merchantName: string;
  serviceType: string; startedAt: string; pricePerMinutePaise: number;
  elapsedSec: number; totalDebitedPaise: number;
  status: "active" | "paused_low_balance" | "stopped";
  orderId?: string; finalAmountPaise?: number;
  ads?: any[];
}

interface PaymentResult { sessionId: string; amountPaise: number; method: string; paymentId: string; }
interface TxSession { id: string; merchant_name: string; service_type: string; started_at: string; final_amount_paise: number; payment_status: string; status: string; }

const SERVICE_ICONS: Record<string, string> = { gym: "🏋️", ev: "⚡", parking: "🅿️", coworking: "💼", wifi: "📶", spa: "🧖", vending: "🤖" };

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const { profile, user, signOut } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState("home");
  const [walletPaise, setWalletPaise] = useState(0);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [stopData, setStopData] = useState<any>(null);
  const [transactions, setTransactions] = useState<TxSession[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);

  const localTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const userId = user?.id || "user_demo_customer";

  // ── Fetch wallet balance once ─────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/wallet/${userId}`)
      .then(r => r.json())
      .then(d => { if (d.wallet) setWalletPaise(d.wallet.balance_paise); })
      .catch(() => { });
  }, [userId]);

  // ── Socket.IO ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("join:user", userId));

    socket.on("session:start", (data: any) => {
      setActiveSession({ sessionId: data.sessionId, merchantId: data.merchantId, merchantName: data.merchantName, serviceType: data.serviceType, startedAt: data.startedAt, pricePerMinutePaise: data.pricePerMinutePaise, elapsedSec: 0, totalDebitedPaise: 0, status: "active", ads: data.ads || [] });
      setPaymentResult(null);
      toast({ title: "▶️ Session Started!", description: `${data.merchantName} — ₹${(data.pricePerMinutePaise / 100).toFixed(0)}/min` });
    });

    socket.on("session:update", ({ sessionId, elapsedSec, totalDebitedPaise, walletBalancePaise }: any) => {
      setActiveSession(prev => !prev || prev.sessionId !== sessionId ? prev : { ...prev, elapsedSec, totalDebitedPaise, status: "active" });
      if (walletBalancePaise !== undefined) setWalletPaise(walletBalancePaise);
    });

    socket.on("session:paused", ({ sessionId }: any) => {
      setActiveSession(prev => !prev || prev.sessionId !== sessionId ? prev : { ...prev, status: "paused_low_balance" });
      toast({ title: "⚠️ Session Paused — Wallet Low", variant: "destructive" });
    });

    socket.on("session:stop", (data: any) => {
      setActiveSession(prev => !prev ? prev : { ...prev, status: "stopped", finalAmountPaise: data.finalAmountPaise });
      if (data.finalAmountPaise > 0) {
        setStopData({ session: { id: data.sessionId }, finalAmountPaise: data.finalAmountPaise, durationSec: data.durationSec, walletBalance: walletPaise, canPayWallet: walletPaise >= data.finalAmountPaise });
        setShowPayment(true);
      }
    });

    socket.on("payment:success", (data: any) => {
      setPaymentResult(data);
      setActiveSession(null);
      toast({ title: `✅ Paid ₹${(data.amountPaise / 100).toFixed(2)} via ${data.method}!` });
    });

    socket.on("wallet:update", ({ balancePaise }: any) => { if (balancePaise !== undefined) setWalletPaise(balancePaise); });

    return () => { socket.disconnect(); };
  }, [userId]);

  // ── Local smooth timer between server ticks ───────────────────────────────
  useEffect(() => {
    if (localTimerRef.current) clearInterval(localTimerRef.current);
    if (activeSession?.status === "active") {
      localTimerRef.current = setInterval(() => {
        setActiveSession(prev => prev?.status === "active" ? { ...prev, elapsedSec: prev.elapsedSec + 1 } : prev);
      }, 1000);
    }
    return () => { if (localTimerRef.current) clearInterval(localTimerRef.current); };
  }, [activeSession?.status, activeSession?.sessionId]);

  async function fetchTransactions() {
    setLoadingTx(true);
    try {
      const res = await fetch(`${API_URL}/api/transactions/${userId}`);
      const data = await res.json();
      setTransactions(data.sessions || []);
    } catch { } finally { setLoadingTx(false); }
  }

  useEffect(() => { if (tab === "history") fetchTransactions(); }, [tab]);

  const tabs = [
    { id: "home", label: "Home", icon: Zap },
    { id: "wallet", label: "Wallet", icon: Wallet },
    { id: "nearby", label: "Nearby", icon: MapPin },
    { id: "history", label: "History", icon: History },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold text-foreground">PULSE<span className="neon-text">PAY</span></span>
        </div>

        {/* Wallet balance pill */}
        <div className="mx-4 mb-4 rounded-xl bg-primary/10 p-3">
          <p className="text-xs text-muted-foreground">Customer</p>
          <p className="font-display font-semibold text-foreground">{profile?.display_name || "Aarav Kumar"}</p>
          <p className="mt-1.5 flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-sm font-bold text-primary">{formatPaise(walletPaise)}</span>
          </p>
          {activeSession?.status === "active" && (
            <div className="mt-1 flex items-center gap-1 text-xs text-primary">
              <span className="pulse-dot h-2 w-2 rounded-full bg-primary" />Streaming…
            </div>
          )}
        </div>

        {/* Scan QR Button */}
        <div className="mx-4 mb-3">
          <button
            onClick={() => navigate("/scan")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-sm text-primary-foreground hover:neon-glow"
          >
            <QrCode className="h-4 w-4" />Scan QR Code
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <button onClick={async () => { await signOut(); navigate("/"); }}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="h-4 w-4" />Logout
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className="ml-64 flex-1 p-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>

          {/* ── HOME TAB ───────────────────────────────────────────────────── */}
          {tab === "home" && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl font-bold text-foreground">Hello, {profile?.display_name || "Aarav"} 👋</h1>
                <p className="text-sm text-muted-foreground">Your pay-as-you-use dashboard</p>
              </div>

              {/* Payment success banner */}
              <AnimatePresence>
                {paymentResult && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                    className="glass rounded-2xl p-5 border border-green-500/30 bg-green-500/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-8 w-8 text-green-400" />
                        <div>
                          <p className="font-display font-bold text-foreground">Payment Confirmed ✓</p>
                          <p className="text-xs text-muted-foreground font-mono">{paymentResult.paymentId}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-2xl font-bold text-green-400">{formatPaise(paymentResult.amountPaise)}</p>
                        <p className="text-xs text-muted-foreground">via {paymentResult.method}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/invoice/${paymentResult.sessionId}`)}
                      className="mt-3 flex items-center gap-2 text-xs text-primary hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />View &amp; Download Invoice
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Active Session Card */}
              <div className={`glass rounded-2xl p-6 ${activeSession?.status === "active" ? "neon-border" : ""}`}>
                {activeSession ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {activeSession.status === "active" ? "🟢 Live Session" :
                            activeSession.status === "paused_low_balance" ? "⚠️ Session Paused" : "⏹ Session Stopped"}
                        </p>
                        <p className="font-display text-xl font-bold text-foreground capitalize">
                          {SERVICE_ICONS[activeSession.serviceType]} {activeSession.merchantName}
                        </p>
                      </div>
                      {activeSession.status === "active" && (
                        <span className="flex items-center gap-1.5 text-sm text-primary">
                          <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-primary" />Streaming
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        animate={{ width: `${Math.min(100, (activeSession.totalDebitedPaise / Math.max(walletPaise + activeSession.totalDebitedPaise, 1)) * 100)}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Elapsed</p>
                        <p className="font-display text-3xl font-bold text-foreground">{formatTime(activeSession.elapsedSec)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Cost so far</p>
                        <p className="font-display text-3xl font-bold text-gradient">{formatPaise(activeSession.totalDebitedPaise)}</p>
                      </div>
                    </div>

                    {/* Merchant ads during active session */}
                    {activeSession.ads && activeSession.ads.length > 0 && (
                      <div className="mb-4 rounded-xl bg-primary/5 border border-primary/20 p-3">
                        <p className="text-xs text-primary font-semibold mb-1">📣 From {activeSession.merchantName}</p>
                        {activeSession.ads.map((ad: any) => (
                          <div key={ad.id}>
                            <p className="text-sm font-medium text-foreground">{ad.title}</p>
                            {ad.body && <p className="text-xs text-muted-foreground mt-0.5">{ad.body}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {activeSession.status === "paused_low_balance" && (
                      <div className="mb-4 flex items-center gap-2 rounded-xl bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
                        <AlertTriangle className="h-4 w-4" />
                        Balance too low — top up your wallet or scan Stop QR to end
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button onClick={() => navigate("/scan")}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive py-3 font-bold text-destructive-foreground">
                        <QrCode className="h-4 w-4" />Scan Stop QR
                      </button>
                      {activeSession.status === "paused_low_balance" && (
                        <button onClick={() => setTab("wallet")}
                          className="flex items-center gap-2 rounded-xl border border-primary px-4 py-3 text-sm font-bold text-primary hover:bg-primary/10">
                          <Wallet className="h-4 w-4" />Top Up
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center py-10">
                    <QrCode className="h-14 w-14 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">No active session</p>
                    <button onClick={() => navigate("/scan")}
                      className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:neon-glow">
                      <QrCode className="h-4 w-4" />Scan Merchant QR
                    </button>
                  </div>
                )}
              </div>

              {/* Quick stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Wallet Balance", value: formatPaise(walletPaise), icon: Wallet },
                  { label: "Rate", value: activeSession ? `₹${(activeSession.pricePerMinutePaise / 100).toFixed(0)}/min` : "—", icon: Clock },
                  { label: "Session Cost", value: activeSession ? formatPaise(activeSession.totalDebitedPaise) : "—", icon: TrendingDown },
                ].map(s => (
                  <div key={s.label} className="glass rounded-2xl p-4">
                    <s.icon className="h-4 w-4 text-primary mb-2" />
                    <p className="font-display text-xl font-bold text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── WALLET TAB ─────────────────────────────────────────────────── */}
          {tab === "wallet" && <WalletPage />}

          {/* ── NEARBY TAB ─────────────────────────────────────────────────── */}
          {tab === "nearby" && <NearbyPage />}

          {/* ── HISTORY TAB ────────────────────────────────────────────────── */}
          {tab === "history" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold text-foreground">Transaction History</h2>
                <button onClick={fetchTransactions} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Loader2 className={`h-3 w-3 ${loadingTx ? "animate-spin" : ""}`} />Refresh
                </button>
              </div>

              {loadingTx ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />Loading…
                </div>
              ) : transactions.length === 0 ? (
                <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No sessions yet. Start your first session!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.map(tx => (
                    <motion.div key={tx.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="glass rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-lg">
                          {SERVICE_ICONS[tx.service_type] || "🔌"}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{tx.merchant_name}</p>
                          <p className="text-xs text-muted-foreground">{new Date(tx.started_at).toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className="font-display font-bold text-foreground">{formatPaise(tx.final_amount_paise || 0)}</p>
                          <span className={`text-xs ${tx.payment_status === "paid" ? "text-green-400" : "text-muted-foreground"}`}>
                            {tx.payment_status}
                          </span>
                        </div>
                        {tx.payment_status === "paid" && (
                          <button onClick={() => navigate(`/invoice/${tx.id}`)}
                            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-primary hover:bg-primary/10">
                            <Download className="h-3 w-3" />Invoice
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </main>

      {/* Payment Modal */}
      {showPayment && stopData && (
        <PaymentChoiceModal
          stopData={stopData} userId={userId}
          onClose={() => { setShowPayment(false); setStopData(null); setActiveSession(null); }}
        />
      )}
    </div>
  );
}
