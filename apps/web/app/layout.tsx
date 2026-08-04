import type { Metadata, Viewport } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AndThenn — Media ERP", template: "%s · AndThenn" },
  description: "The operational control room for AndThenn Media.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#f6f5f1", colorScheme: "light dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${manrope.variable} ${space.variable}`}><body>{children}</body></html>;
}
