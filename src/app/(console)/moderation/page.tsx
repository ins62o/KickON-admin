import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "신고 내역" };

type LegacyModerationSearchParams = {
  q?: string;
  status?: string;
  target?: string;
};

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<LegacyModerationSearchParams>;
}) {
  const query = await searchParams;
  const nextQuery = new URLSearchParams({ tab: "reports" });

  if (query.q) nextQuery.set("q", query.q);
  if (query.status) nextQuery.set("status", query.status);
  if (query.target) nextQuery.set("target", query.target);

  redirect(`/inquiries?${nextQuery.toString()}`);
}
