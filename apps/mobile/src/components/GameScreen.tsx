import React from 'react';
import { Text, View, TouchableOpacity, SafeAreaView } from 'react-native';
import { styled } from 'nativewind';
import { DiceValues } from '@dado-triple/shared-types';

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledTouchableOpacity = styled(TouchableOpacity);
const StyledSafeAreaView = styled(SafeAreaView);

interface GameScreenProps {
  dice: DiceValues | null;
  score: number | null;
  isReady: boolean;
  onRollDice: () => void;
}

export const GameScreen: React.FC<GameScreenProps> = ({ 
  dice, 
  score, 
  isReady, 
  onRollDice 
}) => {
  return (
    <StyledView className="flex-1 bg-slate-900 items-center justify-center">
      <StyledSafeAreaView className="w-full flex items-center">
        <StyledText className="text-4xl font-bold text-blue-500 mb-10">Dado Triple Mobile</StyledText>
        
        <StyledView className="bg-slate-800 p-8 rounded-3xl border border-slate-700 items-center shadow-xl w-10/12">
          <StyledView className="flex-row gap-4 mb-10">
            {dice ? dice.map((value, i) => (
              <StyledView key={i} className="w-16 h-16 bg-white rounded-2xl items-center justify-center shadow-lg">
                <StyledText className="text-slate-900 text-3xl font-black">{value}</StyledText>
              </StyledView>
            )) : (
              [1, 2, 3].map((_, i) => (
                <StyledView key={i} className="w-16 h-16 bg-slate-700 rounded-2xl opacity-50" />
              ))
            )}
          </StyledView>

          {score !== null && (
            <StyledView className="items-center mb-10">
              <StyledText className="text-emerald-400 text-2xl font-bold">Puntos: {score}</StyledText>
            </StyledView>
          )}

          <StyledTouchableOpacity
            onPress={onRollDice}
            disabled={!isReady}
            className={`px-10 py-5 rounded-full shadow-lg w-full items-center ${isReady ? 'bg-blue-600 active:bg-blue-700' : 'bg-slate-600 opacity-50'}`}
          >
            <StyledText className="text-white text-xl font-black uppercase tracking-widest">
              Lanzar Dados
            </StyledText>
          </StyledTouchableOpacity>
        </StyledView>

        {!isReady && (
          <StyledText className="mt-4 text-amber-400 font-bold">
            Espera tu turno...
          </StyledText>
        )}

        <StyledText className="mt-10 text-slate-500 text-center px-4">
          Reglas: Trío (+100), Par (+50), Suma simple.
        </StyledText>
      </StyledSafeAreaView>
    </StyledView>
  );
};
