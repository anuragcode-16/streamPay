import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Zap, Wallet, QrCode, History, Settings, LogOut,
  Play, Square, Clock, TrendingDown, ArrowDownLeft, ArrowUpRight
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { superfluidService } from "@/lib/superfluid";
import { useToast } from "@/hooks/use-toast";

const CustomerDashboard = () => {
  const navigate = useNavigate();
  const { profile, user, signOut } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("home");
  const [isStreaming, setIsStreaming] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [streamMerchant, setStreamMerchant] = useState("Demo Gym");
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState("0");
  const rate = 2; // ₹ per minute

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isStreaming) {
      interval = setInterval(() => setElapsed((p) => p + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isStreaming]);

  const fetchHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("payment_streams" as any)
      .select("*, merchant_locations(name)")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setHistory(data as any[]);
  };

  const connectWallet = async () => {
    try {
      const address = await superfluidService.connect();
      setWalletAddress(address);
      const bal = await superfluidService.getBalance();
      setWalletBalance(bal);
      toast({ title: "Wallet Connected", description: `${address.slice(0, 6)}...${address.slice(-4)}` });
    } catch (err: any) {
      toast({ title: "Wallet Error", description: err.message, variant: "destructive" });
    }
  };

  const startDemoStream = async () => {
    setIsStreaming(true);
    setElapsed(0);
    setStreamMerchant("Demo Gym");
    toast({ title: "Stream started!", description: "Payment is now streaming in real-time." });
  };

  const stopStream = async () => {
    const totalAmount = (elapsed / 60) * rate;
    setIsStreaming(false);
    
    // Update stream in DB if we have one
    if (currentStreamId) {
      await supabase
        .from("payment_streams" as any)
        .update({ status: "completed", end_time: new Date().toISOString(), total_amount: totalAmount } as any)
        .eq("id", currentStreamId);
      setCurrentStreamId(null);
    }
    
    toast({ title: "Stream stopped", description: `Total: ₹${totalAmount.toFixed(2)} for ${formatTime(elapsed)}` });
    setElapsed(0);
    fetchHistory();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const currentCost = ((elapsed / 60) * rate).toFixed(2);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

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
            STREAM<span className="neon-text">PAY</span>
          </span>
        </div>

        <div className="mx-4 mb-4 rounded-xl bg-primary/10 p-3">
          <p className="text-xs text-muted-foreground">Customer Account</p>
          <p className="font-display font-semibold text-foreground">{profile?.display_name || "User"}</p>
          {walletAddress && (
            <p className="mt-1 text-xs text-primary font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
          )}
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
            onClick={handleLogout}
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
              Hello, {profile?.display_name || "there"} 👋
            </h1>
            <p className="text-sm text-muted-foreground">Ready to stream some payments?</p>
          </div>

          {/* Wallet + Active Stream */}
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            {/* Wallet Card */}
            <div className="glass rounded-2xl p-6 neon-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {walletAddress ? "Web3 Wallet" : "Connect Wallet"}
                </span>
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              {walletAddress ? (
                <>
                  <p className="mt-2 font-display text-4xl font-bold text-gradient">{parseFloat(walletBalance).toFixed(4)} fDAIx</p>
                  <p className="mt-1 text-xs text-muted-foreground font-mono">{walletAddress}</p>
                </>
              ) : (
                <div className="mt-4">
                  <p className="mb-3 text-sm text-muted-foreground">Connect your MetaMask wallet to enable blockchain payments on Polygon Amoy testnet</p>
                  <button
                    onClick={connectWallet}
                    className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:neon-glow"
                  >
                    <Wallet className="h-4 w-4" />
                    Connect MetaMask
                  </button>
                </div>
              )}
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
                    onClick={stopStream}
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
                    onClick={startDemoStream}
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
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions yet. Start a stream to see your history here.</p>
            ) : (
              <div className="space-y-3">
                {history.map((tx: any) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-xl bg-secondary/50 p-4 transition-all hover:bg-surface-hover"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                        <TrendingDown className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{(tx as any).merchant_locations?.name || "Stream"}</p>
                        <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">₹{Number(tx.total_amount).toFixed(2)}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {tx.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default CustomerDashboard;
