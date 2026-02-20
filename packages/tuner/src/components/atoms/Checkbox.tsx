interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  bold?: boolean;
}

export function Checkbox({ label, checked, onChange, id, bold }: CheckboxProps) {
  const inputId = id ?? `cb-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="checkbox-row">
      <input
        type="checkbox"
        id={inputId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={inputId} style={bold ? { fontWeight: 600 } : undefined}>
        {label}
      </label>
    </div>
  );
}
