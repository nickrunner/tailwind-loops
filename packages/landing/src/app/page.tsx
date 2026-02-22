import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { ActivityTypes } from "@/components/ActivityTypes";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <ActivityTypes />
      </main>
      <Footer />
    </div>
  );
}
