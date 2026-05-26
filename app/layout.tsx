import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { Header } from "@/components/layout/header";
import { FooterCredit } from "@/components/branding/footer-credit";
import { WelcomeModal } from "@/components/branding/welcome-modal";

export const metadata: Metadata = {
  title: "법인카드 컴플라이언스 | Corporate Card Compliance",
  description:
    "자산운용사·금융사를 위한 법인카드 지출 통제 및 컴플라이언스 모니터링 시스템",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-screen bg-background text-foreground">
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <FooterCredit />
        </div>
        <WelcomeModal />
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "!rounded-xl !border !border-border/70 !shadow-md !bg-background !text-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}
