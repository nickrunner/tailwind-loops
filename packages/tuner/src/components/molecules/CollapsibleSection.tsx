import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({ title, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="section">
      <div
        className={`section-header${open ? " open" : ""}`}
        onClick={() => setOpen(!open)}
      >
        {title}
      </div>
      <div className={`section-body${open ? " open" : ""}`}>
        {children}
      </div>
    </div>
  );
}
