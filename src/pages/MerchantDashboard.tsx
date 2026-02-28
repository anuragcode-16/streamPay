/**
 * MerchantDashboard.tsx — Full Merchant View
 *
 * Tabs:
 *   overview  — stats + live sessions
 *   sessions  — all live sessions with customer info
 *   services  — manage services + generate QR per service
 *   ads       — advertisement manager (create/list)
 *   qr        — QR codes for the default merchant
 *   payments  — payment history
 *
 * Socket events:
 *   session:start, session:update, session:paused, session:stop, payment:success
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import QRCode from "react-qr-code";
import {
  Zap, BarChart3, Activity, Settings, LogOut, DollarSign, Plus,
  QrCode, Loader2, CheckCircle2, PauseCircle, AlertTriangle,
  Users, Megaphone, Wrench, X, LineChart, Bot, Receipt,
} from "lucide-react";
import AnalyticsDashboard from "@/components/analytics/AnalyticsDashboard";
import TaxAdvisorChat from "@/components/analytics/TaxAdvisorChat";
import { merchantPayments } from "@/data/merchantPayments";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const DEMO_MERCHANT_ID = "m_demo_gym001";
const DEMO_SERVICE_TYPE = "gym";
const VALID_TYPES = ["gym", "ev", "parking", "coworking", "wifi", "spa", "vending"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmt(sec: number) { return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; }
function formatPaise(p: number) { return `₹${(p / 100).toFixed(2)}`; }

interface LiveSession {
  sessionId: string; userId: string; merchantId: string;
  merchantName: string; serviceType: string; startedAt: string;
  pricePerMinutePaise: number; elapsedSec: number;
  totalDebitedPaise: number; status: "active" | "paused_low_balance" | "stopped" | "paid";
  paymentId?: string;
}

interface Payment { sessionId: string; paymentId: string; amountPaise: number; method: string; receivedAt: string; }
interface MerchantService { id: string; service_type: string; price_per_minute_paise: number; description: string; }
interface Ad { id: string; title: string; body: string; image_url: string; active: boolean; }

export default function MerchantDashboard() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState("overview");
  const [merchantId, setMerchantId] = useState(DEMO_MERCHANT_ID);
  const [liveSessions, setLiveSessions] = useState<Map<string, LiveSession>>(new Map());
  const [payments, setPayments] = useState<Payment[]>([]);
  const [services, setServices] = useState<MerchantService[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [qrPayloads, setQrPayloads] = useState<{ start: string; stop: string }>({
    start: btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "start" })),
    stop: btoa(JSON.stringify({ merchantId: DEMO_MERCHANT_ID, serviceType: DEMO_SERVICE_TYPE, action: "stop" })),
  });

  // Create Merchant form
  const [showCreate, setShowCreate] = useState(false);
  const [cf, setCf] = useState({ name: "", serviceType: "gym", pricePerMinute: "2", location: "", lat: "", lng: "" });
  const [creating, setCreating] = useState(false);

  // Add Service form
  const [showAddService, setShowAddService] = useState(false);
  const [sf, setSf] = useState({ serviceType: "gym", pricePerMinute: "2", description: "" });
  const [addingSvc, setAddingSvc] = useState(false);
  const [svcQr, setSvcQr] = useState<{ start: string; stop: string } | null>(null);

  // Ad form
  const [showAddAd, setShowAddAd] = useState(false);
  const [af, setAf] = useState({ title: "", body: "", imageUrl: "" });
  const [addingAd, setAddingAd] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const sessions = Array.from(liveSessions.values());
  const activeSessions = sessions.filter(s => s.status === "active");
  const totalRevenuePaise = payments.reduce((acc, p) => acc + p.amountPaise, 0);

  // ── Socket.IO ─────────────────────────────────────────────────────────────
  useEffect(() => {
    console.log(`[MerchantDashboard] Connecting socket.io to: ${API_URL}, joining: merchant:${merchantId}`);
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => {
      console.log(`[MerchantDashboard] Connected! Emitting join:merchant for ${merchantId}`);
      socket.emit("join:merchant", merchantId);
    });

    socket.on("session:start", (data: any) => {
      console.log(`[MerchantDashboard] Received 'session:start' event:`, data);
      setLiveSessions(prev => new Map(prev).set(data.sessionId, { ...data, elapsedSec: 0, totalDebitedPaise: 0, status: "active" }));
      toast({ title: "🟢 New Session!", description: `User ${data.userId?.slice(0, 8)}… started ${data.serviceType}` });
    });

    socket.on("session:update", ({ sessionId, elapsedSec, totalDebitedPaise }: any) => {
      setLiveSessions(prev => {
        const m = new Map(prev);
        const s = m.get(sessionId);
        if (s) m.set(sessionId, { ...s, elapsedSec, totalDebitedPaise, status: "active" });
        return m;
      });
    });

    socket.on("session:paused", ({ sessionId }: any) => {
      setLiveSessions(prev => {
        const m = new Map(prev); const s = m.get(sessionId);
        if (s) m.set(sessionId, { ...s, status: "paused_low_balance" });
        return m;
      });
    });

    socket.on("session:stop", ({ sessionId }: any) => {
      setLiveSessions(prev => {
        const m = new Map(prev); const s = m.get(sessionId);
        if (s) m.set(sessionId, { ...s, status: "stopped" });
        return m;
      });
    });

    socket.on("payment:success", ({ sessionId, paymentId, amountPaise, method }: any) => {
      setLiveSessions(prev => {
        const m = new Map(prev); const s = m.get(sessionId);
        if (s) m.set(sessionId, { ...s, status: "paid", paymentId });
        return m;
      });
      setPayments(prev => [{ sessionId, paymentId, amountPaise, method, receivedAt: new Date().toISOString() }, ...prev]);
      toast({ title: `💰 ₹${(amountPaise / 100).toFixed(2)} received via ${method}!` });
    });

    return () => { socket.disconnect(); };
  }, [merchantId]);

  // Fetch services + ads + active sessions on mount
  useEffect(() => { fetchServices(); fetchAds(); fetchActiveSessions(); }, [merchantId]);

  async function fetchActiveSessions() {
    try {
      const r = await fetch(`${API_URL}/api/sessions/active/${merchantId}`);
      const d = await r.json();
      if (!r.ok) return;
      const map = new Map<string, LiveSession>();
      (d.sessions || []).forEach((s: any) => map.set(s.sessionId, s));
      setLiveSessions(map);
    } catch { /* server offline */ }
  }

  async function fetchServices() {
    try {
      const r = await fetch(`${API_URL}/api/merchant/${merchantId}/services`);
      const d = await r.json();
      if (!r.ok) throw new Error("DB offline");
      setServices(d.services || []);
    } catch {
      // Fallback
      const local = localStorage.getItem(`services_${merchantId}`);
      if (local) setServices(JSON.parse(local));
    }
  }

  async function fetchAds() {
    try {
      const r = await fetch(`${API_URL}/api/ads/${merchantId}`);
      const d = await r.json();
      if (!r.ok) throw new Error("DB offline");
      setAds(d.ads || []);
    } catch {
      // Fallback
      const local = localStorage.getItem(`ads_${merchantId}`);
      if (local) setAds(JSON.parse(local));
    }
  }

  async function createMerchant() {
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/create-merchant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cf.name, serviceType: cf.serviceType, pricePerMinute: cf.pricePerMinute, location: cf.location, lat: cf.lat || undefined, lng: cf.lng || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMerchantId(data.merchant.id);
      setQrPayloads(data.qr);
      setShowCreate(false);
      toast({ title: "✅ Merchant created!", description: `ID: ${data.merchant.id}` });
    } catch (err: any) {
      // Fallback to local demo mode since DB is offline
      const demoId = `m_${Math.random().toString(36).substring(2, 10)}`;
      const qrData = {
        start: btoa(JSON.stringify({ merchantId: demoId, serviceType: cf.serviceType, action: "start" })),
        stop: btoa(JSON.stringify({ merchantId: demoId, serviceType: cf.serviceType, action: "stop" }))
      };

      setMerchantId(demoId);
      setQrPayloads(qrData);
      setShowCreate(false);
      toast({ title: "✅ Merchant created! (Local Demo)", description: `ID: ${demoId}` });
    } finally { setCreating(false); }
  }

  async function addService() {
    setAddingSvc(true);
    try {
      const res = await fetch(`${API_URL}/api/merchant/service`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId, serviceType: sf.serviceType, pricePerMinute: sf.pricePerMinute, description: sf.description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSvcQr(data.qr);
      setServices(prev => [...prev, data.service]);
      toast({ title: "Service added! QR generated." });
    } catch (err: any) {
      // Fallback local demo
      const demoSvcId = `svc_${Math.random().toString(36).substring(2, 8)}`;
      const newSvc = {
        id: demoSvcId,
        service_type: sf.serviceType,
        price_per_minute_paise: Math.round(parseFloat(sf.pricePerMinute || "2") * 100),
        description: sf.description,
      };
      const qrData = {
        start: btoa(JSON.stringify({ merchantId, merchantServiceId: demoSvcId, serviceType: sf.serviceType, action: "start" })),
        stop: btoa(JSON.stringify({ merchantId, merchantServiceId: demoSvcId, serviceType: sf.serviceType, action: "stop" }))
      };

      const updated = [...services, newSvc];
      setServices(updated);
      setSvcQr(qrData);
      localStorage.setItem(`services_${merchantId}`, JSON.stringify(updated));
      toast({ title: "Service added (Local mode)! QR generated." });
    } finally { setAddingSvc(false); }
  }

  async function createAd() {
    setAddingAd(true);
    try {
      const res = await fetch(`${API_URL}/api/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId, title: af.title, body: af.body, imageUrl: af.imageUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAds(prev => [data.ad, ...prev]);
      setShowAddAd(false);
      setAf({ title: "", body: "", imageUrl: "" });
      toast({ title: "Ad created! Shown to active customers." });
    } catch (err: any) {
      // Fallback local demo
      const newAd = { id: `ad_${Math.random().toString(36).substring(2, 8)}`, title: af.title, body: af.body, image_url: af.imageUrl, active: true };
      const updated = [newAd, ...ads];
      setAds(updated);
      localStorage.setItem(`ads_${merchantId}`, JSON.stringify(updated));
      setShowAddAd(false);
      setAf({ title: "", body: "", imageUrl: "" });
      toast({ title: "Ad created (Local mode)!" });
    } finally { setAddingAd(false); }
  }

  const statusColors: Record<string, string> = {
    active: "text-primary bg-primary/10",
    paused_low_balance: "text-yellow-400 bg-yellow-400/10",
    stopped: "text-muted-foreground bg-muted",
    paid: "text-green-400 bg-green-400/10",
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "analytics", label: "Analytics", icon: LineChart },
    { id: "sessions", label: "Sessions", icon: Activity },
    { id: "services", label: "Services", icon: Wrench },
    { id: "ads", label: "Ads", icon: Megaphone },
    { id: "qr", label: "QR Codes", icon: QrCode },
    { id: "payments", label: "Payments", icon: Receipt },
    { id: "tax", label: "Tax Advisor", icon: Bot },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold text-foreground">STREAM<span className="neon-text">PAY</span></span>
        </div>

        <div className="mx-4 mb-4 rounded-xl bg-primary/10 p-3">
          <p className="text-xs text-muted-foreground">Merchant</p>
          <p className="font-display font-semibold text-foreground">{profile?.display_name || cf.name || "PowerZone Gym"}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground truncate">{merchantId}</p>
          {activeSessions.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-primary">
              <span className="pulse-dot h-2 w-2 rounded-full bg-primary" />
              {activeSessions.length} live session{activeSessions.length > 1 ? "s" : ""}
            </div>
          )}
        </div>

        <div className="mx-4 mb-3">
          <button onClick={() => setShowCreate(!showCreate)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10">
            <Plus className="h-3.5 w-3.5" />Create Merchant
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

          {/* Create merchant inline form */}
          <AnimatePresence>
            {showCreate && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="mb-6 glass rounded-2xl p-5 neon-border overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-lg font-semibold text-foreground">Create New Merchant</h3>
                  <button onClick={() => setShowCreate(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { key: "name", ph: "Business name" }, { key: "location", ph: "Location" },
                    { key: "pricePerMinute", ph: "₹/min", type: "number" },
                    { key: "lat", ph: "Latitude (e.g., 28.6328)" }, { key: "lng", ph: "Longitude (e.g., 77.2197)" },
                  ].map(({ key, ph, type }) => (
                    <input key={key} type={type || "text"} value={(cf as any)[key]}
                      onChange={e => setCf({ ...cf, [key]: e.target.value })} placeholder={ph}
                      className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none" />
                  ))}
                  <select value={cf.serviceType} onChange={e => setCf({ ...cf, serviceType: e.target.value })}
                    className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none">
                    {VALID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button onClick={createMerchant} disabled={creating || !cf.name}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:neon-glow disabled:opacity-50">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create & Get QR
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── OVERVIEW ───────────────────────────────────────────────────── */}
          {tab === "overview" && (() => {
            const paid500 = merchantPayments.filter(p => p.status === "paid");
            const totalRev500 = paid500.reduce((s, p) => s + p.amountINR, 0);
            const gstCollected = paid500.reduce((s, p) => s + p.gstAmountINR, 0);
            const netRev500 = paid500.reduce((s, p) => s + p.baseAmountINR, 0);
            return (
              <div className="space-y-6">
                <div>
                  <h1 className="font-display text-3xl font-bold text-foreground">Merchant Dashboard</h1>
                  <p className="text-sm text-muted-foreground">FY 2024-25 · Real-time sessions &amp; revenue overview</p>
                </div>

                {/* ── KPI grid ── */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      label: "Active Sessions",
                      value: String(activeSessions.length),
                      sub: `${sessions.length} total today`,
                      icon: Activity,
                      color: "text-primary",
                      bg: "bg-primary/10",
                    },
                    {
                      label: "Total Revenue",
                      value: `₹${(totalRev500 / 1000).toFixed(1)}K`,
                      sub: `Net of GST · FY 24-25`,
                      icon: DollarSign,
                      color: "text-green-400",
                      bg: "bg-green-500/10",
                    },
                    {
                      label: "GST Collected",
                      value: `₹${(gstCollected / 1000).toFixed(1)}K`,
                      sub: `Payable to govt.`,
                      icon: CheckCircle2,
                      color: "text-blue-400",
                      bg: "bg-blue-500/10",
                    },
                    {
                      label: "Payments",
                      value: String(paid500.length),
                      sub: `₹${(totalRev500 + gstCollected).toFixed(0)} gross billed`,
                      icon: Users,
                      color: "text-purple-400",
                      bg: "bg-purple-500/10",
                    },
                  ].map((s, i) => (
                    <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                      className="glass rounded-2xl p-5 cursor-pointer hover:border-primary/40 border border-transparent transition-all"
                      onClick={() => s.label === "GST Collected" || s.label === "Total Revenue" || s.label === "Payments" ? setTab("payments") : setTab("sessions")}>
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.bg} mb-3`}>
                        <s.icon className={`h-5 w-5 ${s.color}`} />
                      </div>
                      <p className={`font-display text-2xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-sm font-medium text-foreground">{s.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
                    </motion.div>
                  ))}
                </div>

                {/* ── Revenue by service ── */}
                <div className="glass rounded-2xl p-5">
                  <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />Revenue by Service Type (FY 24-25)
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(
                      paid500.reduce((acc, p) => {
                        acc[p.serviceType] = (acc[p.serviceType] || 0) + p.baseAmountINR;
                        return acc;
                      }, {} as Record<string, number>)
                    )
                      .sort(([, a], [, b]) => b - a)
                      .map(([svc, rev]) => {
                        const pct = Math.round((rev / netRev500) * 100);
                        return (
                          <div key={svc}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="capitalize font-medium text-foreground">{svc}</span>
                              <span className="text-muted-foreground">₹{rev.toFixed(0)} ({pct}%)</span>
                            </div>
                            <div className="h-2 rounded-full bg-secondary overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.3, duration: 0.6 }}
                                className="h-full rounded-full bg-gradient-to-r from-primary to-purple-500"
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Recent live sessions */}
                <div>
                  <h3 className="font-display font-semibold text-foreground mb-3">Live Sessions</h3>
                  <SessionsList sessions={sessions.slice(0, 5)} statusColors={statusColors} fmt={fmt} formatPaise={formatPaise} />
                </div>
              </div>
            );
          })()}


          {/* ── ANALYTICS ──────────────────────────────────────────────────── */}
          {tab === "analytics" && <AnalyticsDashboard payments={payments} liveSessions={liveSessions} />}

          {/* ── SESSIONS ───────────────────────────────────────────────────── */}
          {tab === "sessions" && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl font-bold text-foreground">Live Sessions</h2>
              <SessionsList sessions={sessions} statusColors={statusColors} fmt={fmt} formatPaise={formatPaise} />
            </div>
          )}

          {/* ── SERVICES ───────────────────────────────────────────────────── */}
          {tab === "services" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold text-foreground">Services</h2>
                <button onClick={() => setShowAddService(!showAddService)}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:neon-glow">
                  <Plus className="h-4 w-4" />Add Service
                </button>
              </div>

              <AnimatePresence>
                {showAddService && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="glass rounded-2xl p-5 neon-border overflow-hidden">
                    <p className="font-display font-semibold text-foreground mb-4">Add Service</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      <select value={sf.serviceType} onChange={e => setSf({ ...sf, serviceType: e.target.value })}
                        className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none">
                        {VALID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input type="number" value={sf.pricePerMinute} onChange={e => setSf({ ...sf, pricePerMinute: e.target.value })}
                        placeholder="₹/min" className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none" />
                      <input value={sf.description} onChange={e => setSf({ ...sf, description: e.target.value })}
                        placeholder="Description" className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none" />
                    </div>
                    <button onClick={addService} disabled={addingSvc}
                      className="mt-3 flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
                      {addingSvc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add &amp; Generate QR
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Service QR result */}
              {svcQr && (
                <div className="glass rounded-2xl p-5">
                  <p className="font-display font-semibold text-foreground mb-4">Service QR Codes</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[{ label: "START", qr: svcQr.start }, { label: "STOP", qr: svcQr.stop }].map(({ label, qr }) => (
                      <div key={label} className="text-center rounded-xl bg-secondary/40 p-4">
                        <p className="mb-2 text-xs font-bold text-muted-foreground">{label}</p>
                        <div className="flex justify-center rounded-xl bg-white p-3">
                          <QRCode value={qr} size={120} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Service list */}
              <div className="space-y-3">
                {services.map(svc => (
                  <div key={svc.id} className="glass rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground capitalize">{svc.service_type}</p>
                      <p className="text-xs text-muted-foreground">{svc.description || "No description"}</p>
                    </div>
                    <p className="font-display font-bold text-gradient">{formatPaise(svc.price_per_minute_paise)}<span className="text-xs text-muted-foreground">/min</span></p>
                  </div>
                ))}
                {services.length === 0 && <p className="text-sm text-muted-foreground">No services yet. Add one above.</p>}
              </div>
            </div>
          )}

          {/* ── ADS ─────────────────────────────────────────────────────────── */}
          {tab === "ads" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold text-foreground">Advertisement Manager</h2>
                <button onClick={() => setShowAddAd(!showAddAd)}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:neon-glow">
                  <Plus className="h-4 w-4" />Create Ad
                </button>
              </div>

              <div className="glass rounded-2xl p-4 text-sm text-muted-foreground bg-primary/5 border border-primary/20">
                <p>💡 Ads are displayed to active customers on their session screen and to users browsing nearby services.</p>
              </div>

              <AnimatePresence>
                {showAddAd && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="glass rounded-2xl p-5 neon-border overflow-hidden">
                    <div className="space-y-3">
                      <input value={af.title} onChange={e => setAf({ ...af, title: e.target.value })}
                        placeholder="Ad title e.g. 🎉 New Year Offer!" className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none" />
                      <textarea value={af.body} onChange={e => setAf({ ...af, body: e.target.value })}
                        placeholder="Ad body text…" rows={3} className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none" />
                      <input value={af.imageUrl} onChange={e => setAf({ ...af, imageUrl: e.target.value })}
                        placeholder="Image URL (optional)" className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none" />
                    </div>
                    <button onClick={createAd} disabled={addingAd || !af.title}
                      className="mt-3 flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
                      {addingAd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}Publish Ad
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-3">
                {ads.map(ad => (
                  <div key={ad.id} className="glass rounded-2xl p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-display font-semibold text-foreground">{ad.title}</p>
                        {ad.body && <p className="text-sm text-muted-foreground mt-1">{ad.body}</p>}
                      </div>
                      <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">Active</span>
                    </div>
                  </div>
                ))}
                {ads.length === 0 && <p className="text-sm text-muted-foreground">No ads yet. Create one to promote your business to active customers.</p>}
              </div>
            </div>
          )}

          {/* ── QR CODES ───────────────────────────────────────────────────── */}
          {tab === "qr" && (
            <div className="space-y-5">
              <h2 className="font-display text-2xl font-bold text-foreground">QR Codes</h2>
              <p className="text-sm text-muted-foreground">Print and place these at your location. Merchant ID: <span className="font-mono text-primary">{merchantId}</span></p>
              <div className="grid gap-6 sm:grid-cols-2">
                {[{ label: "START QR — Customer scans to begin session", qr: qrPayloads.start, border: "border-primary/30" },
                { label: "STOP QR — Customer scans to end & pay", qr: qrPayloads.stop, border: "border-destructive/30" }].map(({ label, qr, border }) => (
                  <div key={label} className={`glass rounded-2xl p-5 border ${border} text-center`}>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                    <div className="flex justify-center rounded-xl bg-white p-4 mb-3">
                      <QRCode value={qr} size={160} />
                    </div>
                    <p className="font-mono text-xs text-muted-foreground break-all">{qr.slice(0, 50)}…</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── PAYMENTS ────────────────────────────────────────────────────── */}
          {tab === "payments" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold text-foreground">Payments &amp; GST Ledger</h2>
                <button onClick={() => setTab("tax")} className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20">
                  <Bot className="h-4 w-4" />Tax Advisor AI
                </button>
              </div>

              {/* GST summary strip */}
              {(() => {
                const p500 = merchantPayments.filter(p => p.status === "paid");
                const totalBill = p500.reduce((s, p) => s + p.amountINR, 0);
                const totalGST = p500.reduce((s, p) => s + p.gstAmountINR, 0);
                const totalBase = p500.reduce((s, p) => s + p.baseAmountINR, 0);
                return (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Total Billed (incl. GST)", value: `₹${totalBill.toFixed(0)}` },
                      { label: "GST Collected", value: `₹${totalGST.toFixed(0)}` },
                      { label: "Net Revenue", value: `₹${totalBase.toFixed(0)}` },
                    ].map(k => (
                      <div key={k.label} className="glass rounded-2xl p-4 text-center">
                        <p className="font-display text-xl font-bold text-primary">{k.value}</p>
                        <p className="text-xs text-muted-foreground">{k.label}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* 500 payment records table */}
              <div className="glass rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border bg-secondary/40">
                      <tr>
                        {["Date", "Service", "HSN", "Base (₹)", "GST%", "GST (₹)", "Total (₹)", "Method", "Status"].map(h => (
                          <th key={h} className="px-3 py-3 text-left font-semibold text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {merchantPayments.slice(0, 50).map((p, i) => (
                        <tr key={p.id} className={`border-b border-border/40 hover:bg-secondary/30 ${i % 2 === 0 ? "" : "bg-secondary/10"}`}>
                          <td className="px-3 py-2 text-muted-foreground">{p.date.slice(0, 10)}</td>
                          <td className="px-3 py-2 font-medium capitalize">{p.serviceType}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{p.hsn}</td>
                          <td className="px-3 py-2">{p.baseAmountINR.toFixed(2)}</td>
                          <td className="px-3 py-2 text-blue-400">{p.gstRate}%</td>
                          <td className="px-3 py-2 text-blue-400">{p.gstAmountINR.toFixed(2)}</td>
                          <td className="px-3 py-2 font-bold text-green-400">{p.amountINR.toFixed(2)}</td>
                          <td className="px-3 py-2 capitalize">{p.paymentMethod}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 font-semibold ${p.status === "paid" ? "bg-green-500/15 text-green-400" :
                              p.status === "refunded" ? "bg-red-500/15 text-red-400" :
                                "bg-yellow-500/15 text-yellow-400"
                              }`}>{p.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 text-center text-xs text-muted-foreground border-t border-border">
                  Showing 50 of 500 records &middot; <button className="text-primary hover:underline" onClick={() => setTab("tax")}>Ask Tax Advisor AI for full analysis →</button>
                </div>
              </div>
            </div>
          )}

          {/* ── TAX ADVISOR ────────────────────────────────────────────── */}
          {tab === "tax" && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground">Tax Advisor AI</h2>
                <p className="text-sm text-muted-foreground">Powered by Gemini · Indian GST · ITR · TDS · MSME Compliance</p>
              </div>
              <TaxAdvisorChat />
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

// ── Sessions list sub-component ───────────────────────────────────────────────
function SessionsList({ sessions, statusColors, fmt, formatPaise }: any) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No sessions yet. Share your QR code!</p>;
  }
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <AnimatePresence>
        {sessions.map((s: LiveSession) => (
          <motion.div key={s.sessionId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${statusColors[s.status] || "bg-muted"}`}>
                {s.status === "paid" ? <CheckCircle2 className="h-4 w-4" /> : s.status === "paused_low_balance" ? <PauseCircle className="h-4 w-4" /> : s.status === "stopped" ? <AlertTriangle className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{'User ' + s.userId?.slice(0, 10) + '…'}</p>
                <p className="text-xs text-muted-foreground">{s.serviceType} · {fmt(s.elapsedSec)}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-display font-bold text-foreground">{formatPaise(s.totalDebitedPaise)}</p>
              <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${statusColors[s.status]}`}>{s.status}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
