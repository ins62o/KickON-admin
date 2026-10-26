import { LegalHeader } from "@/components/legal/legal-page";
import { SiteFooter } from "@/components/layout/site-footer";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0"
      >
        본문으로 바로가기
      </a>
      <LegalHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
