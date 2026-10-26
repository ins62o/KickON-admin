import { getTeamColor, getTeamName } from "@/lib/data/catalog";
import { cn } from "@/lib/utils";

export function CommunityBoardBadge({ board, teamId, teamName, className }: { board: string; teamId: string; teamName: string | null; className?: string }) {
  const isGlobal = board === "LEAGUE";
  const background = isGlobal ? "#000000" : getTeamColor(teamId);
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(background.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const foreground = luminance > 0.179 ? "#000000" : "#ffffff";
  return <span className={cn("inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold", className)} style={{ backgroundColor: background, color: foreground, borderColor: "color-mix(in srgb, currentColor 20%, transparent)" }}>
    <span className="min-w-0 truncate">{isGlobal ? "전체 게시판" : teamName ?? getTeamName(teamId)}</span>
  </span>;
}
