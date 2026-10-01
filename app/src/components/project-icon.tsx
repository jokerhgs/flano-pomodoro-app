import {
  Folder,
  Briefcase,
  Code,
  BookOpen,
  Heart,
  Target,
  Zap,
  Music,
  Smile,
  Star,
  Sparkles,
  Flame,
  CheckSquare,
  Layers,
  Compass,
  Globe,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

export const PROJECT_ICONS: Record<string, LucideIcon> = {
  Folder,
  Briefcase,
  Code,
  BookOpen,
  Heart,
  Target,
  Zap,
  Music,
  Smile,
  Star,
  Sparkles,
  Flame,
  CheckSquare,
  Layers,
  Compass,
  Globe,
};

export const PROJECT_ICON_NAMES = Object.keys(PROJECT_ICONS);

export function ProjectIcon({
  icon,
  className = "h-4 w-4",
  style,
}: {
  icon?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const Component = (icon && PROJECT_ICONS[icon]) || Folder;
  return <Component className={className} style={style} />;
}
