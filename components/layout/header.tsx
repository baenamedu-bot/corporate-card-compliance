"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck, LogOut, User as UserIcon } from "lucide-react";
import { CreatorInfoModal } from "@/components/branding/creator-info-modal";
import { ApiKeyModal } from "@/components/settings/api-key-modal";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PUBLIC_PATHS = ["/login", "/signup", "/onboarding"];

function navForRole(role: UserRole | null) {
  if (!role) return [];
  const base = [{ href: "/my-card", label: "본인 내역" }];
  if (role === "admin" || role === "super_admin") {
    return [
      { href: "/upload", label: "엑셀 업로드" },
      ...base,
      { href: "/admin", label: "관리자" },
      { href: "/admin/cards", label: "카드 관리" },
      { href: "/admin/invites", label: "직원 초대" },
      { href: "/reports", label: "보고서" },
    ];
  }
  if (role === "compliance_officer") {
    return [
      ...base,
      { href: "/admin", label: "컴플라이언스" },
      { href: "/reports", label: "보고서" },
    ];
  }
  // employee
  return base;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const sb = getSupabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
          setProfile(null);
          setEmail(null);
          return;
        }
        setEmail(user.email || null);
        const { data } = await sb.rpc("get_my_profile");
        setProfile(data as Profile | null);
      } catch {
        // 환경변수 미설정 등 — 무시
      } finally {
        setHydrated(true);
      }
    };
    load();
  }, [pathname]);

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
    || pathname.startsWith("/auth/");
  const showNav = !isPublic && !!profile?.organization_id;
  const nav = showNav ? navForRole(profile?.role ?? null) : [];

  const onSignOut = async () => {
    try {
      const sb = getSupabaseBrowser();
      await sb.auth.signOut();
      toast.success("로그아웃되었습니다.");
      window.location.href = "/login";
    } catch (e) {
      toast.error("로그아웃 실패");
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link href={profile?.organization_id ? "/" : "/login"} className="group inline-flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">
              법인카드 컴플라이언스
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Corporate Card Compliance
            </span>
          </div>
        </Link>

        {showNav && (
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => {
              const active = pathname === n.href || pathname.startsWith(n.href + "/");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    active && "bg-muted text-foreground",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-1">
          {hydrated && email && (
            <div className="mr-2 hidden items-center gap-2 sm:flex">
              <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px]">
                <UserIcon className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{profile?.full_name || email}</span>
                {profile?.role && (
                  <span className="text-muted-foreground">· {roleLabel(profile.role)}</span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={onSignOut} className="h-8 px-2 text-xs">
                <LogOut className="h-3.5 w-3.5" />
                로그아웃
              </Button>
            </div>
          )}
          <CreatorInfoModal />
          <ApiKeyModal />
        </div>
      </div>

      {showNav && nav.length > 0 && (
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-3 py-1 md:hidden">
          {nav.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-muted text-foreground",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

function roleLabel(r: UserRole): string {
  return {
    super_admin: "super",
    admin: "관리자",
    compliance_officer: "준법감시",
    employee: "직원",
  }[r];
}
