import { EmailSignup } from "./EmailSignup";

export function HeroSection() {
  return (
    <section className="px-6 pt-20 pb-16">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="mb-6 inline-block rounded-full bg-brand-purple/10 px-4 py-1.5 text-sm font-medium text-brand-purple">
          Coming Soon
        </span>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-brand-navy sm:text-5xl lg:text-6xl">
          Routes That{" "}
          <span className="bg-gradient-to-r from-brand-purple-dark to-brand-purple-light bg-clip-text text-transparent">
            Flow
          </span>
        </h1>
        <p className="mb-10 max-w-xl text-lg text-slate-500">
          Corridor-based route planning for road cycling, gravel, running, and
          walking. Long uninterrupted stretches, not a zig-zag of turn-by-turn
          segments.
        </p>
        <EmailSignup />
      </div>
    </section>
  );
}
