import Image from "next/image";
import { EmailSignup } from "./EmailSignup";

export function HeroSection() {
  return (
    <section className="relative min-h-[600px] overflow-hidden px-6 pt-24 pb-20 sm:min-h-[650px] sm:pt-32 sm:pb-24">
      {/* Background image */}
      <Image
        src="/photos/roads/green-hills-road.jpg"
        //src="/photos/roads/enhanced/desert-canyon-road.png"
        alt="Open road through rolling green hills"
        fill
        priority
        className="object-cover object-center"
      />
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60" />

      {/* Content */}
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="mb-6 inline-block rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
          Coming Soon
        </span>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
          What's the <span className="text-brand-wind">ride</span> today?
        </h1>
        <p className="mb-10 max-w-xl text-lg text-white/80">
          AI-powered route generation for cyclists, runners, and walkers. Tell us the distance, vibe,
          surface, and scenery — we'll build the perfect route for you.
        </p>
        <EmailSignup />
      </div>
    </section>
  );
}
