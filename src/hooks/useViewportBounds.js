import { useEffect, useMemo, useState } from 'react';
import { HEADER_HEIGHT } from '../constants';

/**
 * Computes the central usable viewport bounds by subtracting left/right panel widths
 * and the bottom TypeList bar from window dimensions.
 * Accounts for collapsed panels by using 0 width when panels are not expanded.
 *
 * Listens to window resize and custom panel events:
 *  - panelWidthChanging, panelWidthChanged
 * Also reads persisted widths from localStorage on mount for initial render.
 */
export const useViewportBounds = (leftExpanded = true, rightExpanded = true) => {
  const readPersistedWidth = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
  };

  const [leftWidth, setLeftWidth] = useState(() => readPersistedWidth('panelWidth_left', 280));
  const [rightWidth, setRightWidth] = useState(() => readPersistedWidth('panelWidth_right', 280));
  const [windowSize, setWindowSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  // The TypeList bar height equals HEADER_HEIGHT when visible. We conservatively reserve it.
  // If needed, this could subscribe to a store for actual visibility.
  const [typeListHeight] = useState(HEADER_HEIGHT);

  useEffect(() => {
    const onResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onChanging = (e) => {
      const { side, width } = e.detail || {};
      if (side === 'left' && typeof width === 'number') setLeftWidth(width);
      if (side === 'right' && typeof width === 'number') setRightWidth(width);
    };
    const onChanged = (e) => {
      const { side, width } = e.detail || {};
      if (side === 'left' && typeof width === 'number') setLeftWidth(width);
      if (side === 'right' && typeof width === 'number') setRightWidth(width);
    };
    window.addEventListener('panelWidthChanging', onChanging);
    window.addEventListener('panelWidthChanged', onChanged);
    return () => {
      window.removeEventListener('panelWidthChanging', onChanging);
      window.removeEventListener('panelWidthChanged', onChanged);
    };
  }, []);

  const bounds = useMemo(() => {
    const margin = 12; // global margin for selector spacing from edges
    const effectiveLeftWidth = leftExpanded ? leftWidth : 0;
    const effectiveRightWidth = rightExpanded ? rightWidth : 0;
    const x = Math.max(margin + effectiveLeftWidth, 0);
    const y = HEADER_HEIGHT + margin; // below header
    const width = Math.max(windowSize.w - effectiveLeftWidth - effectiveRightWidth - margin * 2, 320);
    const height = Math.max(windowSize.h - y - typeListHeight - margin, 200);
    return { x, y, width, height, leftWidth: effectiveLeftWidth, rightWidth: effectiveRightWidth, windowWidth: windowSize.w, windowHeight: windowSize.h, bottomReserved: typeListHeight };
  }, [leftWidth, rightWidth, windowSize, typeListHeight, leftExpanded, rightExpanded]);

  return bounds;
};

export default useViewportBounds;


