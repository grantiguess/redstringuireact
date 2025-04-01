import React, { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import './RedstringMenu.css';
import DebugOverlay from './DebugOverlay';

const RedstringMenu = ({ isOpen, onHoverView, debugMode, setDebugMode }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const menuItems = ['File', 'Edit', 'View', 'Help'];

  useEffect(() => {
    if (isOpen) {
      setIsExiting(false);
      setShouldRender(true);
    } else {
      setIsExiting(true);
      // Wait for animation to complete before removing from DOM
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 150); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <>
      <div className={`menu-container ${isExiting ? 'exiting' : 'entering'}`}>
          <div className="menu-items">
          {menuItems.map((item, index) => {
              if(item === 'View'){
                  return (
                      <div 
                        key={index} 
                        onMouseEnter={() => setIsSubmenuOpen(true)}
                        style={{ position: 'relative', width: '100%' }}
                      >
                          <button className="menu-item">
                              <span>{item}</span>
                              <ChevronRight size={16} className="menu-item-chevron" />
                          </button>
                          {isSubmenuOpen && (
                            <div className="submenu-container">
                                <button
                                  className="submenu-item"
                                  onClick={() => setDebugMode(prev => !prev)}
                                >
                                  Debug Overlay
                                </button>
                            </div>
                          )}
                      </div>
                  );
              } else {
                  return (
                      <button
                          key={index}
                          className="menu-item"
                      >
                          <span>{item}</span>
                          <ChevronRight 
                              size={16} 
                              className="menu-item-chevron"
                          />
                      </button>
                  );
              }
          })}
          </div>
      </div>
      
    </>
  );
};

export default RedstringMenu;