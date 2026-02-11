import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Zap, BarChart3, Users, DollarSign, Settings, LogOut,
  TrendingUp, Clock, MapPin, QrCode, Plus, Activity
} from "lucide-react";

const mockStreams = [
  { id: 1, customer: "Avishek K.", duration: "32 min", amount: "₹64.00", status: "active" },
  { id: 2, customer: "Priya S.", duration: "18 min", amount: "₹36.00", status: "active" },
  { id: 3, customer: "Rahul M.", duration: "45 min", amount: "₹90.00", status: "completed" },
  { id: 4, customer: "Sneha D.", duration: "12 min", amount: "₹24.00", status: "completed" },
];

const MerchantDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  const stats = [
    { label: "Active Streams", value: "12", icon: Activity, change: "+3" },
    { label: "Today's Revenue", value: "₹4,280", icon: DollarSign, change: "+18%" },
    { label: "Total Customers", value: "847", icon: Users, change: "+24" },
    { label: "Avg Session", value: "28 min", icon: Clock, change: "-2 min" },
  ];

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "streams", label: "Live Streams", icon: Activity },
    { id: "qr", label: "QR Codes", icon: QrCode },
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
          <p className="text-xs text-muted-foreground">Merchant Account</p>
          <p className="font-display font-semibold text-foreground">FitZone Gym</p>
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
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground">Monitor your payment streams in real-time</p>
            </div>
            <button className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground transition-all hover:neon-glow">
              <Plus className="h-4 w-4" />
              New QR Code
            </button>
          </div>

          {/* Stats */}
          <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="glass rounded-2xl p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <stat.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {stat.change}
                  </span>
                </div>
                <p className="mt-3 font-display text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Live Streams Table */}
          <div className="glass rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-foreground">Recent Streams</h3>
              <span className="flex items-center gap-1.5 text-sm text-primary">
                <span className="pulse-dot h-2 w-2 rounded-full bg-primary" />
                2 active
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Duration</th>
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mockStreams.map((stream) => (
                    <tr key={stream.id} className="group">
                      <td className="py-3 text-sm font-medium text-foreground">{stream.customer}</td>
                      <td className="py-3 text-sm text-muted-foreground">{stream.duration}</td>
                      <td className="py-3 text-sm font-semibold text-foreground">{stream.amount}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                            stream.status === "active"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {stream.status === "active" && (
                            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
                          )}
                          {stream.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Occupancy Heat Map placeholder */}
          <div className="mt-6 glass rounded-2xl p-6">
            <h3 className="mb-4 font-display text-lg font-semibold text-foreground">
              Occupancy Overview
            </h3>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 28 }, (_, i) => {
                const intensity = Math.random();
                return (
                  <div
                    key={i}
                    className="flex h-10 items-center justify-center rounded-lg text-xs text-muted-foreground"
                    style={{
                      backgroundColor: `hsl(142 72% 50% / ${intensity * 0.3 + 0.05})`,
                    }}
                  >
                    {Math.floor(intensity * 20)}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default MerchantDashboard;
