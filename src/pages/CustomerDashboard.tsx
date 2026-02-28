/**
 * CustomerDashboard.tsx
 *
 * Live session list:
 *  - Sessions added to `sessionHistory` on session:start
 *  - Updated live (elapsed, cost) on session:update
 *  - Marked "paid" with final amount on payment:success
 *  - Persisted to localStorage so they survive refresh
 *
 * Wallet balance:
 *  - Fetched from /api/wallet/:userId on mount
 *  - Kept in sync via wallet:update socket event
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import {
  Zap, Wallet, QrCode, MapPin, History, LogOut, Clock,
  AlertTriangle, CheckCircle2, Loader2, TrendingDown, Download,
  Play, Square, CircleDot,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import WalletPage from "./WalletPage";
import NearbyPage from "./NearbyPage";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmt(sec: number) { return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; }
function fmtPaise(p: number) { return `₹${(p / 100).toFixed(2)}`; }

const SERVICE_ICONS: Record<string, string> = {
  gym: "🏋️", ev: "⚡", parking: "🅿️", coworking: "💼",
  wifi: "📶", spa: "🧖", vending: "🤖",
};

// ── Session history item (stored in localStorage) ────────────────────────────
interface SessionRecord {
  sessionId: string;
  merchantId: string;
  merchantName: string;
  serviceType: string;
  startedAt: string;          // ISO string
  endedAt?: string;
  pricePerMinutePaise: number;
  elapsedSec: number;
  totalDebitedPaise: number;
  status: "active" | "paused_low_balance" | "stopped" | "paid";
  finalAmountPaise?: number;
  paymentId?: string;
  ads?: any[];
}

function loadHistory(userId: string): SessionRecord[] {
  try {
    const raw = localStorage.getItem(`sp_sessions_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(userId: string, h: SessionRecord[]) {
  try { localStorage.setItem(`sp_sessions_${userId}`, JSON.stringify(h.slice(0, 100))); } catch { }
}

function upsertSession(prev: SessionRecord[], patch: Partial<SessionRecord> & { sessionId: string }): SessionRecord[] {
  const idx = prev.findIndex(s => s.sessionId === patch.sessionId);
  if (idx === -1) {
    // Should not happen for update/stop, but guard anyway
    return [patch as SessionRecord, ...prev];
  }
  const updated = [...prev];
  updated[idx] = { ...updated[idx], ...patch };
  return updated;
}

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const { profile, user, signOut } = useAuth();
  const { toast } = useToast();

  const userId = user?.id || "user_demo_customer";

  const [tab, setTab] = useState("home");
  const [walletPaise, setWalletPaise] = useState(0);

  // The one currently-active session (shown in the big card)
  const [activeSession, setActiveSession] = useState<SessionRecord | null>(null);
  // Full ordered history (active first, then newest-completed first)
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>(() => loadHistory(userId));

  const [paying, setPaying] = useState(false);
  const localTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Keep localStorage in sync whenever history changes
  useEffect(() => { saveHistory(userId, sessionHistory); }, [sessionHistory, userId]);

  // Derive active session from history
  useEffect(() => {
    const active = sessionHistory.find(s => s.status === "active" || s.status === "paused_low_balance") || null;
    setActiveSession(active);
  }, [sessionHistory]);

  // ── Local smooth timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (localTimerRef.current) clearInterval(localTimerRef.current);
    if (activeSession?.status === "active") {
      localTimerRef.current = setInterval(() => {
        setSessionHistory(prev =>
          prev.map(s =>
            s.sessionId === activeSession.sessionId && s.status === "active"
              ? { ...s, elapsedSec: s.elapsedSec + 1 }
              : s
          )
        );
      }, 1000);
    }
    return () => { if (localTimerRef.current) clearInterval(localTimerRef.current); };
  }, [activeSession?.sessionId, activeSession?.status]);

  // ── Fetch wallet from server on mount ───────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/wallet/${userId}`)
      .then(r => r.json())
      .then(d => { if (d.wallet) setWalletPaise(d.wallet.balance_paise); })
      .catch(() => { });
  }, [userId]);

  // ── Socket.IO ────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join:user", userId);
    });

    // Session starts → add to history
    socket.on("session:start", (data: any) => {
      const rec: SessionRecord = {
        sessionId: data.sessionId,
        merchantId: data.merchantId,
        merchantName: data.merchantName || "Merchant",
        serviceType: data.serviceType || "gym",
        startedAt: data.startedAt || new Date().toISOString(),
        pricePerMinutePaise: data.pricePerMinutePaise || 0,
        elapsedSec: 0,
        totalDebitedPaise: 0,
        status: "active",
        ads: data.ads || [],
      };
      setSessionHistory(prev => {
        // Remove any stale active for same merchant+user then prepend
        const without = prev.filter(s => !(s.merchantId === data.merchantId && (s.status === "active" || s.status === "paused_low_balance")));
        return [rec, ...without];
      });
      toast({ title: "▶️ Session Started!", description: `${data.merchantName} · ₹${(data.pricePerMinutePaise / 100).toFixed(0)}/min` });
    });

    // Live cost + elapsed updates
    socket.on("session:update", ({ sessionId, elapsedSec, totalDebitedPaise, walletBalancePaise }: any) => {
      setSessionHistory(prev => upsertSession(prev, { sessionId, elapsedSec, totalDebitedPaise }));
      if (walletBalancePaise !== undefined) setWalletPaise(walletBalancePaise);
    });

    // Session paused (low balance)
    socket.on("session:paused", ({ sessionId }: any) => {
      setSessionHistory(prev => upsertSession(prev, { sessionId, status: "paused_low_balance" }));
      toast({ title: "⚠️ Session Paused — Wallet Low", variant: "destructive" });
    });

    // Session stop → call /api/pay-wallet
    socket.on("session:stop", async ({ sessionId, finalAmountPaise, durationSec }: any) => {
      setSessionHistory(prev => upsertSession(prev, { sessionId, status: "stopped", finalAmountPaise, elapsedSec: durationSec }));

      if (finalAmountPaise > 0) {
        setPaying(true);
        try {
          const res = await fetch(`${API_URL}/api/pay-wallet`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, sessionId }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || "Payment failed");
          if (d.newBalancePaise !== undefined) setWalletPaise(d.newBalancePaise);
          // payment:success will fire and update the record
        } catch (e: any) {
          toast({ title: "Payment error", description: e.message, variant: "destructive" });
        } finally {
          setPaying(false);
        }
      }
    });

    // Payment confirmed → mark history record as paid
    socket.on("payment:success", ({ sessionId, amountPaise, paymentId, method }: any) => {
      const endedAt = new Date().toISOString();
      setSessionHistory(prev =>
        upsertSession(prev, { sessionId, status: "paid", finalAmountPaise: amountPaise, paymentId, endedAt })
      );
      toast({ title: `✅ Paid ${fmtPaise(amountPaise)} via ${method}!` });
    });

    socket.on("wallet:update", ({ balancePaise }: any) => {
      if (balancePaise !== undefined) setWalletPaise(balancePaise);
    });

    return () => { socket.disconnect(); };
  }, [userId]);

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  const tabs = [
    { id: "home", label: "Home", icon: Zap },
    { id: "wallet", label: "Wallet", icon: Wallet },
    { id: "nearby", label: "Nearby", icon: MapPin },
    { id: "history", label: "History", icon: History },
  ];

  // Split history into active vs completed for the History tab
  const completedSessions = sessionHistory.filter(s => s.status === "paid" || s.status === "stopped");

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold text-foreground">
            STEAM<span className="neon-text">PAY</span>
          </span>
        </div>

        {/* Wallet + active indicator */}
        <div className="mx-4 mb-4 rounded-xl bg-primary/10 p-3">
          <p className="text-xs text-muted-foreground">Customer</p>
          <p className="font-display font-semibold text-foreground">{profile?.display_name || "Aarav Kumar"}</p>
          <p className="mt-1.5 flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-sm font-bold text-primary">{fmtPaise(walletPaise)}</span>
          </p>
          {activeSession?.status === "active" && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-green-400">
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              Live · {fmtPaise(activeSession.totalDebitedPaise)}
            </div>
          )}
        </div>

        {/* Scan button */}
        <div className="mx-4 mb-3">
          <button
            onClick={() => navigate("/scan")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:neon-glow"
          >
            <QrCode className="h-4 w-4" />Scan QR Code
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <t.icon className="h-4 w-4" />{t.label}
              {t.id === "history" && completedSessions.length > 0 && (
                <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                  {completedSessions.length}
                </span>
              )}
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

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <main className="ml-64 flex-1 p-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>

          {/* ══ HOME ═══════════════════════════════════════════════ */}
          {tab === "home" && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl font-bold text-foreground">
                  Hello, {profile?.display_name || "Aarav"} 👋
                </h1>
                <p className="text-sm text-muted-foreground">Pay-as-you-use · live sessions below</p>
              </div>

              {/* Payment processing banner */}
              <AnimatePresence>
                {paying && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="glass rounded-2xl p-4 flex items-center gap-3 border border-primary/30">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm font-medium text-foreground">Processing payment from wallet…</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Active session card */}
              <div className={`glass rounded-2xl p-6 ${activeSession?.status === "active" ? "neon-border" : ""}`}>
                {activeSession ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {activeSession.status === "active" ? "🟢 Live Session"
                            : activeSession.status === "paused_low_balance" ? "⚠️ Paused — Low Balance"
                              : "⏹ Stopping…"}
                        </p>
                        <p className="font-display text-xl font-bold text-foreground">
                          {SERVICE_ICONS[activeSession.serviceType] || "🔌"} {activeSession.merchantName}
                        </p>
                      </div>
                      {activeSession.status === "active" && (
                        <span className="flex items-center gap-1.5 text-sm text-primary">
                          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />Live
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
                        <p className="font-display text-3xl font-bold text-foreground font-mono">
                          {fmt(activeSession.elapsedSec)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Cost so far</p>
                        <p className="font-display text-3xl font-bold text-gradient">
                          {fmtPaise(activeSession.totalDebitedPaise)}
                        </p>
                      </div>
                    </div>

                    {/* Ads */}
                    {activeSession.ads && activeSession.ads.length > 0 && (
                      <div className="mb-4 rounded-xl bg-primary/5 border border-primary/20 p-3">
                        <p className="text-xs text-primary font-semibold mb-1">📣 {activeSession.merchantName}</p>
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
                        Low balance — top up or scan Stop QR to end
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
                  { label: "Wallet Balance", value: fmtPaise(walletPaise), icon: Wallet },
                  { label: "Rate", value: activeSession ? `₹${(activeSession.pricePerMinutePaise / 100).toFixed(0)}/min` : "—", icon: Clock },
                  { label: "Session Cost", value: activeSession ? fmtPaise(activeSession.totalDebitedPaise) : "—", icon: TrendingDown },
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

          {/* ══ WALLET ═════════════════════════════════════════════ */}
          {tab === "wallet" && <WalletPage />}

          {/* ══ NEARBY ═════════════════════════════════════════════ */}
          {tab === "nearby" && <NearbyPage />}

          {/* ══ HISTORY ════════════════════════════════════════════ */}
          {tab === "history" && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground">Session History</h2>
                <p className="text-xs text-muted-foreground">All sessions sync live — stored on this device</p>
              </div>

              {/* Active sessions inline */}
              {sessionHistory.filter(s => s.status === "active" || s.status === "paused_low_balance").map(s => (
                <motion.div key={s.sessionId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  className="glass rounded-2xl p-4 border border-primary/40 neon-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-lg">
                        {SERVICE_ICONS[s.serviceType] || "🔌"}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{s.merchantName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.startedAt).toLocaleTimeString("en-IN")} · {fmt(s.elapsedSec)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-primary text-gradient">{fmtPaise(s.totalDebitedPaise)}</p>
                      <span className="flex items-center gap-1 text-xs text-green-400 justify-end">
                        <CircleDot className="h-3 w-3 animate-pulse" />
                        {s.status === "active" ? "Live" : "Paused"}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Completed sessions */}
              {completedSessions.length === 0 && sessionHistory.filter(s => s.status === "active" || s.status === "paused_low_balance").length === 0 && (
                <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No sessions yet. Scan a merchant QR to start!</p>
                </div>
              )}

              {completedSessions.map(s => (
                <motion.div key={s.sessionId} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-lg">
                        {SERVICE_ICONS[s.serviceType] || "🔌"}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{s.merchantName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.startedAt).toLocaleString("en-IN")}
                          {" · "}{fmt(s.elapsedSec)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className="font-display font-bold text-foreground">
                          {fmtPaise(s.finalAmountPaise || s.totalDebitedPaise || 0)}
                        </p>
                        <span className={`flex items-center justify-end gap-1 text-xs ${s.status === "paid" ? "text-green-400" : "text-muted-foreground"}`}>
                          {s.status === "paid"
                            ? <><CheckCircle2 className="h-3 w-3" />Paid</>
                            : <><Square className="h-3 w-3" />Stopped</>
                          }
                        </span>
                      </div>
                      {s.status === "paid" && (
                        <button
                          onClick={() => navigate(`/invoice/${s.sessionId}`)}
                          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-primary hover:bg-primary/10"
                        >
                          <Download className="h-3 w-3" />Invoice
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Clear history */}
              {sessionHistory.length > 0 && (
                <button
                  onClick={() => {
                    setSessionHistory([]);
                    saveHistory(userId, []);
                  }}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Clear history
                </button>
              )}
            </div>
          )}

        </motion.div>
      </main>
    </div>
  );
}
