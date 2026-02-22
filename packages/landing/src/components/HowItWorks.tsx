import { MaterialIcon } from "./icons";

const steps = [
  {
    icon: "psychology",
    title: "You Describe, AI Understands",
    description:
      "Tell us what you want in plain language — distance, surface, scenery, difficulty. Our AI translates your intent into precise routing parameters."
  },
  {
    icon: "map",
    title: "Corridor Intelligence",
    description:
      "We don't just connect waypoints. We analyze thousands of road and trail corridors, scoring each for flow, safety, surface quality, and scenery — then chain them into seamless loops."
  },
  {
    icon: "all_inclusive",
    title: "Routes That Flow",
    description:
      "Long uninterrupted stretches instead of a zig-zag of turn-by-turn fragments. Fewer stops, better rhythm, more enjoyment — whether you're on a road bike, gravel rig, or running shoes."
  }
];

export function HowItWorks() {
  return (
    <section className="bg-brand-bg px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-3 text-center text-2xl font-bold text-brand-navy sm:text-3xl">
          Smarter Than Turn-by-Turn
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-slate-500">
          Traditional route planners connect point A to point B. Tailwind Loops understands what
          makes a great ride — and builds routes around it.
        </p>
        <div className="grid gap-8 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.title} className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-blue shadow-sm border border-slate-100">
                <MaterialIcon name={step.icon} size={28} />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-brand-navy">{step.title}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
