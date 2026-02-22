import type { Metadata } from "next";
import "./globals.css";

const baseUrl = process.env["VERCEL_PROJECT_PRODUCTION_URL"]
  ? `https://${process.env["VERCEL_PROJECT_PRODUCTION_URL"]}`
  : "https://tailwindloops.com";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "Tailwind Loops — AI-Powered Route Generation for Cyclists & Runners",
  description:
    "Describe your perfect ride and get an optimized route in seconds. Tailwind Loops uses AI and corridor-based intelligence to generate cycling and running routes with sustained flow, safety, and scenery. Coming soon.",
  keywords: [
    "AI route planning",
    "cycling routes",
    "running routes",
    "intelligent routing",
    "road cycling",
    "gravel cycling",
    "trail running",
    "AI cycling",
    "route generation",
  ],
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Tailwind Loops — AI-Powered Route Generation",
    description:
      "Describe your ideal ride. Get an optimized route in seconds. AI-powered corridor intelligence for cyclists and runners. Coming soon.",
    url: "https://tailwindloops.com",
    siteName: "Tailwind Loops",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Tailwind Loops — What's today's ride?",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tailwind Loops — AI-Powered Route Generation",
    description:
      "Describe your ideal ride. Get an optimized route in seconds. AI-powered corridor intelligence for cyclists and runners. Coming soon.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
