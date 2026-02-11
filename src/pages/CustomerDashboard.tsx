import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Zap, Wallet, QrCode, History, Settings, LogOut,
  Play, Square, Clock, TrendingDown, ArrowDownLeft, ArrowUpRight
} from "lucide-react";

const mockHistory = [
  { id: 1, merchant: "FitZone Gym", duration: "32 min", amount: "₹64.00", date: "Today, 10:30 AM" },
  { id: 2, merchant: "ChargePad EV", duration: "45 min", amount: "₹180.00", date: "Yesterday, 3:15 PM" },
  { id: 3, merchant: "CoWork Hub", duration: "2h 10 min", amount: "₹390.00", date: "Feb 9, 9:00 AM" },
  { id: 4, merchant: "ParkSmart", duration: "1h 5 min", amount: "₹65.00", date: "Feb 8, 6:00 PM" },
];

const CustomerDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("home");
  const [isStreaming, setIsStreaming] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [streamMerchant] = useState("FitZone Gym");
  const rate = 2; // ₹ per minute

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isStreaming) {
      interval = setInterval(() => setElapsed((p) => p + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isStreaming]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const currentCost = ((elapsed / 60) * rate).toFixed(2);

  const tabs = [
    { id: "home", label: "Home", icon: Zap },
    { id: "scan", label: "Scan QR", icon: QrCode },
    { id: "history", label: "History", icon: History },
    { id: "wallet", label: "Wallet", icon: Wallet },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold text-foreground">
            PULSE<span className="neon-text">PAY</span>
          </span>
        </div>

        <div className="mx-4 mb-4 rounded-xl bg-primary/10 p-3">
          <p className="text-xs text-muted-foreground">Customer Account</p>
          <p className="font-display font-semibold text-foreground">Avishek Kumar</p>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <button
            onClick={() => navigate("/")}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-64 flex-1 p-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">
              Hello, Avishek 👋
            </h1>
            <p className="text-sm text-muted-foreground">Ready to stream some payments?</p>
          </div>

          {/* Wallet + Active Stream */}
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            {/* Wallet Card */}
            <div className="glass rounded-2xl p-6 neon-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Wallet Balance</span>
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-2 font-display text-4xl font-bold text-gradient">₹2,450.00</p>
              <div className="mt-4 flex gap-3">
                <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-all hover:neon-glow">
                  <ArrowDownLeft className="h-4 w-4" />
                  Add Funds
                </button>
                <button className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-secondary py-2.5 text-sm font-medium text-secondary-foreground transition-all hover:border-primary/40">
                  <ArrowUpRight className="h-4 w-4" />
                  Withdraw
                </button>
              </div>
            </div>

            {/* Active Stream */}
            <div className={`glass rounded-2xl p-6 ${isStreaming ? "neon-border" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  {isStreaming ? "Live Pulse" : "No Active Stream"}
                </span>
                {isStreaming && (
                  <span className="flex items-center gap-1.5 text-sm text-primary">
                    <span className="pulse-dot h-2 w-2 rounded-full bg-primary" />
                    Streaming
                  </span>
                )}
              </div>

              {isStreaming ? (
                <>
                  <p className="font-display text-lg font-semibold text-foreground">{streamMerchant}</p>
                  <div className="my-4 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div className="stream-line h-full w-full rounded-full" />
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Elapsed</p>
                      <p className="font-display text-2xl font-bold text-foreground">{formatTime(elapsed)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Cost so far</p>
                      <p className="font-display text-2xl font-bold text-gradient">₹{currentCost}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsStreaming(false);
                      setElapsed(0);
                    }}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-destructive py-3 font-display font-bold text-destructive-foreground transition-all hover:opacity-90"
                  >
                    <Square className="h-4 w-4" />
                    Stop Stream
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <QrCode className="mb-3 h-12 w-12 text-muted-foreground" />
                  <p className="mb-4 text-sm text-muted-foreground">Scan a QR to start streaming</p>
                  <button
                    onClick={() => setIsStreaming(true)}
                    className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-display font-bold text-primary-foreground transition-all hover:neon-glow"
                  >
                    <Play className="h-4 w-4" />
                    Demo Stream
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Recent History */}
          <div className="glass rounded-2xl p-6">
            <h3 className="mb-4 font-display text-lg font-semibold text-foreground">
              Recent Transactions
            </h3>
            <div className="space-y-3">
              {mockHistory.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl bg-secondary/50 p-4 transition-all hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <TrendingDown className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{tx.merchant}</p>
                      <p className="text-xs text-muted-foreground">{tx.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{tx.amount}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {tx.duration}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default CustomerDashboard;
