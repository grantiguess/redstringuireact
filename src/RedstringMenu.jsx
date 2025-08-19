import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, FileText, FolderOpen, Save, Clock } from 'lucide-react';
import './RedstringMenu.css';
import DebugOverlay from './DebugOverlay';

const RedstringMenu = ({ 
  isOpen, 
  onHoverView, 
  debugMode, 
  setDebugMode,
  showConnectionNames,
  onToggleShowConnectionNames,
  // Connections visualization controls
  enableAutoRouting,
  routingStyle,
  manhattanBends,
  onToggleEnableAutoRouting,
  onSetRoutingStyle,
  onSetManhattanBends,
  // Universe management actions
  onNewUniverse,
  onOpenUniverse,
  onSaveUniverse,
  onExportRdf,
  onOpenRecentFile
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState(null); // Track which submenu is open
  const [recentFiles, setRecentFiles] = useState([]);
  // Track timeouts to cancel them when needed
  const [closeTimeout, setCloseTimeout] = useState(null);
  const menuItems = ['File', 'Edit', 'View', 'Connections', 'Help'];
  const menuRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setIsExiting(false);
      setShouldRender(true);
      
      // Load recent files when menu opens
      loadRecentFiles();
    } else {
      setIsExiting(true);
      setOpenSubmenu(null); // Close any open submenus when menu closes
      
      // Clear any pending close timeout
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        setCloseTimeout(null);
      }
      
      // Wait for animation to complete before removing from DOM
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 150); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen, closeTimeout]);

  // Handle clicks outside the menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && menuRef.current && !menuRef.current.contains(event.target)) {
        // Check if the click is not on any submenu or its children
        const isSubmenuClick = event.target.closest('.submenu-container') || 
                              event.target.closest('.recent-files-submenu');
        
        if (!isSubmenuClick) {
          onHoverView?.(false); // Close the menu
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onHoverView]);

  // Debug effect to log submenu state changes
  useEffect(() => {
    // console.log('[RedstringMenu Frontend] Submenu state changed to:', openSubmenu);
  }, [openSubmenu]);

  const loadRecentFiles = async () => {
    try {
      const { getRecentFiles } = await import('./store/fileStorage.js');
      const files = await getRecentFiles();
      // console.log('[RedstringMenu Frontend] Recent files loaded, count:', files.length);
      setRecentFiles(files);
    } catch (error) {
      console.error('[RedstringMenu Frontend] Error loading recent files:', error);
      setRecentFiles([]);
    }
  };

  if (!shouldRender) return null;

  const handleMenuItemHover = (itemName) => {
    // Clear any pending close timeout
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      setCloseTimeout(null);
    }
    // console.log('[RedstringMenu Frontend] Opening submenu:', itemName);
    setOpenSubmenu(itemName);
  };

  const handleMenuItemLeave = () => {
    // Clear any existing timeout
    if (closeTimeout) {
      clearTimeout(closeTimeout);
    }
    
    // Add a small delay before closing to prevent flicker
    const timeout = setTimeout(() => {
      // console.log('[RedstringMenu Frontend] Closing submenu after timeout');
      setOpenSubmenu(null);
      setCloseTimeout(null);
    }, 200); // Increased to 200ms for nested submenus
    
    setCloseTimeout(timeout);
  };

  const handleSubmenuEnter = () => {
    // Cancel any pending close when entering submenu
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      setCloseTimeout(null);
    }
    // console.log('[RedstringMenu Frontend] Entering submenu, canceling close timer');
  };

  const handleRecentFilesEnter = () => {
    // Specifically handle Recent Files hover to ensure it stays open
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      setCloseTimeout(null);
    }
    // console.log('[RedstringMenu Frontend] Hovering over Recent Files, keeping File submenu open');
    setOpenSubmenu('RecentFiles');
  };

  return (
    <>
      <div ref={menuRef} className={`menu-container ${isExiting ? 'exiting' : 'entering'}`}>
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
                          {(openSubmenu === 'File' || openSubmenu === 'RecentFiles') && (
                            <div 
                              className="submenu-container"
                              onMouseEnter={handleSubmenuEnter}
                              onMouseLeave={handleMenuItemLeave}
                            >
                                <button
                                  className="submenu-item"
                                  onClick={() => {
                                    // console.log('[RedstringMenu] New Universe clicked');
                                    onNewUniverse?.();
                                  }}
                                >
                                  <FileText size={16} style={{ marginRight: '8px' }} />
                                  New Universe
                                </button>
                                <button
                                  className="submenu-item"
                                  onClick={() => {
                                    // console.log('[RedstringMenu] Save Universe clicked');
                                    onSaveUniverse?.();
                                  }}
                                >
                                  <Save size={16} style={{ marginRight: '8px' }} />
                                  Save Universe
                                </button>
                                <button
                                  className="submenu-item"
                                  onClick={() => {
                                    // console.log('[RedstringMenu] Export as RDF/Turtle clicked');
                                    onExportRdf?.();
                                  }}
                                >
                                  <FileText size={16} style={{ marginRight: '8px' }} />
                                  Export as RDF/Turtle
                                </button>
                                <button
                                    className={`submenu-item has-submenu ${openSubmenu === 'RecentFiles' ? 'active-submenu-parent' : ''}`}
                                    onClick={() => onOpenUniverse?.()}
                                    onMouseEnter={handleRecentFilesEnter}
                                    onMouseLeave={handleMenuItemLeave}
                                >
                                    <FolderOpen size={16} style={{ marginRight: '8px' }} />
                                    Open...
                                    <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.7 }} />

                                    {openSubmenu === 'RecentFiles' && (
                                        <div 
                                            className="recent-files-submenu"
                                            onMouseEnter={handleSubmenuEnter}
                                            onMouseLeave={handleMenuItemLeave}
                                        >
                                            {recentFiles.length === 0 ? (
                                                <div className="no-recent-files">No recent files</div>
                                            ) : (
                                                recentFiles.map((file, index) => (
                                                    <button
                                                        key={file.handleId || index}
                                                        className="recent-file-item"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onOpenRecentFile?.(file);
                                                        }}
                                                        title={`${file.fileName}\nLast opened: ${new Date(file.lastOpened).toLocaleString()}`}
                                                    >
                                                        <span className="recent-file-name">{file.fileName}</span>
                                                        <span className="recent-file-time">
                                                            {new Date(file.lastOpened).toLocaleDateString()}
                                                        </span>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
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
                                <button
                                  className="submenu-item"
                                  onClick={() => onToggleShowConnectionNames?.()}
                                >
                                  {showConnectionNames ? 'Hide Connection Names' : 'Show Connection Names'}
                                </button>
                            </div>
                          )}
                      </div>
                  );
              } else if(item === 'Connections'){
                  return (
                      <div 
                        key={index} 
                        onMouseEnter={() => handleMenuItemHover('Connections')}
                        onMouseLeave={handleMenuItemLeave}
                        style={{ position: 'relative', width: '100%' }}
                      >
                          <button className="menu-item">
                              <span>{item}</span>
                              <ChevronRight size={16} className="menu-item-chevron" />
                          </button>
                          {openSubmenu === 'Connections' && (
                            <div 
                              className="submenu-container"
                              onMouseEnter={handleSubmenuEnter}
                              onMouseLeave={handleMenuItemLeave}
                            >
                              <button
                                className="submenu-item"
                                onClick={() => onToggleEnableAutoRouting?.()}
                              >
                                {enableAutoRouting ? 'Disable Auto-Routing' : 'Enable Auto-Routing'}
                              </button>
                              <button
                                className="submenu-item"
                                onClick={() => onSetRoutingStyle?.('straight')}
                                style={{ opacity: routingStyle === 'straight' ? 1 : 0.8 }}
                              >
                                Routing: Straight {routingStyle === 'straight' ? '✓' : ''}
                              </button>
                              <button
                                className="submenu-item"
                                onClick={() => onSetRoutingStyle?.('manhattan')}
                                style={{ opacity: routingStyle === 'manhattan' ? 1 : 0.8 }}
                              >
                                Routing: Manhattan {routingStyle === 'manhattan' ? '✓' : ''}
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