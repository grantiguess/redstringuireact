import { useRef, useEffect } from 'react';

/**
 * Custom hook to track currently pressed keys.
 */
export const useKeyboardShortcuts = () => {
  const keysPressed = useRef({});

  useEffect(() => {
    const handleKeyDown = (e) => {
      keysPressed.current[e.key] = true;
    };
    const handleKeyUp = (e) => {
      keysPressed.current[e.key] = false;
    };

    console.log('[useKeyboardShortcuts] Adding key listeners');
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Cleanup listeners on unmount
    return () => {
      console.log('[useKeyboardShortcuts] Removing key listeners');
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      keysPressed.current = {}; // Reset keys on unmount
    };
  }, []); // Empty dependency array ensures this runs only once on mount/unmount

  return keysPressed; // Return the ref so components can access the keys
}; 