import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ClimateClock } from "@/components/ClimateClock";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Wind, Home, LogOut, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

interface DashboardLayoutProps {
  children: ReactNode;
  role: "citizen" | "authority";
}

export default function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const [location] = useLocation();
  const { logoutMutation, user } = useAuth();

  return (
    <div className="h-screen flex flex-col bg-background transition-colors duration-500 overflow-hidden">
      <ThemeToggle currentRole={role} />
      
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center text-white",
                role === "citizen" ? "bg-primary" : "bg-blue-600"
              )}>
                <Wind className="w-5 h-5" />
              </div>
              <span className="font-display font-bold text-xl hidden md:inline">NirVayu</span>
            </Link>
            <div className="h-6 w-[1px] bg-border mx-2" />
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {role === "citizen" ? "Citizen Portal" : "Authority Command"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-2"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            ) : (
              <Link href="/auth">
                <Button variant="outline" size="sm" className="gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Authority Login</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-y-auto container mx-auto px-4 py-6 flex flex-col">
        {children}
      </main>
    </div>
  );
}
