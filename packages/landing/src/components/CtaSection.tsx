"use client";

import { EmailSignup } from "./EmailSignup";

export function CtaSection() {
  return (
    <section className="bg-brand-navy px-6 py-20">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <h2 className="mb-3 text-2xl font-bold text-white sm:text-3xl">
          Ready to Ride Smarter?
        </h2>
        <p className="mb-8 max-w-lg text-slate-300">
          Join the waitlist and be the first to experience AI-powered route
          generation when we launch.
        </p>
        <EmailSignup />
      </div>
    </section>
  );
}
