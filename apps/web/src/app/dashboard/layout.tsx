import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard/players", label: "Ranking" },
  { href: "/dashboard/history", label: "Historial" },
];

export default function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col md:flex-row">
        <aside className="border-b border-slate-800 bg-slate-900/80 px-6 py-8 md:w-72 md:border-b-0 md:border-r">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-400">
              Dado Triple
            </p>
            <h1 className="text-3xl font-semibold text-white">Panel Administrativo</h1>
            <p className="text-sm leading-6 text-slate-400">
              Consulta ranking global y sesiones persistidas sin interferir con el observer
              realtime del juego.
            </p>
          </div>

          <nav className="mt-8 flex flex-col gap-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-cyan-500 hover:text-cyan-300"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/"
              className="rounded-2xl border border-slate-800 px-4 py-3 text-sm font-medium text-slate-400 transition hover:border-slate-600 hover:text-white"
            >
              Volver al observer
            </Link>
          </nav>
        </aside>

        <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
      </div>
    </div>
  );
}
