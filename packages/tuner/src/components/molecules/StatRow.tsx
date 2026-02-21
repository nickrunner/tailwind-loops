interface StatRowProps {
  label: string;
  value: string | number;
  unit?: string;
}

export function StatRow({ label, value, unit }: StatRowProps) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}{unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
