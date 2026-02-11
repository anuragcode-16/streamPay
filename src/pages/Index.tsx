import Navbar from "@/components/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import UseCasesSection from "@/components/landing/UseCasesSection";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="gradient-mesh min-h-screen">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <UseCasesSection />
      <Footer />
    </div>
  );
};

export default Index;
