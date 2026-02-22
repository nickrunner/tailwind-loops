export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand-navy px-6 py-8 text-center text-sm text-slate-400">
      &copy; {year} Tailwind Loops. All rights reserved.
    </footer>
  );
}
