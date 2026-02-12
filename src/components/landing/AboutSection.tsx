export default function AboutSection() {
    return (
        <div className="min-h-screen py-20 relative overflow-hidden flex items-center">
            {/* Background gradient */}
            <div className="absolute top-0 right-0 -z-10 opacity-30">
                <div className="w-[800px] h-[800px] bg-gradient-to-l from-theme-pink/30 to-transparent rounded-full blur-[120px] translate-x-1/2"></div>
            </div>

            <div className="container mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div className="z-10 order-2 lg:order-2">
                    <h1 className="text-5xl sm:text-[60px] font-bold text-white mb-6 leading-tight">
                        The Problem <span className="text-transparent bg-clip-text bg-gradient-to-r from-theme-pink to-theme-pink-glow">Statement.</span>
                    </h1>
                    <h2 className="text-2xl font-bold text-white mb-4">The Architecture Limitation</h2>
                    <p className="text-lg text-gray-400 leading-relaxed mb-6">
                        At the heart of the problem lies a fundamental architectural constraint in our existing payment infrastructure. Traditional payment systems like UPI and credit cards were designed decades ago for discrete transactions—purchasing a product, paying a bill, or sending money.
                    </p>
                    <p className="text-lg text-gray-400 leading-relaxed mb-6">
                        However, when we try to use these same systems for services that are consumed continuously over time (like EV charging, coworking spaces, gym sessions), fundamental problems emerge. Traditional payment rails simply cannot handle what we call "high-frequency micro-streams" due to transaction limits, merchant fees, and user friction.
                    </p>
                    <h2 className="text-2xl font-bold text-white mb-4">The Forced Subscription Model</h2>
                    <p className="text-lg text-gray-400 leading-relaxed">
                        Because traditional payment systems cannot support pay-as-you-use models, service providers have been forced into offer fixed-cost subscriptions. This creates "subscription fatigue" for consumers who pay for underutilized services, and high customer acquisition costs for business owners who face churn from dissatisfied customers.
                    </p>
                </div>

                <div className="relative flex justify-center order-1 lg:order-1">
                    {/* StreamPay Graphic */}
                    <div className="relative w-full max-w-[500px] aspect-square">
                        <div className="absolute inset-0 bg-gradient-to-tr from-theme-pink/20 to-purple-900/40 rounded-full blur-3xl animate-pulse"></div>
                        <img
                            src="/about_graphic.png"
                            className="relative z-10 w-full h-full object-contain drop-shadow-[0_0_50px_rgba(255,182,193,0.3)] hover:scale-105 transition-transform duration-500"
                            alt="StreamPay Flow"
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = "https://placehold.co/600x600/121212/FFB6C1/png?text=StreamPay+Flow";
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
