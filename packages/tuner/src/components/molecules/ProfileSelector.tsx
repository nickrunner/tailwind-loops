import { Select } from "../atoms/Select.js";
import type { ProfileListItem } from "@tailwind-loops/clients-react";

interface ProfileSelectorProps {
  value: string;
  profiles: ProfileListItem[];
  activity: string;
  onChange: (profileName: string) => void;
}

export function ProfileSelector({ value, profiles, activity, onChange }: ProfileSelectorProps) {
  const filtered = profiles.filter((p) => p.extends === activity);
  const options = [
    { value: "", label: "(base)" },
    ...filtered.map((p) => ({
      value: p.name,
      label: p.name,
      title: p.description,
    })),
  ];

  return (
    <Select
      label="Profile:"
      value={value}
      options={options}
      onChange={onChange}
    />
  );
}
