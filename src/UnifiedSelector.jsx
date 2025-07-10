import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Palette, ArrowBigRightDash } from 'lucide-react';
import { NODE_DEFAULT_COLOR, HEADER_HEIGHT } from './constants';
import NodeGridItem from './NodeGridItem';
import ColorPicker from './ColorPicker';
import useGraphStore from './store/graphStore.js';

const UnifiedSelector = ({ 
  mode, // 'node-creation', 'connection-creation', or 'node-typing'
  isVisible,
  onClose,
  onSubmit,
  initialName = '',
  initialColor = null,
  title,
  subtitle,
  position = null, // Optional custom position
  showCreateNewOption = false,
  searchTerm = '',
  onNodeSelect = null,
  selectedNodes = new Set()
}) => {
  const [name, setName] = useState(initialName);
  const lastInitialNameRef = useRef(initialName);
  
  // Update internal name when initialName changes (for clearing)
  useEffect(() => {
    // Only update when initialName actually changes from outside
    // This prevents overriding user input while they're typing
    if (initialName !== lastInitialNameRef.current) {
      lastInitialNameRef.current = initialName;
      setName(initialName);
    }
  }, [initialName]);
  const [color, setColor] = useState(initialColor || NODE_DEFAULT_COLOR);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [colorPickerPosition, setColorPickerPosition] = useState({ x: 0, y: 0 });
  const [scrollY, setScrollY] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [dialogHeight, setDialogHeight] = useState(160); // Dynamic dialog height

  const dialogRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const scrollContentRef = useRef(null);
  const animationRef = useRef(null);
  const velocityRef = useRef(0);

  // Store access
  const nodePrototypesMap = useGraphStore(state => state.nodePrototypes);

  // Calculate position based on mode - match NodeSelectionGrid exactly
  const getPosition = () => {
    if (position) return position;
    
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const dialogWidth = 300;
    const centerX = windowWidth / 2 - dialogWidth / 2; // Use original calculation
    
    switch (mode) {
      case 'node-creation':
      case 'connection-creation':
        const dialogTop = HEADER_HEIGHT + 25;
        const gridTop = dialogTop + dialogHeight + 10; // 10px spacing below dialog
        return {
          dialog: { x: centerX, y: dialogTop },
          grid: { x: centerX, y: gridTop }
        };
      case 'node-typing':
        return {
          grid: { x: centerX, y: HEADER_HEIGHT + 25 }
        };
      default:
        return { dialog: { x: centerX, y: HEADER_HEIGHT + 25 } };
    }
  };

  const positions = getPosition();

  // Define showDialog and showGrid early
  const showDialog = mode === 'node-creation' || mode === 'connection-creation';
  const showGrid = mode === 'node-typing' || showCreateNewOption || onNodeSelect;

  // Filter prototypes based on search term - use name field as search for creation modes
  const filteredPrototypes = React.useMemo(() => {
    const prototypes = Array.from(nodePrototypesMap.values());
    // For node/connection creation modes, use the name field as search
    // For node-typing mode, use the external searchTerm prop
    const searchText = (mode === 'node-creation' || mode === 'connection-creation') ? name : searchTerm;
    if (!searchText) return prototypes;
    return prototypes.filter(p => 
      p.name.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [nodePrototypesMap, name, searchTerm, mode]);

  // Handle form submission
  const handleSubmit = () => {
    if (name.trim() && onSubmit) {
      onSubmit({ name: name.trim(), color });
      // Clear the field immediately after submission
      setName('');
    }
  };

  // Handle color picker - toggle behavior like PieMenu
  const handleColorPickerToggle = (element, event) => {
    event.stopPropagation();
    
    if (colorPickerVisible) {
      // If already open, close it (toggle off)
      setColorPickerVisible(false);
    } else {
      // If closed, open it
      const rect = element.getBoundingClientRect();
      setColorPickerPosition({
        x: rect.left,
        y: rect.bottom + 5
      });
      setColorPickerVisible(true);
    }
  };

  const handleColorChange = (newColor) => {
    setColor(newColor);
  };

  // Scrolling logic for grid
  const getScrollBounds = useCallback(() => {
    if (!scrollContainerRef.current || !scrollContentRef.current) {
      return { minScroll: 0, maxScroll: 0, contentMaxScroll: 0 };
    }
    
    const containerHeight = scrollContainerRef.current.offsetHeight;
    const contentHeight = scrollContentRef.current.offsetHeight;
    const maxScroll = Math.max(0, contentHeight - containerHeight);
    const rubberBandDistance = 50;
    
    return {
      minScroll: -rubberBandDistance,
      maxScroll: maxScroll + rubberBandDistance,
      contentMaxScroll: maxScroll
    };
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const { minScroll, maxScroll, contentMaxScroll } = getScrollBounds();
    let newScrollY = scrollY + e.deltaY * 0.5;
    
    // Apply rubber band effect
    if (newScrollY < 0) {
      newScrollY = newScrollY * 0.3;
    } else if (newScrollY > contentMaxScroll) {
      const excess = newScrollY - contentMaxScroll;
      newScrollY = contentMaxScroll + (excess * 0.3);
    }
    
    newScrollY = Math.max(minScroll, Math.min(maxScroll, newScrollY));
    setScrollY(newScrollY);
    setIsScrolling(true);
    velocityRef.current = e.deltaY * 0.1;
  }, [scrollY, getScrollBounds]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isVisible) return;
      
      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'Enter' && (mode === 'node-creation' || mode === 'connection-creation')) {
        handleSubmit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, mode, onClose, handleSubmit]);

  // Scroll event handler
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && isVisible) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        container.removeEventListener('wheel', handleWheel, { passive: false });
      };
    }
  }, [isVisible, handleWheel]);

  // Measure dialog height dynamically
  useEffect(() => {
    if (showDialog && dialogRef.current) {
      const measuredHeight = dialogRef.current.offsetHeight;
      if (measuredHeight !== dialogHeight) {
        setDialogHeight(measuredHeight);
      }
    }
  }, [showDialog, title, subtitle, name, dialogHeight]);

  // Cleanup animation
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop with blur effect */}
      <div 
        style={{ 
          position: 'fixed', 
          inset: 0, 
          backgroundColor: 'rgba(0,0,0,0.3)', 
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)', // Safari support
          zIndex: 1000 
        }} 
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            // Clear the field and permanently close color picker when clicking off/backing out
            setName('');
            setColorPickerVisible(false);
            onClose?.();
          }
        }}
      />

      {/* Dialog for name input */}
      {showDialog && (
        <div
          ref={dialogRef}
          style={{
            position: 'fixed',
            top: positions.dialog.y,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#bdb5b5',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            zIndex: 1001,
            width: '300px',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ position: 'absolute', top: '10px', right: '10px', cursor: 'pointer' }}>
            <X size={20} color="#999" onClick={() => {
              // Clear the field and permanently close color picker when clicking X
              setName('');
              setColorPickerVisible(false);
              onClose?.();
            }} />
          </div>
          
          <div style={{ textAlign: 'center', marginBottom: '15px', color: 'black' }}>
            <strong style={{ fontSize: '18px' }}>{title}</strong>
          </div>
          
          {subtitle && (
            <div 
              style={{ textAlign: 'center', marginBottom: '15px', color: '#666', fontSize: '14px' }}
              dangerouslySetInnerHTML={{ __html: subtitle }}
            />
          )}
          
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Palette
              size={20}
              color="#260000"
              style={{ cursor: 'pointer', flexShrink: 0, marginRight: '8px' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => handleColorPickerToggle(e.currentTarget, e)}
              title="Change color"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { 
                if (e.key === 'Enter') handleSubmit(); 
                if (e.key === 'Escape') {
                  // Clear the field and permanently close color picker when hitting Escape
                  setName('');
                  setColorPickerVisible(false);
                  onClose?.();
                }
              }}
              style={{ 
                flex: 1, 
                padding: '10px', 
                borderRadius: '5px', 
                border: '1px solid #ccc', 
                marginRight: '10px' 
              }}
              autoFocus
            />
            <button
              onClick={handleSubmit}
              style={{ 
                padding: '10px', 
                backgroundColor: color, 
                color: '#bdb5b5', 
                border: 'none', 
                borderRadius: '5px', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '50px',
                minHeight: '44px'
              }}
              title={mode === 'connection-creation' ? 'Create connection type' : 'Create node type'}
            >
              <ArrowBigRightDash size={16} color="#bdb5b5" />
            </button>
          </div>
        </div>
      )}

      {/* Grid for node selection */}
      {showGrid && (
        <div
          ref={scrollContainerRef}
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            top: positions.grid?.y || (positions.dialog?.y + dialogHeight + 10),
            bottom: '20px', // Match Panel.jsx bottomOffset={20}
            width: '300px',
            zIndex: 1002,
            overflow: 'hidden',
            pointerEvents: 'auto'
          }}
        >
          <div
            ref={scrollContentRef}
            style={{
              transform: `translateY(${-scrollY}px)`,
              transition: isScrolling ? 'none' : 'transform 0.2s ease-out',
              padding: '12px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              alignContent: 'start'
            }}
          >

            {/* Existing prototypes */}
            {filteredPrototypes.map(prototype => (
              <NodeGridItem
                key={prototype.id}
                nodePrototype={prototype}
                onClick={() => onNodeSelect?.(prototype)}
                isSelected={selectedNodes.has(prototype.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Color Picker */}
      {colorPickerVisible && (
        <ColorPicker
          isVisible={colorPickerVisible}
          onClose={() => setColorPickerVisible(false)}
          onColorChange={handleColorChange}
          currentColor={color}
          position={colorPickerPosition}
          direction="down-left"
          parentContainerRef={dialogRef}
        />
      )}
    </>
  );
};

export default UnifiedSelector;