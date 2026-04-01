import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { DiceValues, SocketEvents } from '@dado-triple/shared-types';
import { GameScreen } from './src/components/GameScreen';

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [dice, setDice] = useState<DiceValues | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [isReady, setIsReady] = useState<boolean>(true); // For testing simplicity, assume ready

  useEffect(() => {
    // For mobile, replace localhost with your machine's IP address if using a physical device
    const newSocket = io('http://localhost:4000'); 
    setSocket(newSocket);

    newSocket.on(SocketEvents.DICE_ROLLED, (data: { playerId: string; dice: DiceValues; score: number }) => {
      setDice(data.dice);
      setScore(data.score);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const rollDice = () => {
    if (socket && isReady) {
      socket.emit(SocketEvents.ROLL_DICE);
    }
  };

  return (
    <>
      <GameScreen 
        dice={dice}
        score={score}
        isReady={isReady}
        onRollDice={rollDice}
      />
      <StatusBar style="light" />
    </>
  );
}
