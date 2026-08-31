import type { ReactNode } from "react";

/**
 * Layout for the public marketing route group. Renders inside the root
 * layout (html/body/providers); adds no chrome yet — sections come later.
 */
export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
