import Image from "next/image";

import { getTeamLogoPath, getTeamName } from "@/lib/data/catalog";

export function UserNickname({ nickname, teamId }: { nickname: string; teamId: string | null }) {
  const logo = teamId ? getTeamLogoPath(teamId) : null;
  return <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 align-middle">
    {logo && teamId ? <Image src={logo} alt={`${getTeamName(teamId)} 엠블럼`} width={20} height={20} className="size-5 shrink-0 object-contain" /> : null}
    <span className="truncate">{nickname}</span>
  </span>;
}
