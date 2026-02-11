import { motion } from "framer-motion";
import { Dumbbell, Car, Wifi, Battery, Building2 } from "lucide-react";

const useCases = [
  { icon: Dumbbell, title: "Gyms & Fitness", desc: "Pay per minute of workout" },
  { icon: Battery, title: "EV Charging", desc: "Pay per kWh consumed" },
  { icon: Building2, title: "Coworking", desc: "Pay per hour of space" },
  { icon: Car, title: "Parking", desc: "Pay per minute parked" },
  { icon: Wifi, title: "WiFi Hotspots", desc: "Pay per MB used" },
];

const UseCasesSection = () => {
  return (
    <section id="use-cases" className="relative py-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="font-display text-4xl font-bold md:text-5xl">
            Built For <span className="text-gradient">Every Service</span>
          </h2>
        </motion.div>

        <div className="mt-16 flex flex-wrap items-center justify-center gap-6">
          {useCases.map((uc, i) => (
            <motion.div
              key={uc.title}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass group flex w-52 flex-col items-center rounded-2xl p-6 text-center transition-all hover:neon-border"
            >
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <uc.icon className="h-7 w-7" />
              </div>
              <h3 className="font-display font-semibold text-foreground">{uc.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{uc.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UseCasesSection;
