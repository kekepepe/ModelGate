"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Play,
  Boxes,
  BarChart3,
  ScrollText,
  KeyRound,
  Settings,
  Bot,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/workspace?taskType=chat", label: "Playground", icon: Play },
  { href: "/models", label: "Models", icon: Boxes },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/activity", label: "Activity", icon: ScrollText },
  { href: "/projects", label: "Projects", icon: Bot },
  { href: "/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  providerStatus?: { id: string; name: string; configured: boolean }[];
}

export function Sidebar({ collapsed, onToggle, providerStatus }: SidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    const base = href.split("?")[0];
    // Settings should NOT match when we're on /api-keys (both start with /se... — actually /api-keys is distinct, but keep exact-prefix logic explicit)
    return pathname === base || pathname.startsWith(base + "/");
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col border-r bg-background transition-all duration-200",
          collapsed ? "w-[60px]" : "w-[248px]"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight">
              ModelGate
            </span>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-2 py-3">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const linkContent = (
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return <div key={item.href}>{linkContent}</div>;
            })}
          </nav>
        </ScrollArea>

        {/* Provider status */}
        {!collapsed && providerStatus && providerStatus.length > 0 && (
          <div className="border-t px-4 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Providers
            </p>
            <div className="flex flex-col gap-1.5">
              {providerStatus.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="truncate text-muted-foreground">
                    {p.name}
                  </span>
                  <StatusPill tone={p.configured ? "ready" : "warn"} className="text-[10px]">
                    {p.configured ? "Ready" : "No Key"}
                  </StatusPill>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3">
          {!collapsed && (
            <span className="text-[11px] text-muted-foreground">
              Local Mode · v2.0
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 shrink-0", collapsed && "mx-auto")}
            onClick={onToggle}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
