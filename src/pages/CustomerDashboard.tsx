/**
 * CustomerDashboard.tsx — Live-updating customer view
 *
 * Session list is driven LIVE by Socket.IO events:
 *   session:start   → adds a row to the session list as "active"
 *   session:update  → updates elapsed time + running cost on that row
 *   session:paused  → marks row as paused (low balance)
 *   session:stop    → calls /api/pay-wallet, updates row to "stopped"
 *   payment:success → marks row as "paid"
 *   wallet:update   → updates sidebar balance
 *
 * History tab merges the live list with API-fetched historical records.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import {
  Zap, Wallet, QrCode, MapPin, History, LogOut, Clock,
  AlertTriangle, CheckCircle2, Loader2, TrendingDown,
  Download, Play, Square, CreditCard, Megaphone, X, Menu,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import WalletPage from "./WalletPage";
import NearbyPage from "./NearbyPage";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmt(sec: number) { return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; }
function rupee(p: number) { return `₹${(p / 100).toFixed(2)}`; }

const SVC = (t: string) => ({ gym: "🏋️", ev: "⚡", parking: "🅿️", coworking: "💼", wifi: "📶", spa: "🧖", vending: "🤖" }[t] || "🔌");

type SessionStatus = "active" | "paused_low_balance" | "stopped" | "paid";

interface SessionRow {
  id: string;
  merchantId: string;
  merchantName: string;
  serviceType: string;
  startedAt: string;
  endedAt?: string;
  pricePerMinutePaise: number;
  elapsedSec: number;
  totalDebitedPaise: number;
  finalAmountPaise: number;
  paymentStatus: "pending" | "paid";
  status: SessionStatus;
  ads?: any[];
}

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const { profile, user, signOut } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletPaise, setWalletPaise] = useState(0);
  // Live session map (socket-driven)
  const [sessionMap, setSessionMap] = useState<Map<string, SessionRow>>(new Map());
  // Historical sessions from API
  const [apiSessions, setApiSessions] = useState<any[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payingSessionId, setPayingSessionId] = useState<string | null>(null);
  const [liveAds, setLiveAds] = useState<any[]>([]);
  const [dismissedAds, setDismissedAds] = useState<Set<string>>(new Set());

  const socketRef = useRef<Socket | null>(null);
  const userId = user?.id || "user_demo_customer";

  // Derived: active session (most recent active or paused)
  const activeSessions = [...sessionMap.values()].filter(s => s.status === "active" || s.status === "paused_low_balance");
  const activeSession = activeSessions[0] ?? null;
  const allLiveSessions = [...sessionMap.values()].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  // ── Helpers ─────────────────────────────────────────────────────────────
  function updateSession(id: string, patch: Partial<SessionRow>) {
    setSessionMap(prev => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, ...patch });
      return next;
    });
  }

  // ── Fetch wallet on mount ────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/wallet/${userId}`)
      .then(r => r.json())
      .then(d => { if (d.wallet) setWalletPaise(d.wallet.balance_paise); })
      .catch(() => { });
  }, [userId]);

  // ── Fetch active sessions on mount ───────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/sessions/active/user/${userId}`)
      .then(r => r.json())
      .then(d => {
        if (d.sessions && d.sessions.length > 0) {
          setSessionMap(prev => {
            const next = new Map(prev);
            d.sessions.forEach((s: any) => {
              const row: SessionRow = {
                id: s.sessionId,
                merchantId: s.merchantId,
                merchantName: s.merchantName || "Merchant",
                serviceType: s.serviceType || "gym",
                startedAt: s.startedAt,
                pricePerMinutePaise: s.pricePerMinutePaise || 0,
                elapsedSec: s.elapsedSec || 0,
                totalDebitedPaise: s.totalDebitedPaise || 0,
                finalAmountPaise: 0,
                paymentStatus: "pending",
                status: s.status as SessionStatus,
                ads: [],
              };
              next.set(row.id, row);
            });
            return next;
          });
        }
      })
      .catch(() => { });
  }, [userId]);

  // ── Socket.IO ────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join:user", userId);
      socket.emit("join:ads");  // Subscribe to live merchant ads
      console.log("[Customer] Socket connected, room: user:", userId);
    });

    // Live ad from merchant
    socket.on("ad:new", (ad: any) => {
      setLiveAds(prev => [ad, ...prev].slice(0, 5)); // keep newest 5
      toast({ title: `📢 New Promotion from ${ad.merchant_id || "a merchant"}!`, description: ad.title });
    });

    // Session STARTED
    socket.on("session:start", (data: any) => {
      const row: SessionRow = {
        id: data.sessionId,
        merchantId: data.merchantId,
        merchantName: data.merchantName || "Merchant",
        serviceType: data.serviceType || "gym",
        startedAt: data.startedAt || new Date().toISOString(),
        pricePerMinutePaise: data.pricePerMinutePaise || 0,
        elapsedSec: 0,
        totalDebitedPaise: 0,
        finalAmountPaise: 0,
        paymentStatus: "pending",
        status: "active",
        ads: data.ads || [],
      };
      setSessionMap(prev => new Map(prev).set(row.id, row));
      toast({ title: "▶️ Session Started!", description: `${row.merchantName} · ${rupee(row.pricePerMinutePaise)}/min` });
    });

    // Session TICKING
    socket.on("session:update", ({ sessionId, elapsedSec, totalDebitedPaise, walletBalancePaise }: any) => {
      updateSession(sessionId, { elapsedSec, totalDebitedPaise, status: "active" });
      if (walletBalancePaise !== undefined) setWalletPaise(walletBalancePaise);
    });

    // Session PAUSED
    socket.on("session:paused", ({ sessionId }: any) => {
      updateSession(sessionId, { status: "paused_low_balance" });
      toast({ title: "⚠️ Session Paused — Wallet Low", variant: "destructive" });
    });

    // Session STOPPED → auto pay from wallet
    socket.on("session:stop", async ({ sessionId, finalAmountPaise, durationSec }: any) => {
      updateSession(sessionId, { status: "stopped", finalAmountPaise, elapsedSec: durationSec });

      if (finalAmountPaise > 0) {
        setPaying(true);
        setPayingSessionId(sessionId);
        try {
          const res = await fetch(`${API_URL}/api/pay-wallet`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, sessionId }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || "Payment failed");
          if (d.newBalancePaise !== undefined) setWalletPaise(d.newBalancePaise);
          // payment:success event will set paymentStatus = "paid"
        } catch (e: any) {
          toast({ title: "Payment error", description: e.message, variant: "destructive" });
        } finally {
          setPaying(false);
          setPayingSessionId(null);
        }
      }
    });

    // Payment CONFIRMED
    socket.on("payment:success", ({ sessionId, amountPaise, method }: any) => {
      updateSession(sessionId, { paymentStatus: "paid", finalAmountPaise: amountPaise });
      toast({ title: `✅ ${rupee(amountPaise)} paid via ${method}!` });
    });

    // Wallet balance from server
    socket.on("wallet:update", ({ balancePaise }: any) => {
      if (balancePaise !== undefined) setWalletPaise(balancePaise);
    });

    return () => { socket.disconnect(); };
  }, [userId]);

  // ── Fetch existing ads on mount ──────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/ads`)
      .then(r => r.json())
      .then(d => { if (d.ads?.length) setLiveAds(d.ads.slice(0, 5)); })
      .catch(() => { });
  }, []);

  // ── Local smooth timer for active session ────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionMap(prev => {
        const next = new Map(prev);
        for (const [id, s] of next) {
          if (s.status === "active") next.set(id, { ...s, elapsedSec: s.elapsedSec + 1 });
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Fetch historical sessions from API ───────────────────────────────────
  async function fetchHistory() {
    setLoadingTx(true);
    try {
      const res = await fetch(`${API_URL}/api/transactions/${userId}`);
      const d = await res.json();
      setApiSessions(d.sessions || []);
    } catch { }
    finally { setLoadingTx(false); }
  }

  useEffect(() => { if (tab === "history") fetchHistory(); }, [tab]);

  // Merge live sessions with API history, deduped by id
  const liveIds = new Set(allLiveSessions.map(s => s.id));
  const mergedHistory: any[] = [
    ...allLiveSessions,
    ...apiSessions.filter(s => !liveIds.has(s.id)),
  ];

  // ── Nav tabs ─────────────────────────────────────────────────────────────
  const tabs = [
    { id: "home", label: "Home", icon: Zap },
    { id: "wallet", label: "Wallet", icon: Wallet },
    { id: "nearby", label: "Nearby", icon: MapPin },
    { id: "history", label: "History", icon: History },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 w-full z-30 flex items-center justify-between border-b border-border bg-card p-4">
        <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-foreground">
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <span className="font-display font-bold text-lg">STREAM<span className="neon-text">PAY</span></span>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-border bg-card transition-transform duration-300 md:translate-x-0 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold">STREAM<span className="neon-text">PAY</span></span>
          </div>
          <button className="md:hidden p-1 text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Wallet balance */}
        <div className="mx-4 mb-4 rounded-xl bg-primary/10 p-3">
          <p className="text-xs text-muted-foreground">Customer</p>
          <p className="font-display font-semibold text-foreground">{profile?.display_name || "Customer"}</p>
          <p className="mt-1.5 flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-sm font-bold text-primary">{rupee(walletPaise)}</span>
          </p>
          {activeSession && (
            <div className="mt-1 flex items-center gap-1 text-xs text-primary">
              <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
              Streaming…
            </div>
          )}
        </div>

        {/* Scan QR button */}
        <div className="mx-4 mb-3">
          <button onClick={() => navigate("/scan")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-sm text-primary-foreground hover:neon-glow">
            <QrCode className="h-4 w-4" />Scan QR Code
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setMobileMenuOpen(false); }}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              <t.icon className="h-4 w-4" />{t.label}
              {t.id === "history" && allLiveSessions.length > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-bold text-primary">
                  {allLiveSessions.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <button onClick={async () => { await signOut(); navigate("/"); }}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="h-4 w-4" />Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <main className="flex-1 w-full md:ml-64 p-4 pt-24 md:p-8 md:pt-8 min-w-0">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>

          {/* ── HOME ─────────────────────────────────────────────── */}
          {tab === "home" && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl font-bold text-foreground">
                  Hello, {profile?.display_name || "Customer"}
                </h1>
                <p className="text-sm text-muted-foreground">Pay as you use — in real time</p>
              </div>

              {/* ── Live Ads Banner ──────────────────────────────── */}
              <AnimatePresence>
                {liveAds.filter(ad => !dismissedAds.has(ad.id)).length > 0 && (
                  <div className="space-y-2">
                    {liveAds.filter(ad => !dismissedAds.has(ad.id)).map(ad => (
                      <motion.div
                        key={ad.id}
                        initial={{ opacity: 0, y: -12, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.97 }}
                        transition={{ duration: 0.25 }}
                        className="relative rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 overflow-hidden"
                      >
                        {/* glow ring */}
                        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-primary/20" />
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/20">
                            <Megaphone className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground text-sm">{ad.title}</p>
                            {ad.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ad.body}</p>}
                            {ad.image_url && (
                              <img src={ad.image_url} alt={ad.title} className="mt-2 rounded-xl max-h-32 object-cover w-full" />
                            )}
                          </div>
                          <button
                            onClick={() => setDismissedAds(prev => new Set([...prev, ad.id]))}
                            className="flex-shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          <span className="text-[10px] text-primary/70 font-medium tracking-wide">LIVE PROMOTION</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>

              {/* Payment processing indicator */}
              <AnimatePresence>
                {paying && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="glass rounded-2xl p-4 flex items-center gap-3 border border-primary/30">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <p className="text-sm font-medium">Processing wallet payment…</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Active session card */}
              <div className={`glass rounded-2xl p-6 ${activeSession ? "neon-border" : ""}`}>
                {activeSession ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {activeSession.status === "active" ? "🟢 Live Session" : "⚠️ Session Paused"}
                        </p>
                        <p className="font-display text-xl font-bold">
                          {SVC(activeSession.serviceType)} {activeSession.merchantName}
                        </p>
                      </div>
                      {activeSession.status === "active" && (
                        <span className="flex items-center gap-1.5 text-sm text-primary">
                          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />Streaming
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Elapsed</p>
                        <p className="font-display text-4xl font-bold text-foreground tabular-nums">
                          {fmt(activeSession.elapsedSec)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Cost so far</p>
                        <p className="font-display text-4xl font-bold text-gradient tabular-nums">
                          {rupee(activeSession.totalDebitedPaise)}
                        </p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-4 h-1.5 rounded-full bg-muted overflow-hidden">
                      <motion.div className="h-full bg-primary rounded-full"
                        animate={{ width: `${Math.min(100, (activeSession.totalDebitedPaise / Math.max(walletPaise + activeSession.totalDebitedPaise, 1)) * 100)}%` }} />
                    </div>

                    {activeSession.ads && activeSession.ads.length > 0 && (
                      <div className="mb-4 rounded-xl bg-primary/5 border border-primary/20 p-3">
                        <p className="text-xs text-primary font-semibold mb-1">📣 {activeSession.merchantName}</p>
                        {activeSession.ads.map((ad: any) => (
                          <div key={ad.id || ad.title}>
                            <p className="text-sm font-medium">{ad.title}</p>
                            {ad.body && <p className="text-xs text-muted-foreground">{ad.body}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {activeSession.status === "paused_low_balance" && (
                      <div className="mb-4 flex items-center gap-2 rounded-xl bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
                        <AlertTriangle className="h-4 w-4" />
                        Balance too low — top up or scan STOP QR to end
                      </div>
                    )}

                    <button onClick={() => navigate("/scan")}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive py-3 font-bold text-destructive-foreground">
                      <QrCode className="h-4 w-4" />Scan STOP QR to End Session
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center py-10 gap-4">
                    <QrCode className="h-14 w-14 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No active session</p>
                    <button onClick={() => navigate("/scan")}
                      className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:neon-glow">
                      <Play className="h-4 w-4" />Scan START QR to Begin
                    </button>
                  </div>
                )}
              </div>

              {/* Quick stats */}
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                {[
                  { label: "Wallet Balance", value: rupee(walletPaise), icon: Wallet },
                  { label: "Rate", value: activeSession ? `${rupee(activeSession.pricePerMinutePaise)}/min` : "—", icon: Zap },
                  { label: "Session Cost", value: activeSession ? rupee(activeSession.totalDebitedPaise) : "—", icon: TrendingDown },
                  { label: "Elapsed Time", value: activeSession ? fmt(activeSession.elapsedSec) : "—", icon: Clock },
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

          {/* ── WALLET ───────────────────────────────────────────── */}
          {tab === "wallet" && <WalletPage onBalanceChange={setWalletPaise} />}

          {/* ── NEARBY ───────────────────────────────────────────── */}
          {tab === "nearby" && <NearbyPage />}

          {/* ── HISTORY ──────────────────────────────────────────── */}
          {tab === "history" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold">Session History</h2>
                <button onClick={fetchHistory}
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Loader2 className={`h-3 w-3 ${loadingTx ? "animate-spin" : ""}`} />Refresh
                </button>
              </div>

              {mergedHistory.length === 0 ? (
                <div className="glass rounded-2xl p-12 text-center">
                  <History className="h-12 w-12 mx-auto text-muted-foreground opacity-30 mb-3" />
                  <p className="text-muted-foreground">No sessions yet. Scan a QR code to start!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mergedHistory.map((s: any) => {
                    // Normalise fields (live row vs API row)
                    const id = s.id || s.sessionId;
                    const name = s.merchantName || s.merchant_name || "Merchant";
                    const svc = s.serviceType || s.service_type || "gym";
                    const ts = s.startedAt || s.started_at;
                    const final = s.finalAmountPaise ?? s.final_amount_paise ?? 0;
                    const running = s.totalDebitedPaise ?? 0;
                    const elapsed = s.elapsedSec ?? 0;
                    const paidStatus = s.paymentStatus ?? s.payment_status ?? "pending";
                    const sessionStatus = s.status ?? "stopped";
                    const isLive = sessionStatus === "active" || sessionStatus === "paused_low_balance";

                    return (
                      <motion.div key={id}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className={`glass rounded-2xl p-4 border ${isLive ? "border-primary/40" : "border-border"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xl shrink-0">
                              {SVC(svc)}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">{name}</p>
                              <p className="text-xs text-muted-foreground">
                                {ts ? new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {isLive ? (
                              <>
                                <p className="font-display font-bold text-gradient tabular-nums">
                                  {rupee(running)}
                                </p>
                                <p className="text-xs text-primary font-mono">{fmt(elapsed)}</p>
                              </>
                            ) : (
                              <>
                                <p className="font-display font-bold text-foreground">{rupee(final)}</p>
                                <span className={`text-xs font-semibold ${paidStatus === "paid" ? "text-green-400" : "text-muted-foreground"}`}>
                                  {paidStatus === "paid" ? "✓ paid" : sessionStatus}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Status row */}
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isLive && sessionStatus === "active" && (
                              <span className="flex items-center gap-1 text-xs text-primary">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />Live
                              </span>
                            )}
                            {sessionStatus === "paused_low_balance" && (
                              <span className="flex items-center gap-1 text-xs text-yellow-400">
                                <AlertTriangle className="h-3 w-3" />Paused
                              </span>
                            )}
                            {paidStatus === "paid" && !isLive && (
                              <span className="flex items-center gap-1 text-xs text-green-400">
                                <CheckCircle2 className="h-3 w-3" />Payment complete
                              </span>
                            )}
                            {paying && payingSessionId === id && (
                              <span className="flex items-center gap-1 text-xs text-primary">
                                <Loader2 className="h-3 w-3 animate-spin" />Paying…
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {isLive && (
                              <button onClick={() => navigate("/scan")}
                                className="flex items-center gap-1 rounded-lg bg-destructive/10 border border-destructive/30 px-2 py-1 text-xs font-bold text-destructive">
                                <Square className="h-3 w-3" />Stop
                              </button>
                            )}
                            {paidStatus === "paid" && (
                              <button onClick={() => navigate(`/invoice/${id}`)}
                                className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-primary hover:bg-primary/10">
                                <Download className="h-3 w-3" />Invoice
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </motion.div>
      </main>
    </div>
  );
}
