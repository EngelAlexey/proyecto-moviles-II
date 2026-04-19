import React from 'react';
import { SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import { styled } from 'nativewind';
import type { GameState, PairsAssignedPayload } from '@dado-triple/shared-types';

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledTouchableOpacity = styled(TouchableOpacity);
const StyledSafeAreaView = styled(SafeAreaView);

interface GameScreenProps {
  gameState: GameState | null;
  localPlayerId: string | null;
  latestPairing: PairsAssignedPayload | null;
  onRollDice: () => void;
}

export const GameScreen: React.FC<GameScreenProps> = ({
  gameState,
  localPlayerId,
  latestPairing,
  onRollDice,
}) => {
  const players = gameState?.players ?? [];
  const localPlayer = players.find((player) => player.id === localPlayerId) ?? null;
  const activePairs =
    gameState?.pairs.length && gameState.pairs.length > 0
      ? gameState.pairs
      : latestPairing?.pairs ?? [];
  const currentPair =
    localPlayerId
      ? activePairs.find(
          (pair) => pair.player1Id === localPlayerId || pair.player2Id === localPlayerId,
        ) ?? null
      : null;
  const opponentId = currentPair
    ? currentPair.player1Id === localPlayerId
      ? currentPair.player2Id
      : currentPair.player1Id
    : null;
  const opponentName = opponentId
    ? players.find((player) => player.id === opponentId)?.name ?? opponentId
    : null;
  const byePlayerId = gameState?.byePlayerId ?? latestPairing?.bye ?? null;
  const isBye = Boolean(localPlayerId && byePlayerId === localPlayerId);
  const hasDice = Boolean(gameState?.currentDice.some((value) => value > 0));
  const dice = hasDice ? gameState?.currentDice ?? null : null;
  const score = localPlayer?.score ?? null;
  const currentRound = gameState?.round ?? latestPairing?.round ?? 0;
  const canRoll = Boolean(
    localPlayer &&
      localPlayer.isReady &&
      gameState?.status === 'playing' &&
      currentPair &&
      !isBye,
  );

  let helperText = 'Únete a una sala desde la consola superior para comenzar.';
  if (localPlayerId && !localPlayer) {
    helperText = 'Esperando sincronización del jugador en el estado de la sala.';
  } else if (localPlayer && !localPlayer.isReady) {
    helperText = 'Marca "Estoy listo" para entrar al ciclo de partida.';
  } else if (gameState?.status === 'playing' && !currentPair && !isBye) {
    helperText = 'Esperando emparejamiento de ronda.';
  } else if (gameState?.status === 'playing' && currentPair) {
    helperText = 'Emparejamiento listo. Puedes lanzar cuando corresponda.';
  } else if (gameState?.status && gameState.status !== 'playing') {
    helperText = 'Esperando a que todos los jugadores marquen ready.';
  }

  return (
    <StyledSafeAreaView className="w-full">
      <StyledView className="rounded-[28px] border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <StyledView className="mb-6 flex-row items-start justify-between">
          <StyledView>
            <StyledText className="text-3xl font-bold text-blue-400">Mesa de juego</StyledText>
            <StyledText className="mt-1 text-xs uppercase tracking-[2px] text-slate-400">
              Estado {gameState?.status ?? 'sin sala'} | Ronda {currentRound}
            </StyledText>
          </StyledView>
          <StyledView className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2">
            <StyledText className="text-sm font-semibold text-emerald-400">
              Puntos: {score ?? 0}
            </StyledText>
          </StyledView>
        </StyledView>

        {opponentName && !isBye && (
          <StyledView className="mb-5 rounded-2xl border border-cyan-900 bg-cyan-950/60 px-4 py-3">
            <StyledText className="text-sm font-semibold text-cyan-300">
              Oponente en ronda {currentRound}: {opponentName}
            </StyledText>
          </StyledView>
        )}

        {isBye ? (
          <StyledView className="items-center rounded-3xl border border-amber-700 bg-amber-950/50 px-6 py-10">
            <StyledText className="text-2xl font-bold text-amber-300">Descanso</StyledText>
            <StyledText className="mt-3 text-center text-base text-amber-100">
              Descanso. Esperando siguiente ronda.
            </StyledText>
            <StyledText className="mt-4 text-center text-sm text-amber-200">
              Mantienes {score ?? 0} puntos mientras el resto termina su enfrentamiento.
            </StyledText>
          </StyledView>
        ) : (
          <StyledView className="items-center rounded-3xl border border-slate-700 bg-slate-800 p-6">
            <StyledView className="mb-8 flex-row gap-4">
              {dice ? (
                dice.map((value, index) => (
                  <StyledView
                    key={index}
                    className="h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg"
                  >
                    <StyledText className="text-3xl font-black text-slate-900">
                      {value}
                    </StyledText>
                  </StyledView>
                ))
              ) : (
                [1, 2, 3].map((placeholder) => (
                  <StyledView
                    key={placeholder}
                    className="h-16 w-16 rounded-2xl bg-slate-700 opacity-50"
                  />
                ))
              )}
            </StyledView>

            <StyledTouchableOpacity
              onPress={onRollDice}
              disabled={!canRoll}
              className={`w-full items-center rounded-full px-10 py-5 shadow-lg ${
                canRoll ? 'bg-blue-600 active:bg-blue-700' : 'bg-slate-600 opacity-50'
              }`}
            >
              <StyledText className="text-xl font-black uppercase tracking-widest text-white">
                Lanzar Dados
              </StyledText>
            </StyledTouchableOpacity>
          </StyledView>
        )}

        <StyledText className="mt-5 text-center font-semibold text-amber-300">
          {helperText}
        </StyledText>

        <StyledText className="mt-6 text-center text-slate-500">
          Reglas: Trío (+100), Par (+50), Suma simple.
        </StyledText>
      </StyledView>
    </StyledSafeAreaView>
  );
};
