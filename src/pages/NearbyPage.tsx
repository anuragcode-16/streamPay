/**
 * NearbyPage.tsx — Dynamic Nearby Services using Google Maps
 *
 * 1. Uses @react-google-maps/api to render the map
 * 2. Uses VITE_GOOGLE_MAPS_API_KEY from .env
 * 3. Shows store details, ratings, reviews, and a "Get Directions" button
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import {
    GoogleMap,
    useJsApiLoader,
    Marker,
    InfoWindow,
    Circle,
} from "@react-google-maps/api";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Loader2, Navigation, Clock, Filter, Star, Info, MessageSquare, X, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const DEFAULT_LAT = 28.6328;
const DEFAULT_LNG = 77.2197;

const MAP_CONTAINER_STYLE = {
    width: "100%",
    height: "100%",
    borderRadius: "1rem",
};

const SERVICE_ICONS: Record<string, string> = {
    gym: "🏋️", ev: "⚡", parking: "🅿️", coworking: "💼",
    wifi: "📶", spa: "🧖", restaurant: "🍽️", food: "🍔",
    cafe: "☕", laundry: "👕", gaming: "🎮", salon: "💇",
};

const SERVICE_COLORS: Record<string, string> = {
    gym: "bg-red-500/20 text-red-400", ev: "bg-yellow-500/20 text-yellow-400",
    parking: "bg-blue-500/20 text-blue-400", coworking: "bg-purple-500/20 text-purple-400",
    wifi: "bg-cyan-500/20 text-cyan-400", spa: "bg-pink-500/20 text-pink-400",
    restaurant: "bg-orange-500/20 text-orange-400", food: "bg-amber-500/20 text-amber-400",
    cafe: "bg-emerald-500/20 text-emerald-400", laundry: "bg-indigo-500/20 text-indigo-400",
    gaming: "bg-violet-500/20 text-violet-400", salon: "bg-rose-500/20 text-rose-400",
};

interface Review {
    author: string;
    rating: number;
    text: string;
    date: string;
}

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
    description: string;
    reviews: Review[];
}

const DEMO_TEMPLATES = [
    { service_type: "gym", names: ["PowerZone Gym", "FitLife Studio", "Iron Temple", "CrossFit Arena"], priceRange: [20, 80], locations: ["Sector 12", "Main Road", "Market Complex"] },
    { service_type: "ev", names: ["Tata EV Station", "Ather Grid Hub", "ChargeZone Point"], priceRange: [40, 99], locations: ["Highway NH-8", "Petrol Pump Area", "Mall Parking"] },
    { service_type: "restaurant", names: ["Spice Garden", "The Urban Kitchen", "Tandoori Nights"], priceRange: [30, 90], locations: ["Food Street", "Market Area", "Near Park"] },
    { service_type: "food", names: ["Quick Bites", "Street Eats Hub", "Burger Point"], priceRange: [15, 60], locations: ["Near College", "Bus Stand Area", "Food Court"] },
    { service_type: "cafe", names: ["Brew & Bean", "Third Wave Coffee", "Chai Point Express"], priceRange: [25, 75], locations: ["IT Park", "University Road", "Lakeside"] },
    { service_type: "parking", names: ["SmartPark Zone", "EasyPark Hub", "CityPark Spot"], priceRange: [10, 40], locations: ["Near Mall", "Metro Station P1", "Airport Road"] },
    { service_type: "coworking", names: ["WeWork Flex", "CoSpace Hub", "StartUp Garage"], priceRange: [35, 95], locations: ["Tech Park", "Business District", "Innovation Hub"] },
    { service_type: "spa", names: ["ZenSpa Wellness", "AyurVeda Touch", "O2 Spa Lounge"], priceRange: [50, 99], locations: ["Hotel Plaza", "Wellness Center", "Near Lake"] },
    { service_type: "laundry", names: ["UClean Express", "Washio Hub", "FreshPress Laundry"], priceRange: [15, 50], locations: ["Residential Area", "Near Hostel", "Shopping Street"] },
    { service_type: "gaming", names: ["GameZone Arena", "VR World Hub", "Pixel Playground"], priceRange: [20, 70], locations: ["Mall 3rd Floor", "Entertainment Zone", "Near Cinema"] },
    { service_type: "wifi", names: ["SpeedNet Lounge", "WiFi Zone Express", "NetCafe Point"], priceRange: [10, 30], locations: ["Railway Station", "Airport Terminal", "Library Area"] },
    { service_type: "salon", names: ["GlamUp Studio", "Looks Salon", "StyleBar Express"], priceRange: [30, 85], locations: ["Fashion Street", "Near Temple", "Ring Road"] },
];

const MOCK_REVIEWS = [
    "Absolutely loved the experience! Highly recommended.",
    "Very clean and well maintained facility.",
    "Friendly staff and great service. Will visit again.",
    "A bit crowded during peak hours, but otherwise great.",
    "Worth the price. Very convenient location.",
    "The amenities are top notch. Very satisfied.",
    "Quick and easy. No hassle at all.",
    "Good, but could use some improvements in seating context."
];

const MOCK_NAMES = ["Aarav M.", "Priya S.", "Rahul N.", "Neha K.", "Vikram T.", "Anjali R."];

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function seededRandom(seed: number) {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function generateNearbyMerchants(lat: number, lng: number, radiusKm: number): DemoMerchant[] {
    const seed = Math.floor(lat * 1000 + lng * 1000);
    const rng = seededRandom(seed > 0 ? seed : 12345);
    const merchants: DemoMerchant[] = [];

    for (const template of DEMO_TEMPLATES) {
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

            const rating = Math.round((3.5 + rng() * 1.5) * 10) / 10;

            // Generate 2-4 mock reviews
            const reviewsCount = 2 + Math.floor(rng() * 3);
            const reviews: Review[] = [];
            for (let j = 0; j < reviewsCount; j++) {
                reviews.push({
                    author: MOCK_NAMES[Math.floor(rng() * MOCK_NAMES.length)],
                    rating: Math.min(5, Math.max(1, Math.round(rating + (rng() > 0.5 ? 0.5 : -0.5)))),
                    text: MOCK_REVIEWS[Math.floor(rng() * MOCK_REVIEWS.length)],
                    date: `${Math.floor(1 + rng() * 28)} days ago`
                });
            }

            merchants.push({
                id: `demo_${template.service_type}_${i}_${seed}`,
                name: template.names[nameIdx],
                service_type: template.service_type,
                price_per_minute_paise: price,
                location: template.locations[locIdx],
                lat: mLat,
                lng: mLng,
                distanceKm: Math.round(haversine(lat, lng, mLat, mLng) * 100) / 100,
                rating,
                openNow: rng() > 0.15,
                description: `A premium ${template.service_type} facility located at ${template.locations[locIdx]}. Pay-as-you-use directly via Stream Pay wallet without any upfront commitments.`,
                reviews
            });
        }
    }

    return merchants.filter((m) => m.distanceKm <= radiusKm).sort((a, b) => a.distanceKm - b.distanceKm);
}

export default function NearbyPage() {
    const { toast } = useToast();

    const [userLat, setUserLat] = useState<number>(DEFAULT_LAT);
    const [userLng, setUserLng] = useState<number>(DEFAULT_LNG);
    const [locating, setLocating] = useState(false);
    const [radius, setRadius] = useState(5);
    const [filterType, setFilterType] = useState<string>("all");
    const [activeMarker, setActiveMarker] = useState<string | null>(null);
    const [selectedStore, setSelectedStore] = useState<DemoMerchant | null>(null);
    const [mapRef, setMapRef] = useState<google.maps.Map | null>(null);

    const { isLoaded, loadError } = useJsApiLoader({ id: "google-map-script", googleMapsApiKey: GOOGLE_MAPS_API_KEY });

    const allMerchants = useMemo(() => generateNearbyMerchants(userLat, userLng, radius), [userLat, userLng, radius]);
    const nearby = useMemo(() => filterType === "all" ? allMerchants : allMerchants.filter((m) => m.service_type === filterType), [allMerchants, filterType]);
    const serviceTypes = useMemo(() => Array.from(new Set(allMerchants.map((m) => m.service_type))).sort(), [allMerchants]);

    const onLoad = useCallback(function callback(map: google.maps.Map) { setMapRef(map); }, []);
    const onUnmount = useCallback(function callback() { setMapRef(null); }, []);

    useEffect(() => {
        if (mapRef) mapRef.panTo({ lat: userLat, lng: userLng });
    }, [userLat, userLng, mapRef]);

    async function locateUser() {
        setLocating(true);
        try {
            const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }));
            setUserLat(pos.coords.latitude);
            setUserLng(pos.coords.longitude);
            toast({ title: "📍 Location detected!" });
        } catch {
            toast({ title: "Using default location (New Delhi)", variant: "destructive" });
        } finally {
            setLocating(false);
        }
    }

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); },
                () => { }, { timeout: 5000 }
            );
        }
    }, []);

    function openDirections(m: DemoMerchant) {
        // Opens Google Maps Directions in a new tab calculating shortest path from current location
        const url = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${m.lat},${m.lng}&travelmode=driving`;
        window.open(url, '_blank');
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
                        <MapPin className="h-6 w-6 text-primary" /> Nearby Discover
                    </h2>
                    <p className="text-sm text-muted-foreground">{nearby.length} places within {radius} km · Pay-as-you-use</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={radius} onChange={(e) => setRadius(Number(e.target.value))}
                        className="rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                        {[2, 5, 10, 25].map((r) => <option key={r} value={r}>{r} km</option>)}
                    </select>
                    <button
                        onClick={locateUser} disabled={locating}
                        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:neon-glow disabled:opacity-50"
                    >
                        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />} Locate Me
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setFilterType("all")}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filterType === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                    <Filter className="mr-1 inline h-3 w-3" /> All ({allMerchants.length})
                </button>
                {serviceTypes.map((type) => (
                    <button
                        key={type} onClick={() => setFilterType(type)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition ${filterType === type ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                    >
                        {SERVICE_ICONS[type] || "📍"} {type} ({allMerchants.filter((m) => m.service_type === type).length})
                    </button>
                ))}
            </div>

            <div className="glass overflow-hidden rounded-2xl relative" style={{ height: 340 }}>
                {loadError ? (
                    <div className="flex h-full items-center justify-center p-4 text-center text-red-400">
                        <p>Error loading Google Maps. Is the API key valid?</p>
                    </div>
                ) : !isLoaded ? (
                    <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Loading Map...</span></div>
                ) : (
                    <GoogleMap
                        mapContainerStyle={MAP_CONTAINER_STYLE}
                        center={{ lat: userLat, lng: userLng }}
                        zoom={14}
                        onLoad={onLoad} onUnmount={onUnmount}
                        options={{ disableDefaultUI: false, zoomControl: true }}
                    >
                        <Marker position={{ lat: userLat, lng: userLng }} icon={{ url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" }} title="You are here" />
                        <Circle center={{ lat: userLat, lng: userLng }} radius={radius * 1000} options={{ strokeColor: "#6366f1", strokeOpacity: 0.8, strokeWeight: 2, fillColor: "#6366f1", fillOpacity: 0.05 }} />
                        {nearby.map((m) => (
                            <Marker
                                key={m.id} position={{ lat: m.lat, lng: m.lng }}
                                onClick={() => setActiveMarker(m.id)}
                                icon={{ url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png" }}
                            >
                                {activeMarker === m.id && (
                                    <InfoWindow onCloseClick={() => setActiveMarker(null)}>
                                        <div className="p-1 px-2 text-gray-900 font-sans max-w-[200px]">
                                            <strong className="text-sm border-b pb-1 mb-1 block">{SERVICE_ICONS[m.service_type]} {m.name}</strong>
                                            <div className="text-xs text-gray-700 flex justify-between mt-1"><span>⭐ {m.rating}</span><span className="font-bold">₹{(m.price_per_minute_paise / 100).toFixed(2)}/min</span></div>
                                            <button onClick={() => setSelectedStore(m)} className="mt-2 text-xs bg-indigo-600 text-white w-full py-1.5 rounded-md font-medium hover:bg-indigo-700">View Details</button>
                                        </div>
                                    </InfoWindow>
                                )}
                            </Marker>
                        ))}
                    </GoogleMap>
                )}
            </div>

            {nearby.length === 0 ? (
                <div className="glass rounded-2xl p-8 text-center">
                    <MapPin className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">No {filterType !== "all" ? filterType : ""} services found within {radius} km.</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {nearby.map((m, i) => (
                        <motion.div
                            key={m.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                            onClick={() => setSelectedStore(m)}
                            className="glass flex flex-col gap-3 rounded-2xl p-5 transition-all hover:neon-border cursor-pointer group hover:bg-secondary/20"
                        >
                            <div className="flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-center gap-2">
                                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${SERVICE_COLORS[m.service_type] || "bg-primary/20"}`}>
                                            {SERVICE_ICONS[m.service_type] || "📍"}
                                        </span>
                                        <div className="min-w-0">
                                            <h3 className="truncate font-display font-bold text-foreground group-hover:text-primary transition-colors">{m.name}</h3>
                                            <span className="text-xs capitalize text-muted-foreground">{m.service_type}</span>
                                        </div>
                                    </div>
                                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                        <MapPin className="h-3 w-3 shrink-0" /> {m.location}
                                    </p>
                                </div>
                                <div className="ml-2 shrink-0 text-right">
                                    <p className="font-display text-lg font-bold text-gradient">₹{(m.price_per_minute_paise / 100).toFixed(2)}<span className="text-xs text-muted-foreground">/min</span></p>
                                    <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground whitespace-nowrap"><Navigation className="h-3 w-3" /> {m.distanceKm} km</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-white/5 pt-3 mt-1">
                                <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1 text-yellow-400 font-medium"><Star className="h-3.5 w-3.5 fill-yellow-400" /> {m.rating}</span>
                                    <span className={m.openNow ? "text-green-400" : "text-red-400"}> {m.openNow ? "● Open" : "● Closed"}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-primary font-medium hover:underline">
                                    <Info className="h-4 w-4" /> View Info
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Store Details Modal */}
            <AnimatePresence>
                {selectedStore && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
                        onClick={(e) => { if (e.target === e.currentTarget) setSelectedStore(null); }}
                    >
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-lg glass rounded-2xl overflow-hidden flex flex-col max-h-[85vh]">
                            {/* Modal Header */}
                            <div className="relative p-6 pb-4 border-b border-white/10">
                                <button onClick={() => setSelectedStore(null)} className="absolute top-4 right-4 p-2 bg-secondary rounded-full hover:bg-secondary/80 text-muted-foreground hover:text-white transition">
                                    <X className="h-4 w-4" />
                                </button>
                                <div className="flex gap-4 items-start pr-8">
                                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl ${SERVICE_COLORS[selectedStore.service_type] || "bg-primary/20"}`}>
                                        {SERVICE_ICONS[selectedStore.service_type] || "📍"}
                                    </div>
                                    <div>
                                        <h2 className="font-display text-2xl font-bold text-foreground">{selectedStore.name}</h2>
                                        <p className="flex items-center gap-2 text-sm text-muted-foreground mt-1 capitalize">
                                            <span>{selectedStore.service_type}</span>
                                            <span>•</span>
                                            <span className={selectedStore.openNow ? "text-green-400" : "text-red-400"}>{selectedStore.openNow ? "Open Now" : "Closed"}</span>
                                            <span>•</span>
                                            <span>{selectedStore.distanceKm} km away</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Content - Scrollable */}
                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                                {/* Pricing & Actions Row */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-secondary/50 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Price</span>
                                        <p className="font-display text-2xl font-bold text-gradient">₹{(selectedStore.price_per_minute_paise / 100).toFixed(2)}<span className="text-sm text-muted-foreground font-normal"> / min</span></p>
                                        <span className="text-xs text-muted-foreground mt-1"><Clock className="inline h-3 w-3 mr-1" />≈ ₹{((selectedStore.price_per_minute_paise / 100) * 60).toFixed(0)} per hour</span>
                                    </div>
                                    <button
                                        onClick={() => openDirections(selectedStore)}
                                        className="bg-primary/10 border border-primary/30 hover:bg-primary hover:text-white text-primary rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all group"
                                    >
                                        <Navigation className="h-6 w-6 mb-2 group-hover:-translate-y-1 transition-transform" />
                                        <span className="font-bold text-sm">Get Directions</span>
                                        <span className="text-xs opacity-70 mt-1 flex items-center gap-1">Shortest Path <ExternalLink className="h-3 w-3" /></span>
                                    </button>
                                </div>

                                {/* About */}
                                <div>
                                    <h3 className="font-bold text-foreground mb-2 flex items-center gap-2"><Info className="h-4 w-4" /> About Store</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed bg-black/20 p-4 rounded-xl border border-white/5">
                                        {selectedStore.description}
                                    </p>
                                </div>

                                {/* Reviews */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-bold text-foreground flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Customer Reviews</h3>
                                        <div className="flex items-center gap-1 bg-yellow-400/10 text-yellow-400 px-2 py-1 rounded-md text-xs font-bold border border-yellow-400/20">
                                            <Star className="h-3 w-3 fill-yellow-400 inline" /> {selectedStore.rating} average
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {selectedStore.reviews.map((review, idx) => (
                                            <div key={idx} className="bg-secondary/30 p-4 rounded-xl border border-white/5">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <span className="font-medium text-sm text-white block">{review.author}</span>
                                                        <span className="text-[10px] text-muted-foreground">{review.date}</span>
                                                    </div>
                                                    <div className="flex gap-0.5">
                                                        {[...Array(5)].map((_, i) => (
                                                            <Star key={i} className={`h-3 w-3 ${i < review.rating ? "fill-yellow-400 text-yellow-400" : "fill-white/10 text-white/10"}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-sm text-gray-300">"{review.text}"</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
