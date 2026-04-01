'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { DiceValues, SocketEvents } from '@dado-triple/shared-types';

export default function GamePage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [dice, setDice] = useState<DiceValues | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [lastPlayer, setLastPlayer] = useState<string | null>(null);

  useEffect(() => {
    const newSocket = io('http://localhost:4000');
    setSocket(newSocket);

    newSocket.on(SocketEvents.DICE_ROLLED, (data: { playerId: string; dice: DiceValues; score: number }) => {
      setDice(data.dice);
      setScore(data.score);
      setLastPlayer(data.playerId);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const rollDice = () => {
    if (socket) {
      socket.emit(SocketEvents.ROLL_DICE);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-dark-900 text-white">
      <h1 className="text-6xl font-bold mb-8 text-primary">Dado Triple</h1>

      <div className="bg-dark-800 p-8 rounded-2xl shadow-2xl border border-dark-700 flex flex-col items-center">
        <div className="flex gap-4 mb-8">
          {dice ? dice.map((value, i) => (
            <div key={i} className="w-20 h-20 bg-white text-dark-900 rounded-xl flex items-center justify-center text-4xl font-bold shadow-lg">
              {value}
            </div>
          )) : (
            [1, 2, 3].map((_, i) => (
              <div key={i} className="w-20 h-20 bg-dark-700 rounded-xl animate-pulse"></div>
            ))
          )}
        </div>

        {score !== null && (
          <div className="text-center mb-8">
            <p className="text-2xl font-semibold text-secondary">Puntos: {score}</p>
            <p className="text-sm text-gray-400 mt-2">Lanzado por: {lastPlayer === socket?.id ? 'Tí' : (lastPlayer || '...')}</p>
          </div>
        )}

        <button
          onClick={rollDice}
          className="px-8 py-4 bg-primary hover:bg-blue-600 transition-colors rounded-full text-xl font-bold uppercase tracking-wider"
        >
          Lanzar Dados
        </button>
      </div>

      <div className="mt-12 text-gray-500 max-w-md text-center">
        <p>Reglas: Trío (+100 pts), Par (+50 pts), Suma simple en otros casos.</p>
      </div>
    </main>
  );
}
