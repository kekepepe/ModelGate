"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getData } from "@/lib/api";
import type { Provider } from "@/types/model";
import { useQuery } from "@tanstack/react-query";

const pathTitles: Record<string, string> = {
  "/": "Overview",
  "/workspace": "Playground",
  "/models": "Models",
  "/usage": "Usage",
  "/logs": "Activity Logs",
  "/settings": "Settings",
  "/history": "History",
};

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
  const title = pathTitles[base] ?? "ModelGate";

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
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-sm font-semibold">{title}</h1>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
