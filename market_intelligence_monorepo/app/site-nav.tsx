"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExitAgentButton } from "./exit-agent-button";

const LINKS = [
  { href: "/oportunidades", label: "Oportunidades" },
  { href: "/", label: "Catálogo" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="shrink-0 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-4 py-3 sm:px-6">
        <p className="text-sm font-medium text-zinc-900">Inteligência de mercado</p>
        <div className="flex items-center gap-3">
        <ExitAgentButton />
        <nav className="flex gap-1 text-sm">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  "rounded-md px-3 py-1.5 " +
                  (active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900")
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        </div>
      </div>
    </header>
  );
}
