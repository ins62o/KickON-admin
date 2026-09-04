import Link from "next/link";

const footerLinks = [
  { href: "/privacy", label: "개인정보 처리방침" },
  { href: "/account-deletion", label: "계정 삭제 요청" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/75 bg-card/35" aria-label="서비스 안내">
      <div className="mx-auto flex w-full max-w-[1720px] flex-col items-center gap-3 px-4 py-5 text-center lg:px-6">
        <nav className="flex items-center justify-center gap-5 whitespace-nowrap text-xs" aria-label="법적 고지">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </Link>
            ))}
        </nav>
        <p className="text-[11px] text-muted-foreground">© 2026 KICKON All rights reserved.</p>
      </div>
    </footer>
  );
}
