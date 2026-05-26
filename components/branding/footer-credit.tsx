import { BRAND } from "./brand-constants";

export function FooterCredit() {
  return (
    <footer className="mt-16 border-t border-border/60 bg-background/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-8 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
        <p>
          Powered by{" "}
          <span className="font-medium text-foreground">{BRAND.studio}</span>{" "}
          · 제작{" "}
          <span className="font-medium text-foreground">{BRAND.creator}</span>{" "}
          ·{" "}
          <a
            href={BRAND.website}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {BRAND.websiteLabel}
          </a>
        </p>
        <p className="text-[11px] text-muted-foreground/80">
          © {new Date().getFullYear()} {BRAND.studio}. 모든 콘텐츠 권리 보유.
        </p>
      </div>
    </footer>
  );
}
