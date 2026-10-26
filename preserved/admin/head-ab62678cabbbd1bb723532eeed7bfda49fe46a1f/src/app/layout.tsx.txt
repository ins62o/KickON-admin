import type { Metadata } from "next";
import localFont from "next/font/local";
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
const themeScript = `(function(){try{var t=localStorage.getItem("kickon-theme");document.documentElement.classList.toggle("dark",t!=="light");document.documentElement.style.colorScheme=t==="light"?"light":"dark"}catch(e){}})()`;

export const metadata: Metadata = {
  title: { default: "킥온 데이터 센터", template: "%s | 킥온 데이터 센터" },
  description: "킥온 축구 데이터와 서비스 상태를 관리하는 운영 콘솔",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${tmoneyRoundWind.variable} ${tmoneyRoundWind.className} dark`} suppressHydrationWarning>
      <head>
        <script id="kickon-theme" dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body><TooltipProvider delayDuration={250}>{children}</TooltipProvider></body>
    </html>
  );
}
