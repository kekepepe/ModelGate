"use client";

import { Activity, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <h1 className="text-sm font-semibold">{title}</h1>

      <div className="flex-1" />

      <div className="relative hidden md:block">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search models, logs..."
          className="h-9 w-64 pl-8 text-sm"
        />
      </div>

      <Badge variant="secondary" className="text-[11px] font-normal">
        Local Workspace
      </Badge>

      <Button variant="ghost" size="icon" className="h-8 w-8">
        <Activity className="h-4 w-4" />
      </Button>
    </header>
  );
}
