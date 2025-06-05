import React, { useState, useEffect } from 'react';
import { ChevronRight, FileText, FolderOpen, Save } from 'lucide-react';
import './RedstringMenu.css';
import DebugOverlay from './DebugOverlay';

const RedstringMenu = ({ 
  isOpen, 
  onHoverView, 
  debugMode, 
  setDebugMode,
  // Universe management actions
  onNewUniverse,
  onOpenUniverse,
  onSaveUniverse
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState(null); // Track which submenu is open
  const menuItems = ['File', 'Edit', 'View', 'Help'];

  useEffect(() => {
    if (isOpen) {
      setIsExiting(false);
      setShouldRender(true);
    } else {
      setIsExiting(true);
      setOpenSubmenu(null); // Close any open submenus when menu closes
      // Wait for animation to complete before removing from DOM
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 150); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  const handleMenuItemHover = (itemName) => {
    setOpenSubmenu(itemName);
  };

  const handleMenuItemLeave = () => {
    // Add a small delay before closing to prevent flicker
    setTimeout(() => {
      setOpenSubmenu(null);
    }, 100);
  };

  const handleSubmenuEnter = () => {
    // Cancel any pending close when entering submenu
    setOpenSubmenu(openSubmenu);
  };

  return (
    <>
      <div className={`menu-container ${isExiting ? 'exiting' : 'entering'}`}>
          <div className="menu-items">
          {menuItems.map((item, index) => {
              if (item === 'File') {
                  return (
                      <div 
                        key={index} 
                        onMouseEnter={() => handleMenuItemHover('File')}
                        onMouseLeave={handleMenuItemLeave}
                        style={{ position: 'relative', width: '100%' }}
                      >
                          <button className="menu-item">
                              <span>{item}</span>
                              <ChevronRight size={16} className="menu-item-chevron" />
                          </button>
                          {openSubmenu === 'File' && (
                            <div 
                              className="submenu-container"
                              onMouseEnter={handleSubmenuEnter}
                              onMouseLeave={handleMenuItemLeave}
                            >
                                <button
                                  className="submenu-item"
                                  onClick={() => {
                                    console.log('[RedstringMenu] New Universe clicked');
                                    onNewUniverse?.();
                                  }}
                                >
                                  <FileText size={16} style={{ marginRight: '8px' }} />
                                  New Universe
                                </button>
                                <button
                                  className="submenu-item"
                                  onClick={() => {
                                    console.log('[RedstringMenu] Open Universe clicked');
                                    onOpenUniverse?.();
                                  }}
                                >
                                  <FolderOpen size={16} style={{ marginRight: '8px' }} />
                                  Open Universe
                                </button>
                                <button
                                  className="submenu-item"
                                  onClick={() => {
                                    console.log('[RedstringMenu] Save Universe clicked');
                                    onSaveUniverse?.();
                                  }}
                                >
                                  <Save size={16} style={{ marginRight: '8px' }} />
                                  Save Universe
                                </button>
                            </div>
                          )}
                      </div>
                  );
              } else if(item === 'View'){
                  return (
                      <div 
                        key={index} 
                        onMouseEnter={() => handleMenuItemHover('View')}
                        onMouseLeave={handleMenuItemLeave}
                        style={{ position: 'relative', width: '100%' }}
                      >
                          <button className="menu-item">
                              <span>{item}</span>
                              <ChevronRight size={16} className="menu-item-chevron" />
                          </button>
                          {openSubmenu === 'View' && (
                            <div 
                              className="submenu-container"
                              onMouseEnter={handleSubmenuEnter}
                              onMouseLeave={handleMenuItemLeave}
                            >
                                <button
                                  className="submenu-item"
                                  onClick={() => setDebugMode(!debugMode)}
                                >
                                  {debugMode ? 'Hide Debug Overlay' : 'Show Debug Overlay'}
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