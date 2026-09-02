import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const tmoneyRoundWind = localFont({
  src: [
    {
      path: "./fonts/TmoneyRoundWind-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/TmoneyRoundWind-ExtraBold.otf",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-tmoney-roundwind",
  display: "swap",
  fallback: ["system-ui", "Arial"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "킥온 데이터 센터", template: "%s | 킥온 데이터 센터" },
  description: "킥온 축구 데이터와 서비스 상태를 관리하는 운영 콘솔",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = (await cookies()).get("kickon-theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="ko" className={`${tmoneyRoundWind.variable} ${geistMono.variable} ${theme === "dark" ? "dark" : ""}`} suppressHydrationWarning>
      <body><TooltipProvider delayDuration={250}>{children}</TooltipProvider></body>
    </html>
  );
}
