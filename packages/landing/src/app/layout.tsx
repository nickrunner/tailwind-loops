import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tailwind Loops — Corridor-Based Route Planning for Cyclists & Runners",
  description:
    "Discover the best cycling and running routes. Tailwind Loops uses corridor-based scoring to find routes with sustained flow, safety, and character. Coming soon.",
  keywords: [
    "cycling routes",
    "running routes",
    "route planning",
    "road cycling",
    "gravel cycling",
    "trail running",
    "corridor routing",
  ],
  openGraph: {
    title: "Tailwind Loops — Routes That Flow",
    description:
      "Corridor-based route planning for road cycling, gravel, running, and walking. Coming soon.",
    url: "https://tailwindloops.com",
    siteName: "Tailwind Loops",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tailwind Loops — Routes That Flow",
    description:
      "Corridor-based route planning for road cycling, gravel, running, and walking. Coming soon.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
