import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-center"><div><p className="font-mono text-xs text-muted-foreground">404</p><h1 className="mt-2 text-xl font-semibold">페이지를 찾을 수 없습니다</h1><p className="mt-2 text-sm text-muted-foreground">주소가 올바른지 확인해 주세요.</p><Button asChild className="mt-5"><Link href="/">대시보드로 이동</Link></Button></div></div>;
}
