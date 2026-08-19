import type { Page } from "playwright";

export interface ElementBox {
  selector: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  color: string;
  backgroundColor: string;
  contrastRatio: number;
  offscreen: boolean;
}

export interface VisualIssue {
  selector: string;
  kind: "overflow" | "low-contrast" | "offscreen";
  detail: string;
}

export function evaluateVisualIssues(boxes: ElementBox[]): VisualIssue[] {
  const issues: VisualIssue[] = [];
  for (const box of boxes) {
    if (box.scrollWidth > box.clientWidth + 2) {
      issues.push({
        selector: box.selector,
        kind: "overflow",
        detail: `contenuto largo ${box.scrollWidth}px in un contenitore di ${box.clientWidth}px`,
      });
    }
    if (box.contrastRatio < 4.5) {
      issues.push({
        selector: box.selector,
        kind: "low-contrast",
        detail: `contrasto ${box.contrastRatio.toFixed(2)}:1 (soglia WCAG AA: 4.5:1)`,
      });
    }
    if (box.offscreen) {
      issues.push({ selector: box.selector, kind: "offscreen", detail: "elemento posizionato fuori dal viewport" });
    }
  }
  return issues;
}

export async function collectVisualIssues(page: Page): Promise<VisualIssue[]> {
  const boxes: ElementBox[] = await page.evaluate(() => {
    function luminance(r: number, g: number, b: number): number {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }
    function parseRgb(color: string): [number, number, number, number] {
      const m = color.match(/\d+/g);
      if (!m) return [255, 255, 255, 1];
      return [Number(m[0]), Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) / 255 : 1];
    }
    function getEffectiveBackgroundColor(el: Element): [number, number, number] {
      let current: Element | null = el;
      while (current) {
        const style = getComputedStyle(current);
        const [r, g, b, a] = parseRgb(style.backgroundColor);
        if (a > 0) {
          return [r, g, b];
        }
        current = current.parentElement;
      }
      return [255, 255, 255];
    }

    const elements = Array.from(document.querySelectorAll("body *")).slice(0, 300);
    return elements.map((el, i) => {
      el.setAttribute("data-eyes-visual-id", String(i));
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const [r1, g1, b1] = parseRgb(style.color);
      const [r2, g2, b2] = getEffectiveBackgroundColor(el);
      const l1 = luminance(r1, g1, b1);
      const l2 = luminance(r2, g2, b2);
      const contrastRatio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      return {
        selector: `[data-eyes-visual-id="${i}"]`,
        scrollWidth: (el as HTMLElement).scrollWidth,
        clientWidth: (el as HTMLElement).clientWidth,
        scrollHeight: (el as HTMLElement).scrollHeight,
        clientHeight: (el as HTMLElement).clientHeight,
        color: style.color,
        backgroundColor: style.backgroundColor,
        contrastRatio,
        offscreen:
          rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight,
      };
    });
  });
  return evaluateVisualIssues(boxes);
}
