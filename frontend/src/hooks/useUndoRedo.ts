import { useState, useCallback } from 'react';

export interface HistoryAction {
  id: string;
  type: 'move' | 'resize' | 'delete' | 'create' | 'update';
  description: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  timestamp: number;
}

export const useUndoRedo = () => {
  const [history, setHistory] = useState<HistoryAction[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Check if we can undo or redo
  const canUndo = currentIndex >= 0;
  const canRedo = currentIndex < history.length - 1;

  const addAction = useCallback((action: Omit<HistoryAction, 'id' | 'timestamp'>) => {
    const newAction: HistoryAction = {
      ...action,
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };

    setHistory(prev => {
      // If we're in the middle of history and add a new action, forget everything after this point
      const newHistory = prev.slice(0, currentIndex + 1);
      // Add our new action
      newHistory.push(newAction);
      // Only keep the last 50 actions so we don't use too much memory
      return newHistory.slice(-50);
    });

    setCurrentIndex(prev => Math.min(prev + 1, 49)); // Don't go over 50 actions
  }, [currentIndex]);

  const undo = useCallback(async () => {
    if (!canUndo) return;

    const action = history[currentIndex];
    try {
      await action.undo();
      setCurrentIndex(prev => prev - 1);
    } catch (error) {
      console.error('Failed to undo action:', error);
    }
  }, [canUndo, history, currentIndex]);

  const redo = useCallback(async () => {
    if (!canRedo) return;

    const action = history[currentIndex + 1];
    try {
      await action.redo();
      setCurrentIndex(prev => prev + 1);
    } catch (error) {
      console.error('Failed to redo action:', error);
    }
  }, [canRedo, history, currentIndex]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  return {
    addAction,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    historyLength: history.length,
    currentIndex
  };
};

