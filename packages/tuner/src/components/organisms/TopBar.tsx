import type { ActivityType, ProfileListItem } from "@tailwind-loops/clients-react";
import { ActivitySelector } from "../molecules/ActivitySelector.js";
import { ProfileSelector } from "../molecules/ProfileSelector.js";

interface TopBarProps {
  activity: ActivityType;
  onActivityChange: (activity: ActivityType) => void;
  profileName: string;
  profiles: ProfileListItem[];
  onProfileChange: (name: string) => void;
  showArrows: boolean;
  onToggleArrows: () => void;
  status: string;
}

export function TopBar({
  activity,
  onActivityChange,
  profileName,
  profiles,
  onProfileChange,
  showArrows,
  onToggleArrows,
  status,
}: TopBarProps) {
  return (
    <div className="top-bar">
      <h1>Scoring Tuner</h1>
      <ActivitySelector value={activity} onChange={onActivityChange} />
      <ProfileSelector
        value={profileName}
        profiles={profiles}
        activity={activity}
        onChange={onProfileChange}
      />
      <button className="toggle-btn" onClick={onToggleArrows}>
        Arrows: {showArrows ? "ON" : "OFF"}
      </button>
      <span className="status">{status}</span>
    </div>
  );
}
