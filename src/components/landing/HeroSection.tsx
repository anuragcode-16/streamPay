import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Zap, ArrowRight } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const HeroSection = () => {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img src={heroBg} alt="" className="h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background" />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="container relative z-10 mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5">
            <span className="pulse-dot h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm font-medium text-primary">Real-Time Money Streaming</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mx-auto max-w-4xl font-display text-5xl font-bold leading-tight tracking-tight md:text-7xl"
        >
          Pay Only For{" "}
          <span className="text-gradient">What You Use</span>
          <br />
          <span className="text-muted-foreground">Second by Second</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground"
        >
          Pulse Pay transforms static payments into continuous streams. 
          Scan a QR, use any service, and pay precisely for the time you consume. 
          No subscriptions. No overpaying. Just fair pricing.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link
            to="/auth?mode=signup&role=customer"
            className="group flex items-center gap-2 rounded-xl bg-primary px-8 py-4 font-display text-lg font-bold text-primary-foreground transition-all hover:shadow-xl hover:shadow-primary/25"
          >
            <Zap className="h-5 w-5" />
            Start Streaming
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            to="/auth?mode=signup&role=merchant"
            className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-8 py-4 font-display text-lg font-medium text-secondary-foreground transition-all hover:border-primary/40 hover:bg-surface-hover"
          >
            I'm a Merchant
          </Link>
        </motion.div>

        {/* Live stream demo */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="mx-auto mt-16 max-w-md"
        >
          <div className="glass rounded-2xl p-6 neon-border">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">Live Stream Demo</span>
              <span className="flex items-center gap-1.5 text-sm text-primary">
                <span className="pulse-dot h-2 w-2 rounded-full bg-primary" />
                Active
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted mb-4">
              <div className="stream-line h-full w-full rounded-full" />
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Streaming to</p>
                <p className="font-display font-semibold text-foreground">FitZone Gym</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Rate</p>
                <p className="font-display text-2xl font-bold text-gradient">₹2/min</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
