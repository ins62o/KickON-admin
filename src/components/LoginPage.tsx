import { useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { EnvironmentSelect } from "./EnvironmentSelect";
import { Toast } from "./Toast";

export function LoginPage({ checking, pending, error, signIn }: {
  checking: boolean; pending: boolean; error: string;
  signIn: (email: string, password: string) => Promise<void>;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ email: "", password: "" });
  const [notice, setNotice] = useState({ id: 0, message: "" });
  const attempt = useRef(0);
  const message = notice.message || error;
  const disabled = pending || checking;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const id = ++attempt.current;
    const emailInput = event.currentTarget.elements.namedItem("email") as HTMLInputElement;
    const passwordInput = event.currentTarget.elements.namedItem("password") as HTMLInputElement;
    const nextErrors = {
      email: !emailInput.value.trim() ? "이메일을 입력해 주세요" : !emailInput.validity.valid ? "이메일 형식을 확인해 주세요" : "",
      password: password ? "" : "비밀번호를 입력해 주세요",
    };
    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      setNotice({ id, message: !emailInput.value.trim() && !password ? "이메일과 비밀번호를 입력해 주세요" : nextErrors.email || nextErrors.password });
      (nextErrors.email ? emailInput : passwordInput).focus();
      return;
    }
    setNotice({ id, message: "" });
    try { await signIn(emailInput.value.trim(), password); }
    finally { setPassword(""); }
  };

  return <div className="login-screen">
    <a href="#login-main" className="skip-link">로그인으로 바로가기</a>
    <header className="site-header"><div className="header-inner"><ThemeToggle /><EnvironmentSelect disabled={disabled}/></div></header>
    <main id="login-main" tabIndex={-1} className="hero login-page">
      <section className="login-content" aria-labelledby="login-title">
        <h1 id="login-title">KICKON ADMIN</h1>
        <form className="login-form" onSubmit={submit} aria-busy={disabled} noValidate>
          <label htmlFor="login-email">이메일</label>
          <div className="login-input"><Mail size={18} strokeWidth={1.5} aria-hidden="true" /><input id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="관리자 이메일을 입력하세요" required maxLength={254} disabled={disabled} aria-invalid={Boolean(fieldErrors.email)} onChange={event => {
            if (!fieldErrors.email) return;
            const input = event.currentTarget;
            const message = !input.value.trim() ? "이메일을 입력해 주세요" : !input.validity.valid ? "이메일 형식을 확인해 주세요" : "";
            setFieldErrors(current => ({ ...current, email: message }));
          }} /></div>
          <label htmlFor="login-password">비밀번호</label>
          <div className="login-input"><LockKeyhole size={18} strokeWidth={1.5} aria-hidden="true" /><input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="비밀번호를 입력하세요" value={password} onChange={event => {
            const value = event.target.value;
            setPassword(value);
            if (fieldErrors.password && value) setFieldErrors(current => ({ ...current, password: "" }));
          }} required disabled={disabled} aria-invalid={Boolean(fieldErrors.password)} /><button className="password-toggle" type="button" aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} strokeWidth={1.5} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.5} aria-hidden="true" />}</button></div>
          <button className="primary-button login-submit" type="submit" disabled={disabled} aria-busy={disabled} aria-label={checking ? "로그인 상태 확인 중" : pending ? "로그인 중" : "로그인"}>{disabled ? <LoaderCircle size={18} className="login-spinner" aria-hidden="true" /> : "로그인"}</button>
          <p className="login-permission-note"><LockKeyhole size={12} aria-hidden="true" />승인된 관리자 계정만 접속할 수 있어요</p>
        </form>
        <footer className="login-footer"><span>© {new Date().getFullYear()} KICKON</span></footer>
      </section>
    </main>
    {message ? <Toast key={`${notice.id}:${message}`} message={message} /> : null}
  </div>;
}
