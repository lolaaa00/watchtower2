import type { Metadata } from "next";
import { Chivo, Rajdhani, Commissioner, Fragment_Mono, Libre_Baskerville } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/hooks/useWallet";
import { ActiveProfileProvider } from "@/lib/hooks/useActiveProfile";
import ObservatoryShell from "@/components/shell/ObservatoryShell";

const chivo = Chivo({ subsets: ["latin"], variable: "--font-heading", weight: ["400", "600", "700", "800", "900"] });
const rajdhani = Rajdhani({ subsets: ["latin"], variable: "--font-display-num", weight: ["400", "500", "600", "700"] });
const commissioner = Commissioner({ subsets: ["latin"], variable: "--font-body" });
const fragmentMono = Fragment_Mono({ subsets: ["latin"], variable: "--font-data", weight: "400" });
const libreBaskerville = Libre_Baskerville({ subsets: ["latin"], variable: "--font-legal", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Watchtower — Regulatory Impact Consensus Layer",
  description: "Official regulatory updates, judged on-chain for business impact. GenLayer-native compliance intelligence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${chivo.variable} ${rajdhani.variable} ${commissioner.variable} ${fragmentMono.variable} ${libreBaskerville.variable} h-full`}>
      <body className="min-h-full" style={{ fontFamily: "var(--font-body), sans-serif" }}>
        <WalletProvider>
          <ActiveProfileProvider>
            <ObservatoryShell>{children}</ObservatoryShell>
          </ActiveProfileProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
