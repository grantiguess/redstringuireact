import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import NodeGridItem from './NodeGridItem';
import useGraphStore from './store/graphStore';
import './NodeSelectionGrid.css';

const NodeSelectionGrid = ({ 
  isVisible, 
  onNodeSelect, 
  onClose,
  position = { x: 0, y: 0 },
  width = 280,
  bottomOffset = 20
}) => {
  // Get all node prototypes from the store
  const nodePrototypesMap = useGraphStore(state => state.nodePrototypes);
  
  // Convert to array and sort by name
  const availablePrototypes = useMemo(() => {
    const prototypes = Array.from(nodePrototypesMap.values());
    return prototypes.sort((a, b) => a.name.localeCompare(b.name));
  }, [nodePrototypesMap]);

  // Custom scrolling state
  const [scrollY, setScrollY] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollContainerRef = useRef(null);
  const scrollContentRef = useRef(null);
  
  // Animation frame refs for smooth scrolling
  const animationRef = useRef(null);
  const velocityRef = useRef(0);
  const lastTimeRef = useRef(0);

  const handleNodeClick = (nodePrototype) => {
    onNodeSelect(nodePrototype);
  };

  // Calculate scroll bounds
  const getScrollBounds = useCallback(() => {
    if (!scrollContainerRef.current || !scrollContentRef.current) {
      return { minScroll: 0, maxScroll: 0 };
    }
    
    const containerHeight = scrollContainerRef.current.offsetHeight;
    const contentHeight = scrollContentRef.current.offsetHeight;
    const maxScroll = Math.max(0, contentHeight - containerHeight);
    const rubberBandDistance = 50; // Allow 50px of overscroll
    
    return {
      minScroll: -rubberBandDistance,
      maxScroll: maxScroll + rubberBandDistance,
      contentMaxScroll: maxScroll
    };
  }, []);

  // Custom wheel handler for smooth scrolling with rubber band
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const { minScroll, maxScroll, contentMaxScroll } = getScrollBounds();
    let newScrollY = scrollY + e.deltaY * 0.5; // Slower scroll speed
    
    // Apply rubber band effect
    if (newScrollY < 0) {
      // Rubber band at top
      newScrollY = newScrollY * 0.3;
    } else if (newScrollY > contentMaxScroll) {
      // Rubber band at bottom
      const excess = newScrollY - contentMaxScroll;
      newScrollY = contentMaxScroll + (excess * 0.3);
    }
    
    // Clamp to absolute bounds
    newScrollY = Math.max(minScroll, Math.min(maxScroll, newScrollY));
    
    setScrollY(newScrollY);
    setIsScrolling(true);
    
    // Set velocity for momentum
    velocityRef.current = e.deltaY * 0.1;
    
    // Clear any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    // Start momentum animation
    const animate = (currentTime) => {
      if (lastTimeRef.current) {
        const deltaTime = currentTime - lastTimeRef.current;
        const { minScroll, maxScroll, contentMaxScroll } = getScrollBounds();
        
        // Apply velocity
        let newY = scrollY + velocityRef.current;
        
        // Rubber band back to bounds
        if (newY < 0) {
          newY = newY * 0.8; // Bounce back
          velocityRef.current *= 0.8;
        } else if (newY > contentMaxScroll) {
          const excess = newY - contentMaxScroll;
          newY = contentMaxScroll + (excess * 0.8);
          velocityRef.current *= 0.8;
        }
        
        // Apply friction
        velocityRef.current *= 0.95;
        
        setScrollY(newY);
        
        // Continue animation if velocity is significant
        if (Math.abs(velocityRef.current) > 0.1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setIsScrolling(false);
          
          // Snap back if out of bounds
          if (newY < 0) {
            setScrollY(0);
          } else if (newY > contentMaxScroll) {
            setScrollY(contentMaxScroll);
          }
        }
      }
      lastTimeRef.current = currentTime;
    };
    
    animationRef.current = requestAnimationFrame(animate);
  }, [scrollY, getScrollBounds]);

  // Handle click away
  const handleClickAway = useCallback((e) => {
    if (scrollContainerRef.current && !scrollContainerRef.current.contains(e.target)) {
      onClose();
    }
  }, [onClose]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isVisible) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isVisible, onClose]);

  // Prevent body scrolling when visible
  useEffect(() => {
    if (isVisible) {
      // Store original overflow
      const originalOverflow = document.body.style.overflow;
      
      // Prevent scrolling
      document.body.style.overflow = 'hidden';
      
      // Add click away listener
      document.addEventListener('mousedown', handleClickAway);
      
      return () => {
        // Restore scrolling
        document.body.style.overflow = originalOverflow;
        document.removeEventListener('mousedown', handleClickAway);
      };
    }
  }, [isVisible, handleClickAway]);

  // Add wheel listener to container
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && isVisible) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        container.removeEventListener('wheel', handleWheel, { passive: false });
      };
    }
  }, [isVisible, handleWheel]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Grid container - positioned above overlay */}
      <div
        ref={scrollContainerRef}
        className="node-selection-grid-container"
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          bottom: `${bottomOffset}px`,
          width: `${width}px`,
          zIndex: 1002, // Above dialog (1001) and overlay (1000)
          overflow: 'hidden', // Hide default scrollbars
          pointerEvents: 'auto'
        }}
      >
        {/* Scrollable grid content - custom scrolling */}
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
          {availablePrototypes.length === 0 ? null : (
            availablePrototypes.map((prototype) => (
              <NodeGridItem
                key={prototype.id}
                nodePrototype={prototype}
                onClick={handleNodeClick}
                width={132} // Calculated to fit 300px container: (300-24-12)/2 = 132
                height={80}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default NodeSelectionGrid; 