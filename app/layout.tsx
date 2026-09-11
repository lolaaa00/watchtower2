import type { Metadata } from "next";
import { Space_Grotesk, Rajdhani, Inter, IBM_Plex_Mono, Libre_Baskerville } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/hooks/useWallet";
import { ActiveProfileProvider } from "@/lib/hooks/useActiveProfile";
import ObservatoryShell from "@/components/shell/ObservatoryShell";
import StarField from "@/components/shared/StarField";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading", weight: ["300", "400", "500", "600", "700"] });
const rajdhani = Rajdhani({ subsets: ["latin"], variable: "--font-display-num", weight: ["400", "500", "600", "700"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-data", weight: ["400", "500"] });
const libreBaskerville = Libre_Baskerville({ subsets: ["latin"], variable: "--font-legal", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Watchtower AI - Regulatory Impact Consensus Layer",
  description: "Official regulatory updates, judged on-chain for business impact. GenLayer-native compliance intelligence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${rajdhani.variable} ${inter.variable} ${ibmPlexMono.variable} ${libreBaskerville.variable} h-full`}>
      <body className="min-h-full">
        <div className="cosmos-bg" />
        <div className="orbs">
          <div className="orb o1" />
          <div className="orb o2" />
          <div className="orb o3" />
          <div className="orb o4" />
        </div>
        <StarField />
        <WalletProvider>
          <ActiveProfileProvider>
            <ObservatoryShell>{children}</ObservatoryShell>
          </ActiveProfileProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
