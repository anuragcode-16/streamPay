import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Zap, BarChart3, Users, DollarSign, Settings, LogOut,
  TrendingUp, Clock, MapPin, QrCode, Plus, Activity
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const MerchantDashboard = () => {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [locations, setLocations] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: "", address: "", per_minute_rate: "2" });

  useEffect(() => {
    fetchLocations();
    fetchStreams();

    // Realtime subscription for payment streams
    const channel = supabase
      .channel("merchant-streams")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_streams" }, () => {
        fetchStreams();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchLocations = async () => {
    const { data } = await supabase.from("merchant_locations" as any).select("*");
    if (data) setLocations(data as any[]);
  };

  const fetchStreams = async () => {
    const { data } = await supabase.from("payment_streams" as any).select("*, merchant_locations(name)").order("created_at", { ascending: false }).limit(20);
    if (data) setStreams(data as any[]);
  };

  const addLocation = async () => {
    const { error } = await supabase.from("merchant_locations" as any).insert({
      name: newLocation.name,
      address: newLocation.address,
      per_minute_rate: parseFloat(newLocation.per_minute_rate),
      qr_code_data: crypto.randomUUID(),
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Location added!" });
      setShowAddLocation(false);
      setNewLocation({ name: "", address: "", per_minute_rate: "2" });
      fetchLocations();
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const activeStreams = streams.filter((s: any) => s.status === "active");
  const todayRevenue = streams
    .filter((s: any) => new Date(s.created_at).toDateString() === new Date().toDateString())
    .reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0);

  const stats = [
    { label: "Active Streams", value: String(activeStreams.length), icon: Activity, change: `${activeStreams.length}` },
    { label: "Today's Revenue", value: `₹${todayRevenue.toFixed(0)}`, icon: DollarSign, change: "" },
    { label: "Locations", value: String(locations.length), icon: MapPin, change: "" },
    { label: "Total Streams", value: String(streams.length), icon: TrendingUp, change: "" },
  ];

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "locations", label: "Locations", icon: MapPin },
    { id: "streams", label: "Live Streams", icon: Activity },
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
          <p className="text-xs text-muted-foreground">Merchant Account</p>
          <p className="font-display font-semibold text-foreground">{profile?.display_name || "Merchant"}</p>
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
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground">Monitor your payment streams in real-time</p>
            </div>
            <button
              onClick={() => setShowAddLocation(true)}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground transition-all hover:neon-glow"
            >
              <Plus className="h-4 w-4" />
              Add Location
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
                </div>
                <p className="mt-3 font-display text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Add Location Modal */}
          {showAddLocation && (
            <div className="mb-6 glass rounded-2xl p-6 neon-border">
              <h3 className="mb-4 font-display text-lg font-semibold text-foreground">Add New Location</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <input
                  value={newLocation.name}
                  onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                  placeholder="Location name"
                  className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <input
                  value={newLocation.address}
                  onChange={(e) => setNewLocation({ ...newLocation, address: e.target.value })}
                  placeholder="Address"
                  className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <input
                  value={newLocation.per_minute_rate}
                  onChange={(e) => setNewLocation({ ...newLocation, per_minute_rate: e.target.value })}
                  placeholder="₹ per minute"
                  type="number"
                  step="0.5"
                  className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div className="mt-4 flex gap-3">
                <button onClick={addLocation} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:neon-glow">
                  Save
                </button>
                <button onClick={() => setShowAddLocation(false)} className="rounded-xl border border-border px-6 py-2.5 text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Locations Tab */}
          {activeTab === "locations" && (
            <div className="glass rounded-2xl p-6">
              <h3 className="mb-4 font-display text-lg font-semibold text-foreground">Your Locations</h3>
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No locations yet. Add your first location above.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {locations.map((loc: any) => (
                    <div key={loc.id} className="rounded-xl border border-border bg-secondary/50 p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-display font-semibold text-foreground">{loc.name}</h4>
                        <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          ₹{Number(loc.per_minute_rate).toFixed(1)}/min
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{loc.address || "No address"}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <QrCode className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-mono">{loc.qr_code_data?.slice(0, 12)}...</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Streams Table */}
          {(activeTab === "overview" || activeTab === "streams") && (
            <div className="glass rounded-2xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-foreground">Recent Streams</h3>
                {activeStreams.length > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-primary">
                    <span className="pulse-dot h-2 w-2 rounded-full bg-primary" />
                    {activeStreams.length} active
                  </span>
                )}
              </div>

              {streams.length === 0 ? (
                <p className="text-sm text-muted-foreground">No streams yet. Customers will appear here when they scan your QR code.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Location</th>
                        <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Started</th>
                        <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                        <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {streams.map((stream: any) => (
                        <tr key={stream.id} className="group">
                          <td className="py-3 text-sm font-medium text-foreground">
                            {(stream as any).merchant_locations?.name || "Unknown"}
                          </td>
                          <td className="py-3 text-sm text-muted-foreground">
                            {new Date(stream.start_time).toLocaleString()}
                          </td>
                          <td className="py-3 text-sm font-semibold text-foreground">₹{Number(stream.total_amount).toFixed(2)}</td>
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
              )}
            </div>
          )}

          {/* Occupancy Heat Map */}
          {activeTab === "overview" && (
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
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default MerchantDashboard;
