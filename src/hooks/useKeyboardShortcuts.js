import { useRef, useEffect } from 'react';

/**
 * Custom hook to track currently pressed keys.
 */
export const useKeyboardShortcuts = () => {
  const keysPressed = useRef({});

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check if focus is on a text input to prevent conflicts
      const activeElement = document.activeElement;
      const isTextInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true' ||
        activeElement.type === 'text' ||
        activeElement.type === 'search' ||
        activeElement.type === 'password' ||
        activeElement.type === 'email' ||
        activeElement.type === 'number'
      );
      
      // Only track keys if not in a text input
      if (!isTextInput) {
        keysPressed.current[e.key] = true;
        
        // Prevent default behavior for space and shift keys
        if (e.key === ' ' || e.key === 'Shift') {
          e.preventDefault();
        }
      }
    };
    
    const handleKeyUp = (e) => {
      // Always track key releases to prevent stuck keys
      keysPressed.current[e.key] = false;
      
      // Also clear any modifier key combinations that might be stuck
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        // Clear all keys when modifier keys are released to prevent stuck states
        Object.keys(keysPressed.current).forEach(key => {
          if (key !== e.key) {
            keysPressed.current[key] = false;
          }
        });
      }
    };

    const handleWindowBlur = () => {
      // Clear all keys when window loses focus to prevent stuck keys
      keysPressed.current = {};
    };

    console.log('[useKeyboardShortcuts] Adding key listeners');
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowBlur); // Also clear on focus to start fresh

    // Cleanup listeners on unmount
    return () => {
      console.log('[useKeyboardShortcuts] Removing key listeners');
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowBlur);
      keysPressed.current = {}; // Reset keys on unmount
    };
  }, []); // Empty dependency array ensures this runs only once on mount/unmount

  return keysPressed; // Return the ref so components can access the keys
}; 