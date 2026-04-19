import { prisma } from "@dado-triple/db";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null): string {
  if (!value) {
    return "Pendiente";
  }

  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function DashboardHistoryPage() {
  const sessions = await prisma.gameSessionModel.findMany({
    orderBy: { startTime: "desc" },
  });

  const movements = sessions.length
    ? await prisma.movementModel.findMany({
        where: {
          sessionId: {
            in: sessions.map((session) => session.id),
          },
        },
        orderBy: { timestamp: "asc" },
      })
    : [];

  const movementsBySession = movements.reduce<Map<string, typeof movements>>((acc, movement) => {
    const bucket = acc.get(movement.sessionId) ?? [];
    bucket.push(movement);
    acc.set(movement.sessionId, bucket);
    return acc;
  }, new Map());

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-400">Historial</p>
        <h2 className="text-3xl font-semibold text-white">Sesiones y movimientos</h2>
        <p className="text-sm text-slate-400">
          Historial persistido de partidas con sus lanzamientos registrados.
        </p>
      </header>

      <div className="space-y-4">
        {sessions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-400">
            No hay sesiones almacenadas todavía.
          </div>
        ) : (
          sessions.map((session) => {
            const sessionMovements = movementsBySession.get(session.id) ?? [];

            return (
              <details
                key={session.id}
                className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900"
              >
                <summary className="cursor-pointer list-none px-6 py-5 transition hover:bg-slate-800/70">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-cyan-400">
                        Sesión
                      </p>
                      <h3 className="font-mono text-sm text-slate-300">{session.id}</h3>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-3 md:gap-6">
                      <span>
                        <strong className="mr-2 text-white">Estado:</strong>
                        {session.status}
                      </span>
                      <span>
                        <strong className="mr-2 text-white">Inicio:</strong>
                        {formatDate(session.startTime)}
                      </span>
                      <span>
                        <strong className="mr-2 text-white">Fin:</strong>
                        {formatDate(session.endTime)}
                      </span>
                    </div>
                  </div>
                </summary>

                <div className="border-t border-slate-800 px-6 py-5">
                  {sessionMovements.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      Esta sesión no tiene movimientos persistidos.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-slate-800">
                      <table className="min-w-full divide-y divide-slate-800">
                        <thead className="bg-slate-950/70 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
                          <tr>
                            <th className="px-4 py-3">Jugador</th>
                            <th className="px-4 py-3">Dados</th>
                            <th className="px-4 py-3">Combo</th>
                            <th className="px-4 py-3">Score</th>
                            <th className="px-4 py-3">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-sm text-slate-200">
                          {sessionMovements.map((movement) => (
                            <tr key={movement.id} className="hover:bg-slate-800/50">
                              <td className="px-4 py-3 font-mono text-xs text-slate-400">
                                {movement.playerId}
                              </td>
                              <td className="px-4 py-3">{movement.diceValues.join(" - ")}</td>
                              <td className="px-4 py-3">{movement.comboType}</td>
                              <td className="px-4 py-3 text-cyan-300">
                                {movement.scoreEarned}
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {formatDate(movement.timestamp)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            );
          })
        )}
      </div>
    </section>
  );
}
