import { Select } from "../atoms/Select.js";
import type { ActivityType } from "@tailwind-loops/clients-react";

const ACTIVITY_OPTIONS = [
  { value: "road-cycling", label: "Road Cycling" },
  { value: "gravel-cycling", label: "Gravel Cycling" },
  { value: "running", label: "Running" },
  { value: "walking", label: "Walking" },
];

interface ActivitySelectorProps {
  value: ActivityType;
  onChange: (activity: ActivityType) => void;
}

export function ActivitySelector({ value, onChange }: ActivitySelectorProps) {
  return (
    <Select
      label="Activity:"
      value={value}
      options={ACTIVITY_OPTIONS}
      onChange={(v) => onChange(v as ActivityType)}
    />
  );
}
