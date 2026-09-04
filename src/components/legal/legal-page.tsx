import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

export function LegalHeader() {
  return (
    <header className="border-b border-border/75 bg-background/95">
      <div className="mx-auto flex h-[68px] w-full max-w-[1720px] items-center px-4 lg:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="KICKON 홈"
        >
          <span className="flex h-9 w-11 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#08111e]">
            <Image src="/branding/app-logo.png" alt="" width={40} height={30} priority className="h-8 w-10 object-contain" />
          </span>
          <span className="text-base font-semibold tracking-tight">KICKON</span>
        </Link>
      </div>
    </header>
  );
}

export function LegalPage({
  title,
  description,
  effectiveDate,
  sections,
  aside,
}: {
  title: string;
  description: string;
  effectiveDate: string;
  sections: LegalSection[];
  aside?: ReactNode;
}) {
  return (
    <main id="main-content" className="flex-1 bg-background">
      <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
        <div>
          <p className="text-sm font-semibold text-primary">KICKON 이용자 안내</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{title}</h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground md:whitespace-nowrap md:text-[13px] lg:text-sm xl:text-base">{description}</p>
          <p className="mt-5 text-xs font-medium text-muted-foreground">시행일 {effectiveDate}</p>
        </div>

        {aside ? <div className="mt-8">{aside}</div> : null}

        <div className="mt-12 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
          <nav className="lg:sticky lg:top-8 lg:self-start" aria-label={`${title} 목차`}>
            <p className="text-xs font-semibold text-foreground">목차</p>
            <ol className="mt-3 space-y-1.5">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded-md px-2 py-1.5 text-xs leading-5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {index + 1}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="min-w-0 space-y-12">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-8" aria-labelledby={`${section.id}-title`}>
                <h2 id={`${section.id}-title`} className="text-xl font-extrabold tracking-tight text-foreground">
                  {index + 1}. {section.title}
                </h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-foreground/85 [&_a]:font-semibold [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_li]:pl-1 [&_strong]:font-extrabold [&_strong]:text-foreground [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
                  {section.content}
                </div>
              </section>
            ))}
          </article>
        </div>
      </div>
    </main>
  );
}

export function LegalNotice({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl rounded-xl border border-primary/25 bg-accent/45 px-5 py-4 text-sm leading-6 text-accent-foreground">
      {children}
    </div>
  );
}

export function LegalTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card/55">
      <table className="w-full min-w-[680px] border-collapse text-left text-xs leading-5">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/65 text-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col" className="whitespace-nowrap border-b border-border px-4 py-3 font-extrabold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="align-top">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/65 last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3.5 text-foreground/80 first:whitespace-nowrap first:font-semibold first:text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
