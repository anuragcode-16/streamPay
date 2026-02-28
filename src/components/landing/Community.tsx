const data = [
    {
        title: "01/",
        description:
            "Liquifying Time and Money: Transforming static, lumpy payments into a continuous flow. Like water flowing through a pipe when you turn on the tap, money flows continuously exact second by second from an atomic wallet buffer.",
    },
    {
        title: "02/",
        description:
            "The Magic Moment: Walk in, scan QR, and see a 'Live Pulse' on your phone. Money streams automatically against a prepaid wallet balance. Walk out, press stop, and pay for not a minute more.",
    },
    {
        title: "03/",
        description:
            "The Data Layer: Service providers get real-time occupancy and usage analytics. Predict demand, optimize staffing, and identify valuable customers based on actual usage.",
    },
];

export default function Community() {
    return (
        <div className="relative py-20 bg-theme-black text-white overflow-hidden">
            <div className="absolute -z-10 right-0 top-0 opacity-20">
                <div className="w-[600px] h-[600px] bg-theme-pink rounded-full blur-[150px]"></div>
            </div>

            <div className="container mx-auto px-6">
                <h1 className="text-5xl sm:text-[60px] font-bold mb-16 leading-tight">
                    The Solution: <span className="text-transparent bg-clip-text bg-gradient-to-r from-theme-pink to-theme-pink-glow">Real-time Innovation.</span>
                </h1>
                <div className="flex flex-wrap justify-center gap-10">
                    {data.map((n, index) => {
                        return (
                            <div key={index} className="flex flex-col max-w-sm p-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:border-theme-pink/50 transition-colors duration-300">
                                <h1 className="text-[60px] font-mono text-theme-pink mb-4">{n.title}</h1>
                                <p className="text-gray-300 text-lg leading-relaxed">{n.description}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
