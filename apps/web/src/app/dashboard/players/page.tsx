import { prisma } from "@dado-triple/db";

export const dynamic = "force-dynamic";

export default async function DashboardPlayersPage() {
  const players = await prisma.playerModel.findMany({
    orderBy: { totalScore: "desc" },
  });

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-400">Ranking</p>
        <h2 className="text-3xl font-semibold text-white">Jugadores por puntaje total</h2>
        <p className="text-sm text-slate-400">
          Vista administrativa de jugadores persistidos en MongoDB.
        </p>
      </header>

      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
        <table className="min-w-full divide-y divide-slate-800">
          <thead className="bg-slate-950/70 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
            <tr>
              <th className="px-4 py-4">ID</th>
              <th className="px-4 py-4">Jugador</th>
              <th className="px-4 py-4">Total Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-sm text-slate-200">
            {players.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  No hay jugadores persistidos todavía.
                </td>
              </tr>
            ) : (
              players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-4 font-mono text-xs text-slate-400">{player.id}</td>
                  <td className="px-4 py-4 font-medium text-white">{player.username}</td>
                  <td className="px-4 py-4 text-cyan-300">{player.totalScore}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
