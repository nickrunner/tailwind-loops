import Image from "next/image";

export function Navbar() {
  return (
    <nav className="absolute top-0 z-20 w-full px-6 py-4">
      <div className="flex items-center gap-3">
        <Image
          src="/logos/logo-plain.png"
          alt="Tailwind Loops logo - a loop of three arrows forming an infinity symbol"
          width={48}
          height={32}
          className="h-8 w-auto"
        />
        <span className="text-xl font-bold text-white">Tailwind Loops</span>
      </div>
    </nav>
  );
}
