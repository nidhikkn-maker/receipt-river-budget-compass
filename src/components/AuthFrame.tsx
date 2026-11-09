import type { ReactNode } from "react";
import { ThapalLogo } from "./ThapalLogo";
import kkLogo from "@/assets/kk-monogram-gold.png.asset.json";

export function AuthFrame({ children, creator = false }: { children: ReactNode; creator?: boolean }) {
  return <div className="auth-experience bg-background text-foreground">
    <header className="auth-brand"><ThapalLogo className="h-10 w-auto" /></header>
    <main className="auth-stage">
      <div className="auth-introduction"><p className="text-sm text-muted-foreground">Your financial companion</p><h1>Life, in balance.</h1><p className="auth-story">Smart Add brings it together.<br />Intelligent Canvas makes it clear.</p><div className="auth-reassurance"><span>Personal · Family · Business</span><span>Your records stay with your account.</span></div></div>
      <section className="auth-form" aria-label="Account access">{children}</section>
    </main>
    <footer className="auth-footer"><span>Thapal · Your intelligent financial operating system</span>{creator && <span className="auth-creator"><img src={kkLogo.url} width={28} height={28} alt="KK creator logo" />A creation by KK</span>}</footer>
  </div>;
}