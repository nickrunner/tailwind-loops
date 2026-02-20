interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: "primary" | "save" | "save-as" | "danger";
  disabled?: boolean;
  className?: string;
}

export function Button({ label, onClick, variant = "primary", disabled, className }: ButtonProps) {
  const variantClass = variant === "primary" ? "btn" : `btn btn-${variant}`;
  return (
    <button
      className={`${variantClass}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
