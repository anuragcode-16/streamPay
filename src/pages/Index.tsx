import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import AboutSection from "@/components/landing/AboutSection";
import MarketPlace from "@/components/landing/MarketPlace";
import Community from "@/components/landing/Community";
import Discover from "@/components/landing/Discover";
import LandingFooter from "@/components/landing/LandingFooter";

const Index = () => {
  return (
    <div className="bg-theme-black min-h-screen text-white font-sans selection:bg-theme-pink selection:text-black">
      <LandingNavbar />
      <HeroSection />
      <div id="about">
        <AboutSection />
      </div>
      <div id="problem">
        <MarketPlace />
      </div>
      <div id="solution">
        <Community />
      </div>
      <div id="vision">
        <Discover />
      </div>
      <LandingFooter />
    </div>
  );
};

export default Index;
