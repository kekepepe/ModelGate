import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";

export const metadata: Metadata = {
  title: "ModelGate",
  description: "Local-first multi-model AI workspace for token plans.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}

