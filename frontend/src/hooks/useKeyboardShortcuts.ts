import { useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { setSelectedWeek, setTimezone } from '../features/calendar/slice';
import { openCreateModalWithParams } from '../features/ui/slice';
import { navigateWeek, getCurrentWeekStart } from '../lib/time';

interface KeyboardShortcutsProps {
  selectedWeek: string;
  timezone: string;
}

export const useKeyboardShortcuts = ({ selectedWeek, timezone }: KeyboardShortcutsProps) => {
  const dispatch = useDispatch();

  // Show keyboard shortcuts help
  const showKeyboardShortcutsHelp = useCallback(() => {
    const shortcuts = [
      { key: 'Ctrl + ←', description: 'Previous week' },
      { key: 'Ctrl + →', description: 'Next week' },
      { key: 'Ctrl + E', description: 'Create new event' },
    ];

    const helpText = shortcuts
      .map(shortcut => `${shortcut.key}: ${shortcut.description}`)
      .join('\n');

    alert(`Keyboard Shortcuts:\n\n${helpText}\n\nPress ? to close this help.`);
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts if user is typing in an input field
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target as HTMLElement)?.contentEditable === 'true'
    ) {
      return;
    }

    const { key, ctrlKey, metaKey, shiftKey, altKey } = event;
    const isModifierPressed = ctrlKey || metaKey;

    // Prevent browser shortcuts
    if (isModifierPressed && (key === '+' || key === '-' || key === '=' || key === '0')) {
      event.preventDefault();
      return;
    }

    // Navigation shortcuts
    switch (key) {
      case 'ArrowLeft':
        if (isModifierPressed) {
          event.preventDefault();
          const prevWeek = navigateWeek(selectedWeek, 'prev', timezone);
          dispatch(setSelectedWeek(prevWeek));
        }
        break;

      case 'ArrowRight':
        if (isModifierPressed) {
          event.preventDefault();
          const nextWeek = navigateWeek(selectedWeek, 'next', timezone);
          dispatch(setSelectedWeek(nextWeek));
        }
        break;

      // Create event shortcut (using Ctrl+E to avoid browser conflicts)
      case 'e':
      case 'E':
        if (isModifierPressed) {
          event.preventDefault();
          dispatch(openCreateModalWithParams());
        }
        break;

      // Undo/Redo shortcuts removed - not working properly

      // Help shortcut
      case '?':
        if (!isModifierPressed) {
          event.preventDefault();
          showKeyboardShortcutsHelp();
        }
        break;
    }
  }, [dispatch, selectedWeek, timezone, showKeyboardShortcutsHelp]);

  useEffect(() => {
    // Use capture phase to catch the event before browser handles it
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown]);
};
