import { type ReactNode } from "react";

function ChatSparkleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      {/* Speech bubble */}
      <path d="M21 12a8.5 8.5 0 0 1-1.2 4.4L21 21l-4.6-1.2A8.5 8.5 0 1 1 21 12z" />
      {/* Sparkle */}
      <path d="M12 8v4m0 0v2m0-2h2m-2 0h-2" />
      {/* Small sparkle rays */}
      <line x1="15.5" y1="6" x2="16.5" y2="5" />
      <line x1="17" y1="8" x2="18.5" y2="7.5" />
      <line x1="16" y1="10" x2="17" y2="11" />
    </svg>
  );
}

function MapCorridorIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      {/* Map outline */}
      <rect x="3" y="3" width="18" height="18" rx="2" />
      {/* Winding corridor path */}
      <path d="M7 17c2-3 3-5 5-5s3 3 5 0 2-6 0-6-3 3-5 3-3-3-5 0" />
      {/* Map fold lines */}
      <line x1="9" y1="3" x2="9" y2="6" />
      <line x1="15" y1="3" x2="15" y2="6" />
    </svg>
  );
}

function FlowLoopIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      {/* Infinity / figure-8 loop */}
      <path d="M12 12c0-3.5 2.5-6 5.5-6S23 8.5 23 12s-2.5 6-5.5 6S12 15.5 12 12zm0 0c0 3.5-2.5 6-5.5 6S1 15.5 1 12s2.5-6 5.5-6S12 8.5 12 12z" />
      {/* Directional arrow on the right loop */}
      <polyline points="19,8 21,9.5 19,11" />
    </svg>
  );
}

const steps: { icon: ReactNode; title: string; description: string }[] = [
  {
    icon: <ChatSparkleIcon />,
    title: "You Describe, AI Understands",
    description:
      "Tell us what you want in plain language — distance, surface, scenery, difficulty. Our AI translates your intent into precise routing parameters.",
  },
  {
    icon: <MapCorridorIcon />,
    title: "Corridor Intelligence",
    description:
      "We don't just connect waypoints. We analyze thousands of road and trail corridors, scoring each for flow, safety, surface quality, and scenery — then chain them into seamless loops.",
  },
  {
    icon: <FlowLoopIcon />,
    title: "Routes That Flow",
    description:
      "Long uninterrupted stretches instead of a zig-zag of turn-by-turn fragments. Fewer stops, better rhythm, more enjoyment — whether you're on a road bike, gravel rig, or running shoes.",
  },
];

export function HowItWorks() {
  return (
    <section className="bg-slate-50 px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-3 text-center text-2xl font-bold text-brand-navy sm:text-3xl">
          Smarter Than Turn-by-Turn
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-slate-500">
          Traditional route planners connect point A to point B. Tailwind Loops
          understands what makes a great ride — and builds routes around it.
        </p>
        <div className="grid gap-8 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.title} className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-blue shadow-sm border border-slate-100">
                {step.icon}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-brand-navy">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
