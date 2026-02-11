import { useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, User, ArrowRight, Building2 } from "lucide-react";

const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const initialRole = searchParams.get("role") === "merchant" ? "merchant" : "customer";

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [role, setRole] = useState<"customer" | "merchant">(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Navigate to appropriate dashboard
    if (role === "merchant") {
      navigate("/merchant");
    } else {
      navigate("/customer");
    }
  };

  return (
    <div className="gradient-mesh flex min-h-screen items-center justify-center px-4">
      {/* Grid bg */}
      <div
        className="fixed inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="font-display text-2xl font-bold text-foreground">
            PULSE<span className="neon-text">PAY</span>
          </span>
        </Link>

        <div className="glass rounded-2xl p-8 neon-border">
          <h2 className="font-display text-2xl font-bold text-foreground text-center">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            {mode === "login"
              ? "Sign in to your Pulse Pay account"
              : "Join the future of payments"}
          </p>

          {/* Role toggle */}
          <div className="mt-6 flex overflow-hidden rounded-xl bg-muted p-1">
            <button
              onClick={() => setRole("customer")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${
                role === "customer"
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="h-4 w-4" />
              Customer
            </button>
            <button
              onClick={() => setRole("merchant")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${
                role === "merchant"
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="h-4 w-4" />
              Merchant
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  {role === "merchant" ? "Business Name" : "Full Name"}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={role === "merchant" ? "FitZone Gym" : "Avishek Kumar"}
                    className="w-full rounded-xl border border-border bg-secondary py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-border bg-secondary py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-secondary py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <button
              type="submit"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-display font-bold text-primary-foreground transition-all hover:neon-glow"
            >
              {mode === "login" ? "Sign In" : "Create Account"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or continue with</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-secondary py-3 text-sm font-medium text-foreground transition-all hover:border-primary/40 hover:bg-surface-hover">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <button onClick={() => setMode("signup")} className="font-medium text-primary hover:underline">
                  Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button onClick={() => setMode("login")} className="font-medium text-primary hover:underline">
                  Sign In
                </button>
              </>
            )}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthPage;
