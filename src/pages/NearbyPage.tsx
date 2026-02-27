/**
 * NearbyPage.tsx — Dynamic Nearby Services using Google Maps
 *
 * 1. Uses @react-google-maps/api to render the map
 * 2. Uses VITE_GOOGLE_MAPS_API_KEY from .env
 * 3. Generates dynamic dummy services scattered around the user's location
 * 4. Shows Google Map + sorted list of merchants
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    GoogleMap,
    useJsApiLoader,
    Marker,
    InfoWindow,
    Circle,
} from "@react-google-maps/api";
import { motion } from "framer-motion";
import { MapPin, Loader2, Navigation, Zap, Clock, Filter } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Default fallback: Connaught Place, New Delhi
const DEFAULT_LAT = 28.6328;
const DEFAULT_LNG = 77.2197;

const MAP_CONTAINER_STYLE = {
    width: "100%",
    height: "100%",
    borderRadius: "1rem", // rounded-2xl
};

const SERVICE_ICONS: Record<string, string> = {
    gym: "🏋️",
    ev: "⚡",
    parking: "🅿️",
    coworking: "💼",
    wifi: "📶",
    spa: "🧖",
    restaurant: "🍽️",
    food: "🍔",
    cafe: "☕",
    laundry: "👕",
    gaming: "🎮",
    salon: "💇",
};

const SERVICE_COLORS: Record<string, string> = {
    gym: "bg-red-500/20 text-red-400",
    ev: "bg-yellow-500/20 text-yellow-400",
    parking: "bg-blue-500/20 text-blue-400",
    coworking: "bg-purple-500/20 text-purple-400",
    wifi: "bg-cyan-500/20 text-cyan-400",
    spa: "bg-pink-500/20 text-pink-400",
    restaurant: "bg-orange-500/20 text-orange-400",
    food: "bg-amber-500/20 text-amber-400",
    cafe: "bg-emerald-500/20 text-emerald-400",
    laundry: "bg-indigo-500/20 text-indigo-400",
    gaming: "bg-violet-500/20 text-violet-400",
    salon: "bg-rose-500/20 text-rose-400",
};

interface DemoMerchant {
    id: string;
    name: string;
    service_type: string;
    price_per_minute_paise: number;
    location: string;
    lat: number;
    lng: number;
    distanceKm: number;
    rating: number;
    openNow: boolean;
}

// — Demo service templates —
const DEMO_TEMPLATES = [
    { service_type: "gym", names: ["PowerZone Gym", "FitLife Studio", "Iron Temple", "CrossFit Arena", "FlexPoint Fitness"], priceRange: [150, 300], locations: ["Sector 12", "Main Road", "Market Complex", "Near Metro Station", "City Center"] },
    { service_type: "ev", names: ["Tata EV Station", "Ather Grid Hub", "ChargeZone Point", "EV Power Hub", "BoltCharge Station"], priceRange: [200, 500], locations: ["Highway NH-8", "Petrol Pump Area", "Mall Parking", "Near Bus Stop", "Ring Road"] },
    { service_type: "restaurant", names: ["Spice Garden", "The Urban Kitchen", "Tandoori Nights", "Saffron Bistro", "Curry House"], priceRange: [100, 250], locations: ["Food Street", "Market Area", "Near Park", "Main Bazaar", "Shopping Complex"] },
    { service_type: "food", names: ["Quick Bites", "Street Eats Hub", "Burger Point", "Pizza Corner", "Dosa Factory"], priceRange: [50, 150], locations: ["Near College", "Bus Stand Area", "Food Court", "Market Lane", "Station Road"] },
    { service_type: "cafe", names: ["Brew & Bean", "Third Wave Coffee", "Chai Point Express", "The Coffee House", "Mocha Lounge"], priceRange: [80, 200], locations: ["IT Park", "University Road", "Lakeside", "Book Market", "Art District"] },
    { service_type: "parking", names: ["SmartPark Zone", "EasyPark Hub", "CityPark Spot", "SafeParking Lot", "AutoPark Station"], priceRange: [30, 100], locations: ["Near Mall", "Metro Station P1", "Airport Road", "Hospital Area", "Stadium Gate"] },
    { service_type: "coworking", names: ["WeWork Flex", "CoSpace Hub", "StartUp Garage", "IndiQube Space", "91springboard"], priceRange: [200, 500], locations: ["Tech Park", "Business District", "Innovation Hub", "CBD Area", "Old City"] },
    { service_type: "spa", names: ["ZenSpa Wellness", "AyurVeda Touch", "O2 Spa Lounge", "Tranquil Retreat", "Body & Soul Spa"], priceRange: [300, 600], locations: ["Hotel Plaza", "Wellness Center", "Near Lake", "Resort Road", "Premium Tower"] },
    { service_type: "laundry", names: ["UClean Express", "Washio Hub", "FreshPress Laundry", "QuickWash Point", "LaundryMate"], priceRange: [40, 120], locations: ["Residential Area", "Near Hostel", "Shopping Street", "Colony Gate", "Market Road"] },
    { service_type: "gaming", names: ["GameZone Arena", "VR World Hub", "Pixel Playground", "Esports Cafe", "ArcadeX Center"], priceRange: [100, 300], locations: ["Mall 3rd Floor", "Entertainment Zone", "Near Cinema", "Tech Street", "Youth Center"] },
    { service_type: "wifi", names: ["SpeedNet Lounge", "WiFi Zone Express", "NetCafe Point", "DataHub Spot", "ConnectX Station"], priceRange: [20, 80], locations: ["Railway Station", "Airport Terminal", "Library Area", "Public Park", "Community Hall"] },
    { service_type: "salon", names: ["GlamUp Studio", "Looks Salon", "StyleBar Express", "CutAbove Salon", "Beauty Bliss"], priceRange: [150, 400], locations: ["Fashion Street", "Near Temple", "Ring Road", "Plaza Complex", "High Street"] },
];

// Haversine distance (km)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Seeded random so demo data is consistent for same location
function seededRandom(seed: number) {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

// Generate demo merchants around a given location
function generateNearbyMerchants(lat: number, lng: number, radiusKm: number): DemoMerchant[] {
    const seed = Math.floor(lat * 1000 + lng * 1000);
    const rng = seededRandom(seed > 0 ? seed : 12345);
    const merchants: DemoMerchant[] = [];

    for (const template of DEMO_TEMPLATES) {
        // Generate 2-4 merchants per service type
        const count = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
            const angle = rng() * 2 * Math.PI;
            const dist = rng() * radiusKm * 0.9;
            const offsetLat = (dist / 111) * Math.cos(angle);
            const offsetLng = (dist / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
            const mLat = lat + offsetLat;
            const mLng = lng + offsetLng;

            const nameIdx = Math.floor(rng() * template.names.length);
            const locIdx = Math.floor(rng() * template.locations.length);
            const [minPrice, maxPrice] = template.priceRange;
            const price = minPrice + Math.floor(rng() * (maxPrice - minPrice));

            merchants.push({
                id: `demo_${template.service_type}_${i}_${seed}`,
                name: template.names[nameIdx],
                service_type: template.service_type,
                price_per_minute_paise: price,
                location: template.locations[locIdx],
                lat: mLat,
                lng: mLng,
                distanceKm: Math.round(haversine(lat, lng, mLat, mLng) * 100) / 100,
                rating: Math.round((3.5 + rng() * 1.5) * 10) / 10,
                openNow: rng() > 0.15, // 85% chance open
            });
        }
    }

    return merchants
        .filter((m) => m.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
}

export default function NearbyPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [userLat, setUserLat] = useState<number>(DEFAULT_LAT);
    const [userLng, setUserLng] = useState<number>(DEFAULT_LNG);
    const [locating, setLocating] = useState(false);
    const [radius, setRadius] = useState(5);
    const [starting, setStarting] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string>("all");
    const [activeMarker, setActiveMarker] = useState<string | null>(null);

    const [mapRef, setMapRef] = useState<google.maps.Map | null>(null);

    const { isLoaded, loadError } = useJsApiLoader({
        id: "google-map-script",
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    });

    const userId = user?.id || "user_demo_customer";

    // Generate dynamic demo merchants based on location
    const allMerchants = useMemo(
        () => generateNearbyMerchants(userLat, userLng, radius),
        [userLat, userLng, radius]
    );

    // Filter by service type
    const nearby = useMemo(
        () =>
            filterType === "all"
                ? allMerchants
                : allMerchants.filter((m) => m.service_type === filterType),
        [allMerchants, filterType]
    );

    // Get unique service types for filter chips
    const serviceTypes = useMemo(() => {
        const types = new Set(allMerchants.map((m) => m.service_type));
        return Array.from(types).sort();
    }, [allMerchants]);

    const onLoad = useCallback(function callback(map: google.maps.Map) {
        setMapRef(map);
    }, []);

    const onUnmount = useCallback(function callback(map: google.maps.Map) {
        setMapRef(null);
    }, []);

    // Update map center when coordinates change
    useEffect(() => {
        if (mapRef) {
            mapRef.panTo({ lat: userLat, lng: userLng });
        }
    }, [userLat, userLng, mapRef]);

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
            toast({
                title: "Using default location (New Delhi)",
                variant: "destructive",
            });
        } finally {
            setLocating(false);
        }
    }

    async function startSession(merchant: DemoMerchant) {
        setStarting(merchant.id);
        try {
            // Simulate backend call if DB isn't connected
            const res = await fetch(`${API_URL}/api/start-session`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    merchantId: merchant.id,
                    serviceType: merchant.service_type,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast({
                title: `▶️ Session started at ${merchant.name}!`,
                description: `₹${(merchant.price_per_minute_paise / 100).toFixed(0)}/min`,
            });
            navigate("/customer");
        } catch (err: any) {
            toast({
                title: "Session Demo Started",
                description: `Backend DB offline. Local demo session started at ${merchant.name
                    } — ₹${(merchant.price_per_minute_paise / 100).toFixed(0)}/min.`,
            });
            navigate("/customer");
        } finally {
            setStarting(null);
        }
    }

    // Auto-detect location on mount
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setUserLat(pos.coords.latitude);
                    setUserLng(pos.coords.longitude);
                },
                () => {
                    /* silently use default */
                },
                { timeout: 5000 }
            );
        }
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
                        <MapPin className="h-6 w-6 text-primary" />
                        Nearby Services
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {nearby.length} services within {radius} km · Pay-as-you-use
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={radius}
                        onChange={(e) => setRadius(Number(e.target.value))}
                        className="rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                        {[2, 5, 10, 25].map((r) => (
                            <option key={r} value={r}>
                                {r} km
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={locateUser}
                        disabled={locating}
                        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:neon-glow disabled:opacity-50"
                    >
                        {locating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Navigation className="h-4 w-4" />
                        )}
                        Locate Me
                    </button>
                </div>
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setFilterType("all")}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filterType === "all"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <Filter className="mr-1 inline h-3 w-3" />
                    All ({allMerchants.length})
                </button>
                {serviceTypes.map((type) => (
                    <button
                        key={type}
                        onClick={() => setFilterType(type)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition ${filterType === type
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {SERVICE_ICONS[type] || "📍"} {type} (
                        {allMerchants.filter((m) => m.service_type === type).length})
                    </button>
                ))}
            </div>

            {/* Google Map */}
            <div className="glass overflow-hidden rounded-2xl" style={{ height: 340 }}>
                {loadError ? (
                    <div className="flex h-full items-center justify-center p-4 text-center text-red-400">
                        <p>Error loading Google Maps. Is the API key valid?</p>
                    </div>
                ) : !isLoaded ? (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="ml-2 text-muted-foreground">Loading Map...</span>
                    </div>
                ) : (
                    <GoogleMap
                        mapContainerStyle={MAP_CONTAINER_STYLE}
                        center={{ lat: userLat, lng: userLng }}
                        zoom={14}
                        onLoad={onLoad}
                        onUnmount={onUnmount}
                        options={{
                            disableDefaultUI: false,
                            zoomControl: true,
                        }}
                    >
                        {/* User Location Marker */}
                        <Marker
                            position={{ lat: userLat, lng: userLng }}
                            icon={{
                                url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                            }}
                            title="You are here"
                        />
                        {/* Radius Circle */}
                        <Circle
                            center={{ lat: userLat, lng: userLng }}
                            radius={radius * 1000}
                            options={{
                                strokeColor: "#6366f1",
                                strokeOpacity: 0.8,
                                strokeWeight: 2,
                                fillColor: "#6366f1",
                                fillOpacity: 0.05,
                            }}
                        />
                        {/* Merchant Markers */}
                        {nearby.map((m) => (
                            <Marker
                                key={m.id}
                                position={{ lat: m.lat, lng: m.lng }}
                                onClick={() => setActiveMarker(m.id)}
                                icon={{
                                    url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
                                }}
                            >
                                {activeMarker === m.id && (
                                    <InfoWindow onCloseClick={() => setActiveMarker(null)}>
                                        <div className="text-gray-900 p-1">
                                            <strong className="text-sm">
                                                {SERVICE_ICONS[m.service_type]} {m.name}
                                            </strong>
                                            <br />
                                            <span className="text-xs">
                                                ₹{(m.price_per_minute_paise / 100).toFixed(0)}/min
                                            </span>
                                            <br />
                                            <span className="text-xs text-gray-600">
                                                {m.distanceKm} km away · ⭐ {m.rating}
                                            </span>
                                        </div>
                                    </InfoWindow>
                                )}
                            </Marker>
                        ))}
                    </GoogleMap>
                )}
            </div>

            {/* Location info */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Using: {userLat.toFixed(4)}, {userLng.toFixed(4)}
                {userLat === DEFAULT_LAT && " (default — Connaught Pl, Delhi)"}
            </div>

            {/* Merchant list */}
            {nearby.length === 0 ? (
                <div className="glass rounded-2xl p-8 text-center">
                    <MapPin className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">
                        No {filterType !== "all" ? filterType : ""} services found within{" "}
                        {radius} km.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Try increasing the radius or clearing the filter.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {nearby.map((m, i) => (
                        <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="glass flex flex-col gap-3 rounded-2xl p-5 transition-all hover:neon-border"
                        >
                            <div className="flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-center gap-2">
                                        <span
                                            className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${SERVICE_COLORS[m.service_type] || "bg-primary/20"
                                                }`}
                                        >
                                            {SERVICE_ICONS[m.service_type] || "📍"}
                                        </span>
                                        <div className="min-w-0">
                                            <h3 className="truncate font-display font-bold text-foreground">
                                                {m.name}
                                            </h3>
                                            <span className="text-xs capitalize text-muted-foreground">
                                                {m.service_type}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        {m.location}
                                    </p>
                                </div>
                                <div className="ml-2 shrink-0 text-right">
                                    <p className="font-display text-lg font-bold text-gradient">
                                        ₹{(m.price_per_minute_paise / 100).toFixed(0)}
                                        <span className="text-xs text-muted-foreground">/min</span>
                                    </p>
                                    <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                                        <Navigation className="h-3 w-3" />
                                        {m.distanceKm} km
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <div className="flex items-center gap-3">
                                    <span>⭐ {m.rating}</span>
                                    <span className={m.openNow ? "text-green-400" : "text-red-400"}>
                                        {m.openNow ? "● Open" : "● Closed"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Clock className="h-3.5 w-3.5" />
                                    ≈₹{((m.price_per_minute_paise / 100) * 10).toFixed(0)} for 10
                                    min
                                </div>
                            </div>

                            <button
                                onClick={() => startSession(m)}
                                disabled={starting === m.id || !m.openNow}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition hover:neon-glow disabled:opacity-50"
                            >
                                {starting === m.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Zap className="h-4 w-4" />
                                )}
                                {m.openNow ? "Start Session Here" : "Currently Closed"}
                            </button>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
