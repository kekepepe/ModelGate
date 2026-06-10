"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getData } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Provider } from "@/types/model";
import { useQuery } from "@tanstack/react-query";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const { data: providers } = useQuery({
    queryKey: ["providers"],
    queryFn: () => getData<Provider[]>("/providers"),
    refetchInterval: 30000,
  });

  const providerStatus = providers?.map((p) => ({
    id: p.id,
    name: p.name,
    configured: p.configured ?? false,
  }));

  const base = pathname.split("?")[0];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          providerStatus={providerStatus}
        />
      </div>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[248px] p-0">
          <Sidebar
            collapsed={false}
            onToggle={() => setMobileOpen(false)}
            providerStatus={providerStatus}
          />
        </SheetContent>
      </Sheet>

      {/* Main area */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Mobile floating menu button */}
        <Button
          variant="outline"
          size="icon"
          className="md:hidden fixed left-3 top-3 z-50 h-9 w-9 shadow-sm bg-background/95 backdrop-blur"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Page content */}
        <main className={cn("flex-1 overflow-y-auto", base !== "/workspace" && "p-6")}>
          {children}
        </main>
      </div>
    </div>
  );
}
