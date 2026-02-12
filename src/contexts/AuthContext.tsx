import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type UserRole = "merchant" | "customer" | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole;
  profile: { display_name: string; email: string } | null;
  loading: boolean;
  signUp: (email: string, password: string, role: "merchant" | "customer", displayName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [profile, setProfile] = useState<{ display_name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("AuthProvider mounted");
  }, []);

  const fetchUserData = async (userId: string) => {
    // Fetch role
    const { data: roleData } = await supabase
      .from("user_roles" as any)
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleData) {
      setRole((roleData as any).role as UserRole);
    }

    // Fetch profile
    const { data: profileData } = await supabase
      .from("profiles" as any)
      .select("display_name, email")
      .eq("id", userId)
      .maybeSingle();

    if (profileData) {
      setProfile(profileData as any);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // IMMEDIATE FIX: Set role/profile from metadata to avoid DB race conditions
          // or missing tables blocking access
          const metadata = session.user.user_metadata;
          if (metadata?.role) setRole(metadata.role as UserRole);
          if (metadata?.display_name || metadata?.name) {
            setProfile({
              display_name: metadata.display_name || metadata.name,
              email: session.user.email || ""
            });
          }

          // Use setTimeout to avoid Supabase auth deadlock
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setRole(null);
          setProfile(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // IMMEDIATE FIX: Set role/profile from metadata
        const metadata = session.user.user_metadata;
        if (metadata?.role) setRole(metadata.role as UserRole);
        if (metadata?.display_name || metadata?.name) {
          setProfile({
            display_name: metadata.display_name || metadata.name,
            email: session.user.email || ""
          });
        }

        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, role: "merchant" | "customer", displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { role, display_name: displayName },
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const result = await supabase.auth.signInWithPassword({ email, password });
    return result;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, profile, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
