import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "./site-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Inteligência de mercado",
    template: "%s · Inteligência de mercado",
  },
  description: "Margem e sortimento a partir dos mais vendidos do Mercado Livre",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} min-h-dvh bg-zinc-100 antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col bg-zinc-100 text-zinc-950" suppressHydrationWarning>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
