import { Link } from "react-router-dom";
import { Zap } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border py-12">
      <div className="container mx-auto flex flex-col items-center justify-between gap-6 px-6 md:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold text-foreground">
            PULSE<span className="neon-text">PAY</span>
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          © 2026 Stream Pay by Mind_Matrix. Track 4: Streaming Utility.
        </p>
        <div className="flex gap-6">
          <Link to="/auth?mode=login" className="text-sm text-muted-foreground hover:text-foreground">
            Login
          </Link>
          <Link to="/auth?mode=signup" className="text-sm text-muted-foreground hover:text-foreground">
            Sign Up
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
