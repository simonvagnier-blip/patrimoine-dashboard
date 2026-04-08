import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import QuickUpdateFAB from "@/components/QuickUpdateFAB";
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
  title: "Patrimoine Dashboard",
  description: "Pilotage patrimonial personnel",
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
        <Navbar />
        {children}
        <QuickUpdateFAB />
      </body>
    </html>
  );
}
