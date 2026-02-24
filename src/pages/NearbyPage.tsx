/**
 * NearbyPage.tsx — OSM Nearby Services
 *
 * 1. Gets user geolocation
 * 2. Calls GET /api/nearby?lat=&lng=&radius=10
 * 3. Shows Leaflet map + sorted list of merchants
 * 4. Each card shows distance, service type, price, and a "Start Session" CTA
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { motion } from "framer-motion";
import { MapPin, Loader2, Navigation, Zap, Star, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Fix leaflet default icon paths (Vite/Webpack issue)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// Default fallback: Connaught Place, New Delhi (same as seed data)
const DEFAULT_LAT = 28.6328;
const DEFAULT_LNG = 77.2197;

const SERVICE_ICONS: Record<string, string> = {
    gym: "🏋️", ev: "⚡", parking: "🅿️", coworking: "💼", wifi: "📶", spa: "🧖", vending: "🤖",
};

interface Merchant {
    id: string; name: string; service_type: string;
    price_per_minute_paise: number; location: string;
    lat_f: number; lng_f: number; distanceKm: number;
}

export default function NearbyPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [userLat, setUserLat] = useState<number>(DEFAULT_LAT);
    const [userLng, setUserLng] = useState<number>(DEFAULT_LNG);
    const [locating, setLocating] = useState(false);
    const [nearby, setNearby] = useState<Merchant[]>([]);
    const [loading, setLoading] = useState(false);
    const [radius, setRadius] = useState(10);
    const [starting, setStarting] = useState<string | null>(null);

    const userId = user?.id || "user_demo_customer";

    async function locateUser() {
        setLocating(true);
        try {
            const pos = await new Promise<GeolocationPosition>((res, rej) =>
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
            );
            setUserLat(pos.coords.latitude);
            setUserLng(pos.coords.longitude);
            toast({ title: "📍 Location detected!" });
        } catch {
            toast({ title: "Using default location (New Delhi)", variant: "destructive" });
        } finally { setLocating(false); }
    }

    async function fetchNearby() {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/nearby?lat=${userLat}&lng=${userLng}&radius=${radius}`);
            const data = await res.json();
            setNearby(data.nearby || []);
        } catch (err: any) {
            toast({ title: "Error fetching nearby", description: err.message, variant: "destructive" });
        } finally { setLoading(false); }
    }

    useEffect(() => { fetchNearby(); }, [userLat, userLng, radius]);

    async function startSession(merchant: Merchant) {
        setStarting(merchant.id);
        try {
            const res = await fetch(`${API_URL}/api/start-session`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, merchantId: merchant.id, serviceType: merchant.service_type }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast({ title: `▶️ Session started at ${merchant.name}!`, description: `₹${(merchant.price_per_minute_paise / 100).toFixed(0)}/min` });
            navigate("/customer");
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally { setStarting(null); }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
                        <MapPin className="h-6 w-6 text-primary" />Nearby Services
                    </h2>
                    <p className="text-sm text-muted-foreground">Find pay-as-you-use services around you</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={radius}
                        onChange={e => setRadius(Number(e.target.value))}
                        className="rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                        {[2, 5, 10, 25].map(r => <option key={r} value={r}>{r} km</option>)}
                    </select>
                    <button
                        onClick={locateUser} disabled={locating}
                        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:neon-glow disabled:opacity-50"
                    >
                        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                        Locate Me
                    </button>
                </div>
            </div>

            {/* Leaflet Map */}
            <div className="glass rounded-2xl overflow-hidden" style={{ height: 320 }}>
                <MapContainer center={[userLat, userLng]} zoom={13} style={{ height: "100%", width: "100%" }}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {/* User location circle */}
                    <Circle center={[userLat, userLng]} radius={radius * 1000} pathOptions={{ color: "#6366f1", fillOpacity: 0.05 }} />
                    {/* User pin */}
                    <Marker position={[userLat, userLng]}>
                        <Popup>📍 You are here</Popup>
                    </Marker>
                    {/* Merchant pins */}
                    {nearby.map(m => (
                        <Marker key={m.id} position={[m.lat_f, m.lng_f]}>
                            <Popup>
                                <strong>{SERVICE_ICONS[m.service_type]} {m.name}</strong><br />
                                ₹{(m.price_per_minute_paise / 100).toFixed(0)}/min<br />
                                {m.distanceKm} km away
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>

            {/* Location info */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Using: {userLat.toFixed(4)}, {userLng.toFixed(4)}
                {userLat === DEFAULT_LAT && " (default — Connaught Pl, Delhi)"}
            </div>

            {/* Merchant list */}
            {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                    <Loader2 className="h-5 w-5 animate-spin" />Searching…
                </div>
            ) : nearby.length === 0 ? (
                <div className="glass rounded-2xl p-8 text-center">
                    <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No merchants found within {radius} km.</p>
                    <p className="text-xs text-muted-foreground mt-1">Try increasing the radius or run the seed script to add demo data.</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {nearby.map((m, i) => (
                        <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                            className="glass rounded-2xl p-5 flex flex-col gap-3"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-2xl">{SERVICE_ICONS[m.service_type] || "📍"}</span>
                                        <h3 className="font-display font-bold text-foreground">{m.name}</h3>
                                    </div>
                                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <MapPin className="h-3 w-3" />{m.location || "Nearby"}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="font-display font-bold text-gradient text-lg">
                                        ₹{(m.price_per_minute_paise / 100).toFixed(0)}<span className="text-xs text-muted-foreground">/min</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                                        <Navigation className="h-3 w-3" />{m.distanceKm} km
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="h-3.5 w-3.5" />
                                ≈₹{((m.price_per_minute_paise / 100) * 10).toFixed(0)} for 10 minutes
                            </div>
                            <button
                                onClick={() => startSession(m)}
                                disabled={starting === m.id}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:neon-glow disabled:opacity-50 transition"
                            >
                                {starting === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                                Start Session Here
                            </button>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
