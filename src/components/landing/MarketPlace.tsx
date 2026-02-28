import { ArrowRight } from "lucide-react";
import { NftCard } from "./NftCard";

export default function MarketPlace() {
    return (
        <section className="bg-theme-black relative py-20">
            <div className="container px-6 mx-auto">
                <div className="grid items-center gap-4 xl:grid-cols-5">
                    <div className="p-6 xl:col-span-3">
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="grid content-center space-y-10 relative md:-mt-[10rem]">
                                <div className="bg-theme-gray/50 p-6 rounded-2xl border border-theme-pink/20 backdrop-blur-sm hover:border-theme-pink/50 transition-all">
                                    <h3 className="text-xl font-bold text-white mb-2">Subscription Fatigue</h3>
                                    <p className="text-gray-400 text-sm">Consumers pay for unused gym memberships, streaming services, and software because they forget to cancel or fear losing access.</p>
                                </div>
                                <div className="bg-theme-gray/50 p-6 rounded-2xl border border-theme-pink/20 backdrop-blur-sm hover:border-theme-pink/50 transition-all">
                                    <h3 className="text-xl font-bold text-white mb-2">High Churn Rates</h3>
                                    <p className="text-gray-400 text-sm">Service providers lose customers who can't justify fixed fees for sporadic usage, wasting acquisition costs.</p>
                                </div>
                            </div>
                            <div className="grid content-center space-y-10 md:mt-10">
                                <div className="bg-theme-gray/50 p-6 rounded-2xl border border-theme-pink/20 backdrop-blur-sm hover:border-theme-pink/50 transition-all">
                                    <h3 className="text-xl font-bold text-white mb-2">The Market Gap</h3>
                                    <p className="text-gray-400 text-sm">A mismatch between consumers who want pay-per-use and providers who need revenue stability.</p>
                                </div>
                                <div className="bg-theme-gray/50 p-6 rounded-2xl border border-theme-pink/20 backdrop-blur-sm hover:border-theme-pink/50 transition-all">
                                    <h3 className="text-xl font-bold text-white mb-2">Elastic Usage</h3>
                                    <p className="text-gray-400 text-sm">Fixed pricing fails for services where consumption variability is high (EV charging, coworking).</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="max-w-2xl my-8 space-y-6 xl:col-span-2 text-left">
                        <h2 className="text-5xl sm:text-[60px] font-bold text-white leading-tight">
                            The Market <span className="text-theme-pink">Gap.</span>
                        </h2>
                        <p className="text-gray-400 text-lg">
                            What we have is a clear market gap. On one side, consumers want to pay only for what they use. On the other, providers want to retain customers.
                        </p>
                        <p className="text-gray-400 text-lg">
                            In the middle, we have a payment infrastructure that forces everyone into a model that serves neither well. Stream Pay bridges this gap by enabling granular, usage-based pricing that aligns incentives for everyone.
                        </p>

                        <button className="px-8 py-4 border border-theme-pink/30 flex items-center sm:text-lg font-bold rounded-full glass hover:bg-theme-pink/10 hover:border-theme-pink text-white transition-all duration-300 group">
                            Explore Solutions <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
