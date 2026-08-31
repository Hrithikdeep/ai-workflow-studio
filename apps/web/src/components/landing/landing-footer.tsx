import { LandingLogo } from "./landing-header";

const FOOTER_LINKS = [
  { label: "Docs", href: "#" },
  { label: "GitHub", href: "#" },
  { label: "Architecture", href: "#architecture" },
  { label: "Contact", href: "#" },
  { label: "Privacy", href: "#" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-10 md:flex-row md:justify-between">
        <div className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-slate-900">
          <LandingLogo />
          AI Workflow Studio
        </div>

        <nav
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
          aria-label="Footer"
        >
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm text-slate-500 transition-colors hover:text-slate-900"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <p className="text-xs text-slate-400">© 2026 AI Workflow Studio</p>
      </div>
    </footer>
  );
}
