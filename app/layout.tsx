import type { Metadata, Viewport } from "next";
import { Cinzel, Cormorant, Montserrat } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { NavProgress } from "@/components/layout/nav-progress";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/config/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · VOETutor",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["IB tutoring", "IB educators", "video lessons", "exam prep", "online learning", "Vault of Excellence", "VOETutor"],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  category: "education",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0d9488" },
    { media: "(prefers-color-scheme: dark)", color: "#08312c" },
  ],
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
        <NavProgress />
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
