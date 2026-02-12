import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

interface Props {
  children: React.ReactNode;
  requiredRole?: "merchant" | "customer";
}

const ProtectedRoute = ({ children, requiredRole }: Props) => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  
  if (requiredRole && role !== requiredRole) {
    return <Navigate to={role === "merchant" ? "/merchant" : "/customer"} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
