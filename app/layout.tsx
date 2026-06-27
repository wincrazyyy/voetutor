import type { Metadata } from "next";
import { Cinzel, Cormorant, Montserrat } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "VOETutor — Vault of Excellence | Premium IB Tutoring",
  description: "The Vault of Excellence — a curated marketplace of vetted IB educators. Browse specialist tutors, watch HD video lessons, and learn on demand.",
  keywords: ["IB tutoring", "IB educators", "video lessons", "exam prep", "online learning", "Vault of Excellence"],
};

/* Cormorant = serif display (headings, the LCP H1) → preload the weights the headline uses.
   Montserrat = sans body. Exposed as CSS vars and wired to Tailwind font-serif / font-sans. */
const cormorant = Cormorant({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  preload: true,
});

const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

/* Cinzel = the prestige crest face — used only for the "Vault of Excellence" logo lockup. */
const cinzel = Cinzel({
  variable: "--font-crest",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${montserrat.variable} ${cormorant.variable} ${cinzel.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
