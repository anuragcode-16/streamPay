import { motion } from "framer-motion";
import { QrCode, Play, Square } from "lucide-react";

const steps = [
  {
    icon: QrCode,
    step: "01",
    title: "Scan QR Code",
    description: "Walk into any Stream Pay enabled location and scan the QR code with the app.",
  },
  {
    icon: Play,
    step: "02",
    title: "Stream Starts",
    description: "Money begins streaming from your wallet to the service provider in real-time.",
  },
  {
    icon: Square,
    step: "03",
    title: "Tap to Stop",
    description: "When you're done, tap Stop. You're charged for the exact seconds you used.",
  },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="relative py-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="font-display text-4xl font-bold md:text-5xl">
            How <span className="text-gradient">Stream Pay</span> Works
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Three simple steps. No blockchain knowledge required.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 }}
              className="relative text-center"
            >
              {i < steps.length - 1 && (
                <div className="absolute right-0 top-12 hidden h-0.5 w-full translate-x-1/2 md:block">
                  <div className="stream-line h-full w-full" />
                </div>
              )}
              <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-2xl glass neon-border">
                <step.icon className="h-10 w-10 text-primary" />
                <span className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground">
                  {step.step}
                </span>
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
