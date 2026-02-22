import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { ChatDemo } from "@/components/ChatDemo";
import { HowItWorks } from "@/components/HowItWorks";
import { ActivityTypes } from "@/components/ActivityTypes";
import { CtaSection } from "@/components/CtaSection";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <ChatDemo />
        <ActivityTypes />
        <HowItWorks />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
