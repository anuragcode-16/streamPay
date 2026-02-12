import { NftCardWithButton } from "./NftCard";

const data = [
    {
        title: "Hardware Integration",
        description: "Plug-and-play modules for physical assets. Trigger relays to unlock turnstiles, start power sockets, or enable WiFi routers when payment flows start.",
        image: "https://placehold.co/400x500/111/FFB6C1?text=Hardware"
    },
    {
        title: "Smart Energy",
        description: "Real-time billing for EV charging and portable batteries. Pay only for the exact kilowatts consumed, enabling peer-to-peer energy markets.",
        image: "https://placehold.co/400x500/222/FF69B4?text=Energy"
    },
    {
        title: "Healthcare Access",
        description: "Pay-as-you-go access to expensive medical equipment like oxygen concentrators, making healthcare affordable without high upfront costs.",
        image: "https://placehold.co/400x500/333/FF1493?text=Healthcare"
    },
    {
        title: "Video Streaming",
        description: "Pay per minute for content. No monthly subscriptions. Perfect for casual viewers who want to watch just one show or movie.",
        image: "https://placehold.co/400x500/444/DB7093?text=Streaming"
    },
];

export default function Discover() {
    return (
        <div className="flex flex-col py-20 px-6 bg-theme-black">
            <div className="container mx-auto">
                <div className="flex py-10 justify-center">
                    <h1 className="text-5xl sm:text-[60px] font-bold text-white">
                        Future <span className="text-theme-pink">Vision.</span>
                    </h1>
                </div>
                <div className="flex flex-wrap justify-center gap-8">
                    {data.map((n, index) => (
                        <div key={index} className="flex flex-col max-w-xs bg-theme-gray/50 rounded-xl overflow-hidden border border-theme-pink/20 hover:border-theme-pink/50 transition-all group">
                            <div className="h-48 overflow-hidden relative">
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
                                <img src={n.image} alt={n.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                            </div>
                            <div className="p-6">
                                <h3 className="text-xl font-bold text-white mb-3">{n.title}</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">{n.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
