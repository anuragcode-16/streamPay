import { motion } from "framer-motion";
import { Zap, Shield, BarChart3, Clock, QrCode, Wallet } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Real-Time Streaming",
    description: "Money flows continuously, second by second, using Superfluid protocol on Polygon.",
  },
  {
    icon: QrCode,
    title: "Scan & Stream",
    description: "Scan a QR code at any service location. Payment starts instantly—no PINs, no OTPs.",
  },
  {
    icon: Clock,
    title: "Pay-As-You-Use",
    description: "No monthly subscriptions. Pay precisely for the minutes you actually consume the service.",
  },
  {
    icon: Shield,
    title: "Zero Fees for Users",
    description: "Contextual advertising covers gas fees. Users pay only for the service itself.",
  },
  {
    icon: BarChart3,
    title: "Merchant Analytics",
    description: "Real-time occupancy, usage patterns, heat maps, and ML-powered demand predictions.",
  },
  {
    icon: Wallet,
    title: "Flexible Funding",
    description: "Fund your wallet via traditional payments or crypto. Seamless on-ramp from fiat to blockchain.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="relative py-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="font-display text-4xl font-bold md:text-5xl">
            Everything You Need to{" "}
            <span className="text-gradient">Stream Payments</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Built on blockchain, designed for humans. Zero friction, maximum transparency.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass group rounded-2xl p-6 transition-all hover:neon-border"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
