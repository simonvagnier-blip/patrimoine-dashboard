import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import PwaSetup from "@/components/PwaSetup";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Command Center",
  description: "Hub personnel & professionnel",
  // PWA iOS : icône écran d'accueil (180×180, fond plein) + mode standalone.
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Patrimoine",
  },
};

export const viewport: Viewport = {
  themeColor: "#080c14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${dmSans.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-[#080c14] text-gray-100 font-[family-name:var(--font-dm-sans)]">
        <AppShell>
          {children}
        </AppShell>
        <PwaSetup />
      </body>
    </html>
  );
}
