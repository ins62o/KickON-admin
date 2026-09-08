"use client";

import { usePathname } from "next/navigation";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardLoading from "@/app/(console)/loading";
import AuditLoading from "@/app/(console)/audit/loading";
import AuditDetailLoading from "@/app/(console)/audit/detail/loading";
import DataManagementLoading from "@/app/(console)/data-management/loading";
import InquiriesLoading from "@/app/(console)/inquiries/loading";
import InquiryDetailLoading from "@/app/(console)/inquiries/detail/loading";
import ModerationDetailLoading from "@/app/(console)/moderation/detail/loading";
import SquadsLoading from "@/app/(console)/squads/loading";
import PlayerDetailLoading from "@/app/(console)/squads/detail/loading";
import StandingsLoading from "@/app/(console)/standings/loading";
import StandingDetailLoading from "@/app/(console)/standings/detail/loading";
import SyncLoading from "@/app/(console)/sync/loading";
import UsageLoading from "@/app/(console)/usage/loading";
import UsersLoading from "@/app/(console)/users/loading";
import UserDetailLoading from "@/app/(console)/users/detail/loading";
import CommunityNoticesLoading from "@/app/(console)/community/loading";

export function ClientPageLoading({ label = "관리자 데이터를 불러오고 있습니다." }: { label?: string }) {
  const pathname = usePathname();
  let skeleton: React.ReactNode;

  if (pathname.startsWith("/community")) skeleton = <CommunityNoticesLoading />;
  else if (pathname.startsWith("/users/detail")) skeleton = <UserDetailLoading />;
  else if (pathname.startsWith("/users")) skeleton = <UsersLoading />;
  else if (pathname.startsWith("/inquiries/detail")) skeleton = <InquiryDetailLoading />;
  else if (pathname.startsWith("/inquiries")) skeleton = <InquiriesLoading />;
  else if (pathname.startsWith("/moderation/detail")) skeleton = <ModerationDetailLoading />;
  else if (pathname.startsWith("/moderation")) skeleton = <InquiriesLoading />;
  else if (pathname.startsWith("/squads/detail")) skeleton = <PlayerDetailLoading />;
  else if (pathname.startsWith("/squads")) skeleton = <SquadsLoading />;
  else if (pathname.startsWith("/standings/detail")) skeleton = <StandingDetailLoading />;
  else if (pathname.startsWith("/standings")) skeleton = <StandingsLoading />;
  else if (pathname.startsWith("/sync")) skeleton = <SyncLoading />;
  else if (pathname.startsWith("/usage")) skeleton = <UsageLoading />;
  else if (pathname.startsWith("/audit/detail")) skeleton = <AuditDetailLoading />;
  else if (pathname.startsWith("/audit")) skeleton = <AuditLoading />;
  else if (pathname.startsWith("/data-management")) skeleton = <DataManagementLoading />;
  else skeleton = <DashboardLoading />;

  return (
    <>
      <span className="sr-only" aria-live="polite">{label}</span>
      {skeleton}
    </>
  );
}

export function ClientPageError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="grid min-h-[50dvh] place-items-center px-4">
      <div className="w-full max-w-lg rounded-xl border border-destructive/25 bg-destructive/[0.06] p-5 text-center">
        <AlertTriangle className="mx-auto size-5 text-destructive" aria-hidden="true" />
        <h1 className="mt-3 text-sm font-semibold">관리자 데이터를 불러오지 못했습니다</h1>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{message}</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={retry}>
          <RefreshCcw className="size-3.5" aria-hidden="true" />
          다시 시도
        </Button>
      </div>
    </div>
  );
}
