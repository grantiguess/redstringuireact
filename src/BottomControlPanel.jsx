import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Plus, ArrowUpFromDot, ArrowRight } from 'lucide-react';
import './BottomControlPanel.css';

const BottomControlPanel = ({ 
  // Content for center area
  centerContent,
  
  // Arrow controls
  onLeftArrow,
  onRightArrow,
  hasLeftArrow = false,
  hasRightArrow = false,
  
  // Bubble controls
  onDelete,
  onAdd,
  onUp,
  onRightPanel,
  
  // Visual states
  isVisible = true,
  typeListOpen = false,
  onAnimationComplete,
  
  // Control which buttons are shown
  showDelete = true,
  showAdd = true,
  showUp = true,
  showRightPanel = true,
  
  // Additional props
  className = ''
}) => {
  // Animation state management (copied from ConnectionControlPanel)
  const [animationState, setAnimationState] = useState('entering');
  const [shouldRender, setShouldRender] = useState(true);

  // Handle visibility changes and animation lifecycle
  useEffect(() => {
    if (isVisible) {
      // Always start fresh when becoming visible
      setShouldRender(true);
      setAnimationState('entering');
    } else {
      // When becoming invisible, ALWAYS start exit animation if we're currently rendered
      if (shouldRender) {
        console.log('Starting exit animation - setting state to exiting');
        setAnimationState('exiting');
      }
    }
  }, [isVisible]);

  // Handle animation end events
  const handleAnimationEnd = (e) => {
    console.log(`Animation ended: ${e.animationName} Current state: ${animationState}`);
    if (e.animationName === 'bottomControlPanelFlyIn' || e.animationName === 'connectionPanelFlyIn') {
      setAnimationState('visible');
    } else if (e.animationName === 'bottomControlPanelFlyOut' || e.animationName === 'connectionPanelFlyOut') {
      setShouldRender(false);
      onAnimationComplete?.();
    }
  };

  // Fallback timeout for exit animation
  useEffect(() => {
    if (animationState === 'exiting') {
      const timeout = setTimeout(() => {
        setShouldRender(false);
        onAnimationComplete?.();
      }, 400); // Slightly longer than the animation duration (300ms)
      
      return () => clearTimeout(timeout);
    }
  }, [animationState, onAnimationComplete]);

  // Only render when shouldRender is true
  if (!shouldRender) return null;

  return (
    <div 
      className={`bottom-control-panel ${typeListOpen ? 'with-typelist' : ''} ${animationState} ${className}`}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className="bottom-control-content">
        {/* Left bubble controls */}
        <div className="bubble-controls left">
          {showDelete && (
            <div className="delete-control">
              <div 
                className="delete-button"
                onClick={onDelete}
                title="Delete"
              >
                <Trash2 size={16} />
              </div>
            </div>
          )}
          {showAdd && (
            <div className="add-control">
              <div 
                className="add-button"
                onClick={onAdd}
                title="Add"
              >
                <Plus size={16} />
              </div>
            </div>
          )}
        </div>
        
        {/* Center navigation (same as ConnectionControlPanel) */}
        <div className="arrow-control left-arrow">
          <div 
            className={`arrow-dropdown ${hasLeftArrow ? 'active' : ''}`}
            onClick={onLeftArrow}
          >
            <ChevronLeft size={20} />
          </div>
        </div>
        
        <div className="center-content-display">
          {centerContent}
        </div>
        
        <div className="arrow-control right-arrow">
          <div 
            className={`arrow-dropdown ${hasRightArrow ? 'active' : ''}`}
            onClick={onRightArrow}
          >
            <ChevronRight size={20} />
          </div>
        </div>
        
        {/* Right bubble controls */}
        <div className="bubble-controls right">
          {showUp && (
            <div className="up-control">
              <div 
                className="up-button"
                onClick={onUp}
                title="Open definition"
              >
                <ArrowUpFromDot size={16} />
              </div>
            </div>
          )}
          {showRightPanel && (
            <div className="panel-control">
              <div 
                className="panel-button"
                onClick={onRightPanel}
                title="Open in panel"
              >
                <ArrowRight size={16} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BottomControlPanel; 