import Image from "next/image";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-brand-bg px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        {/* Logo + name */}
        <div className="flex items-center gap-3">
          <Image
            src="/logos/logo-plain.png"
            alt="Tailwind Loops logo"
            width={40}
            height={28}
            className="h-7 w-auto"
          />
          <span className="text-lg font-bold text-brand-navy">Tailwind Loops</span>
        </div>

        {/* Divider + copyright */}
        <div className="mt-8 w-full pt-6">
          <p className="text-sm text-slate-400">
            &copy; {year} Tailwind Loops. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
