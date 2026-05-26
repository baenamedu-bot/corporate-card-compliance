/**
 * 보고서 화면 → A4 세로 PDF 출력.
 *
 * 전략:
 *  - html2canvas 로 DOM 을 그대로 캡쳐(텍스트가 픽셀로 래스터화되므로 한글 깨짐 0)
 *  - 캡쳐 전 document.fonts.ready 대기 + Pretendard 강제 적용으로 폰트 보장
 *  - 캡쳐 시 desktop 너비(1080px) 강제 → 모바일에서도 일관된 레이아웃 출력
 *  - 캡쳐 결과 이미지를 A4 페이지 단위로 잘라 다중 페이지 PDF 로 저장
 */

// jspdf, html2canvas 는 무거우므로 런타임에 동적 import (reports 페이지 초기 번들 절감)

/** ISO 날짜를 PDF 파일명 안전 문자열로 변환 (YYYY-MM-DD) */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 파일명 생성.
 *  - week  → "법인카드_사용보고서_2026-05-25주차.pdf" (주 시작 월요일 기준)
 *  - month → "법인카드_사용보고서_2026-05월.pdf"
 */
export function buildReportFileName(period: "week" | "month", periodStart: Date): string {
  if (period === "week") {
    return `법인카드_사용보고서_${ymd(periodStart)}주차.pdf`;
  }
  const y = periodStart.getFullYear();
  const m = String(periodStart.getMonth() + 1).padStart(2, "0");
  return `법인카드_사용보고서_${y}-${m}월.pdf`;
}

/** A4 (mm) */
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const MARGIN_MM = 10;
const CAPTURE_WIDTH_PX = 1080; // desktop 기준 강제 너비

export interface ExportPdfOptions {
  fileName: string;
  /** 캡쳐 대상 요소 */
  element: HTMLElement;
  /** PDF 메타 제목 */
  title?: string;
}

/**
 * 캡쳐 → A4 다중 페이지 PDF 저장.
 * 호출자는 캡쳐 중 UI 잠금/토스트 표시 책임.
 */
export async function exportElementToPDF(opts: ExportPdfOptions): Promise<void> {
  const { fileName, element, title } = opts;

  // 1) Pretendard 폰트가 완전히 로드될 때까지 대기 (브라우저 지원 시)
  if (typeof document !== "undefined" && (document as Document & { fonts?: FontFaceSet }).fonts) {
    try {
      await (document as Document & { fonts: FontFaceSet }).fonts.ready;
    } catch {
      // ignore
    }
  }

  // 2) 동적 import — 사용 시점에만 번들 로드
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // 3) 캡쳐 — html2canvas
  const canvas = await html2canvas(element, {
    scale: 2,                       // 고해상도 (Retina 수준)
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: CAPTURE_WIDTH_PX,  // 모바일에서도 desktop 레이아웃 강제
    logging: false,
    onclone: (clonedDoc) => {
      // 클론된 문서의 캡쳐 영역에 Pretendard 폰트 강제 + 너비 고정
      const root = clonedDoc.body;
      if (root) {
        root.style.fontFamily =
          '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
        root.style.background = "#ffffff";
      }
      // 캡쳐 대상도 동일 처리 + 너비 고정
      const target = clonedDoc.querySelector<HTMLElement>("[data-pdf-capture='true']");
      if (target) {
        target.style.width = `${CAPTURE_WIDTH_PX}px`;
        target.style.maxWidth = `${CAPTURE_WIDTH_PX}px`;
        target.style.padding = "32px";
        target.style.background = "#ffffff";
        target.style.fontFamily =
          '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
      }
      // recharts SVG 텍스트에도 폰트 강제 (인쇄 시 폴백 방지)
      clonedDoc.querySelectorAll<SVGTextElement>("svg text").forEach((t) => {
        t.style.fontFamily =
          '"Pretendard Variable", Pretendard, sans-serif';
      });
    },
  });

  // 4) jsPDF — A4 세로
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  if (title) {
    pdf.setProperties({ title, creator: "유앤미스튜디오 · 법인카드 컴플라이언스" });
  }

  const contentWidthMm = PAGE_W_MM - MARGIN_MM * 2;
  const contentHeightMm = PAGE_H_MM - MARGIN_MM * 2;
  const imgWidthMm = contentWidthMm;
  // 캔버스 비율에 맞춰 전체 이미지 mm 높이
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  const imgData = canvas.toDataURL("image/png");

  // 5) 페이지 단위로 이미지를 끊어서 출력
  //    - 단일 큰 이미지를 매 페이지 다른 음수 y offset 으로 그려서 위쪽이 잘리도록 함
  let heightLeft = imgHeightMm;
  let position = MARGIN_MM;

  pdf.addImage(imgData, "PNG", MARGIN_MM, position, imgWidthMm, imgHeightMm, undefined, "FAST");
  heightLeft -= contentHeightMm;

  while (heightLeft > 0) {
    position = MARGIN_MM - (imgHeightMm - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, "PNG", MARGIN_MM, position, imgWidthMm, imgHeightMm, undefined, "FAST");
    heightLeft -= contentHeightMm;
  }

  pdf.save(fileName);
}
