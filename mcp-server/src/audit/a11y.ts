import type { Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";

export interface A11yIssue {
  id: string;
  impact: string | null;
  description: string;
  nodesCount: number;
}

export async function runA11yAudit(page: Page): Promise<A11yIssue[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    description: v.description,
    nodesCount: v.nodes.length,
  }));
}
