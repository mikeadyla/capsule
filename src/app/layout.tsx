import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Proxima Nova, as in the Refugee Data Portal and Flordanis OS.
const proximaNova = localFont({
  variable: "--font-body-var",
  display: "swap",
  src: [
    { path: "./fonts/proxima-nova-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/proxima-nova-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/proxima-nova-800.woff2", weight: "800", style: "normal" },
  ],
});

// The wordmark only.
const playfair = Playfair_Display({ variable: "--font-heading-var", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Capsule · Flordanis",
  description: "Displacement in the news: the latest humanitarian updates on refugees, asylum and displacement, from ReliefWeb."
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${proximaNova.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  );
}
