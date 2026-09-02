"use client";

import { useActionState } from "react";
import { signInAction, type LoginState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: LoginState = { error: null, email: "" };

export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(signInAction, initialState);

  return (
    <form action={action} className="mt-9 space-y-6">
      <input type="hidden" name="next" value={nextPath} />
      <div>
        <label htmlFor="email" className="mb-2.5 block text-sm font-medium text-foreground">관리자 이메일</label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.email}
          placeholder="operator@kickon.app"
          required
          autoFocus
          className="h-12 px-4"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-2.5 block text-sm font-medium text-foreground">비밀번호</label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 px-4"
        />
      </div>

      {state.error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-xs leading-5 text-destructive">
          {state.error}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "로그인 중" : "로그인"}
      </Button>
    </form>
  );
}
