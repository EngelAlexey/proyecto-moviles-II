'use client';

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../constants/config';

export interface AuthContextValue {
  playerName: string | null;
  isLoading: boolean;
  setPlayerName: (name: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = React.createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [playerName, setPlayerNameState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load persisted player name on mount
  useEffect(() => {
    const loadPlayerName = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.PLAYER_NAME);
        setPlayerNameState(stored);
      } catch (error) {
        console.error('Failed to load player name:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPlayerName();
  }, []);

  const setPlayerName = useCallback(async (name: string) => {
    try {
      setPlayerNameState(name);
      await AsyncStorage.setItem(STORAGE_KEYS.PLAYER_NAME, name);
    } catch (error) {
      console.error('Failed to save player name:', error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setPlayerNameState(null);
      await AsyncStorage.removeItem(STORAGE_KEYS.PLAYER_NAME);
    } catch (error) {
      console.error('Failed to logout:', error);
      throw error;
    }
  }, []);

  const value: AuthContextValue = {
    playerName,
    isLoading,
    setPlayerName,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
}
