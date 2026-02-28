import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import MerchantDashboard from "./pages/MerchantDashboard";
import CustomerDashboard from "./pages/CustomerDashboard";
import CameraQR from "./pages/CameraQR";
import NearbyPage from "./pages/NearbyPage";
import InvoicePage from "./pages/InvoicePage";
import WalletPage from "./pages/WalletPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />

            {/* Merchant — protected */}
            <Route
              path="/merchant"
              element={
                <ProtectedRoute requiredRole="merchant">
                  <MerchantDashboard />
                </ProtectedRoute>
              }
            />

            {/* Customer — protected */}
            <Route
              path="/customer"
              element={
                <ProtectedRoute requiredRole="customer">
                  <CustomerDashboard />
                </ProtectedRoute>
              }
            />

            {/* Public / semi-public */}
            <Route path="/scan" element={<CameraQR />} />
            <Route path="/nearby" element={<NearbyPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/invoice/:sessionId" element={<InvoicePage />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
