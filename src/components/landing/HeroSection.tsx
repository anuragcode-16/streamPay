import { ArrowRight } from "lucide-react";
import GradualBlur from "../ui/GradualBlur";

import { useNavigate } from "react-router-dom";

export default function HeroSection() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen pt-32 pb-20 relative overflow-hidden">
      {/* Background gradients */}
      {/* Background gradients and Grid */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-theme-pink/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-theme-pink-glow/20 rounded-full blur-[100px]" />

        {/* Bottom glow to make blur visible */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[200px] bg-theme-pink/10 rounded-full blur-[80px] opacity-60"></div>

        {/* Animated Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-theme-pink opacity-20 blur-[100px]"></div>
      </div>

      <div className="flex w-full flex-wrap xl:flex-nowrap container mx-auto justify-between py-[2rem] z-10 relative">
        <div className="flex sm:mt-10 flex-col text-left px-2 sm:px-6 lg:w-1/2">
          <h1 className="text-[55px] sm:text-[80px] font-bold leading-none text-white tracking-tighter">
            Real-time <span className="text-transparent bg-clip-text bg-gradient-to-r from-theme-pink to-theme-pink-glow">Money Streaming.</span>
          </h1>

          <h1 className="text-2xl font-semibold flex flex-col my-6 text-gray-300">
            Introduction: Understanding the Concept
          </h1>
          <p className="max-w-lg text-gray-400 text-lg leading-relaxed">
            Imagine walking into a gym, scanning a QR code, working out for exactly 30 minutes, and paying only for those 30 minutes. This is the core idea behind Stream Pay, a revolutionary per-second wallet buffer system bridging physical services and real-time payments.
          </p>
          <div className="flex items-center flex-wrap gap-6 mt-10">
            <button className="flex flex-col justify-start text-lg font-bold rounded text-white hover:text-theme-pink transition-colors">
              <span className="text-sm text-gray-500 uppercase tracking-widest mb-1">Powered By</span>
              <span className="text-2xl">Razorpay & Node.js</span>
            </button>

            <button
              onClick={() => navigate("/customer")}
              className="px-8 py-4 border border-theme-pink/30 flex items-center sm:text-lg font-bold rounded-full glass hover:bg-theme-pink/10 hover:border-theme-pink text-white transition-all duration-300 group"
            >
              Open App <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* Right side image/graphic */}
        <div className="relative mt-10 xl:mt-0 xl:absolute xl:top-0 xl:right-0 w-full xl:w-1/2 h-[500px] xl:h-[800px] flex items-center justify-center">
          {/* Abstract shape representing the image */}
          <div className="relative w-full h-full">
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-gradient-to-tr from-theme-pink to-purple-600 rounded-full blur-[60px] opacity-40 animate-pulse"></div>
            <img
              src="https://placehold.co/800x1000/000000/FFFFFF/png?text=StreamPay+App"
              className="object-contain w-full h-full relative z-10 mix-blend-screen opacity-80"
              alt="StreamPay App"
            />
          </div>
        </div>
      </div>
      <GradualBlur
        target="parent"
        position="bottom"
        height="7rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
      />
    </div>
  );
}
