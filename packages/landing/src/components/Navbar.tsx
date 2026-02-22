import { InfinityLogo } from "./InfinityLogo";

export function Navbar() {
  return (
    <nav className="absolute top-0 z-20 w-full px-6 py-4">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <InfinityLogo className="h-8 w-16" />
        <span className="text-xl font-bold text-white">
          Tailwind Loops
        </span>
      </div>
    </nav>
  );
}
