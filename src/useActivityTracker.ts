import { useRef, useCallback } from 'react';
import type { BlockData } from './scratchPatterns';

export interface ActivityState {
  lastStudentMessageAt: number | null;
  lastBlockChangeAt: number | null;
  blockHistory: { snapshot: BlockData[]; at: number }[];
  messageHistory: { text: string; at: number }[];
  consecutiveShortMessages: number;
  blockEditVelocity: number[];
  confidenceSignal: string | null;
  confidenceSignaledAt: number | null;
}

export function useActivityTracker() {
  const state = useRef<ActivityState>({
    lastStudentMessageAt: null,
    lastBlockChangeAt: null,
    blockHistory: [],
    messageHistory: [],
    consecutiveShortMessages: 0,
    blockEditVelocity: [],
    confidenceSignal: null,
    confidenceSignaledAt: null,
  });

  const recordStudentMessage = useCallback((text: string) => {
    const now = Date.now();
    state.current.lastStudentMessageAt = now;
    state.current.messageHistory = [
      ...state.current.messageHistory.slice(-9),
      { text, at: now },
    ];
    const isShort = text.trim().split(/\s+/).length <= 3;
    state.current.consecutiveShortMessages = isShort
      ? state.current.consecutiveShortMessages + 1
      : 0;
  }, []);

  const recordBlockChange = useCallback((newSnapshot: BlockData[]) => {
    const now = Date.now();
    state.current.lastBlockChangeAt = now;
    state.current.blockHistory = [
      ...state.current.blockHistory.slice(-4),
      { snapshot: newSnapshot, at: now },
    ];
    state.current.blockEditVelocity = [
      ...state.current.blockEditVelocity.filter(t => now - t < 60_000),
      now,
    ];
  }, []);

  const recordConfidenceSignal = useCallback((signal: string) => {
    state.current.confidenceSignal = signal;
    state.current.confidenceSignaledAt = Date.now();
  }, []);

  const getStuckSeconds = useCallback((): number | null => {
    const ref = Math.max(
      state.current.lastStudentMessageAt ?? 0,
      state.current.lastBlockChangeAt ?? 0,
    );
    return ref ? Math.floor((Date.now() - ref) / 1000) : null;
  }, []);

  const getEditVelocityDropped = useCallback((): boolean => {
    const now = Date.now();
    const vel = state.current.blockEditVelocity;
    const recentEdits = vel.filter(t => now - t < 30_000).length;
    const olderEdits = vel.filter(t => now - t < 120_000 && now - t >= 30_000).length;
    return olderEdits >= 4 && recentEdits === 0;
  }, []);

  return {
    state,
    recordStudentMessage,
    recordBlockChange,
    recordConfidenceSignal,
    getStuckSeconds,
    getEditVelocityDropped,
  };
}
