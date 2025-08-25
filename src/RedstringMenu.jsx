import React, { useState, useEffect, useRef } from 'react';
import MaroonSlider from './components/MaroonSlider.jsx';
import { ChevronRight, FileText, FolderOpen, Save, Clock } from 'lucide-react';
import './RedstringMenu.css';
import DebugOverlay from './DebugOverlay';

const RedstringMenu = ({ 
  isOpen, 
  onHoverView, 
  debugMode, 
  setDebugMode,
  trackpadZoomEnabled,
  onToggleTrackpadZoom,
  showConnectionNames,
  onToggleShowConnectionNames,
  // Connections visualization controls
  enableAutoRouting,
  routingStyle,
  manhattanBends,
  onToggleEnableAutoRouting,
  onSetRoutingStyle,
  onSetManhattanBends,
  // Optional: expose clean lane spacing adjuster
  onSetCleanLaneSpacing,
  cleanLaneSpacing,
  // Grid controls
  gridMode,
  onSetGridMode,
  gridSize,
  onSetGridSize,
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
  const [isInteracting, setIsInteracting] = useState(false); // Guard to keep submenu open during slider drag
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
    if (isInteracting) {
      return; // Do not close while interacting with embedded controls (e.g., slider)
    }
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
                                <div
                                  className="submenu-item"
                                  onClick={() => {
                                    // console.log('[RedstringMenu] New Universe clicked');
                                    onNewUniverse?.();
                                  }}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <FileText size={16} style={{ marginRight: '8px', minWidth: '16px', flexShrink: 0 }} />
                                  New Universe
                                </div>
                                <div
                                  className="submenu-item"
                                  onClick={() => {
                                    // console.log('[RedstringMenu] Save Universe clicked');
                                    onSaveUniverse?.();
                                  }}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <Save size={16} style={{ marginRight: '8px', minWidth: '16px', flexShrink: 0 }} />
                                  Save Universe
                                </div>
                                <div
                                  className="submenu-item"
                                  onClick={() => {
                                    // console.log('[RedstringMenu] Export as RDF/Turtle clicked');
                                    onExportRdf?.();
                                  }}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <FileText size={16} style={{ marginRight: '8px', minWidth: '16px', flexShrink: 0 }} />
                                  Export as RDF/Turtle
                                </div>
                                <div
                                    className={`submenu-item has-submenu ${openSubmenu === 'RecentFiles' ? 'active-submenu-parent' : ''}`}
                                    onClick={() => onOpenUniverse?.()}
                                    onMouseEnter={handleRecentFilesEnter}
                                    onMouseLeave={handleMenuItemLeave}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <FolderOpen size={16} style={{ marginRight: '8px', minWidth: '16px', flexShrink: 0 }} />
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
                                </div>
                            </div>
                          )}
                      </div>
                  );
              } else if(item === 'Edit'){
                  return (
                      <div 
                        key={index} 
                        onMouseEnter={() => handleMenuItemHover('Edit')}
                        onMouseLeave={handleMenuItemLeave}
                        style={{ position: 'relative', width: '100%' }}
                      >
                          <button className="menu-item">
                              <span>{item}</span>
                              <ChevronRight size={16} className="menu-item-chevron" />
                          </button>
                          {openSubmenu === 'Edit' && (
                            <div 
                              className="submenu-container"
                              onMouseEnter={handleSubmenuEnter}
                              onMouseLeave={handleMenuItemLeave}
                            >
                                <div
                                  className="submenu-item"
                                  onClick={() => {
                                    // Dispatch global event used by Panel to open DuplicateManager
                                    window.dispatchEvent(new Event('openMergeModal'));
                                  }}
                                  style={{ cursor: 'pointer' }}
                                >
                                  Merge Duplicates
                                </div>
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
                          {(openSubmenu === 'View' || openSubmenu === 'Grid') && (
                            <div 
                              className="submenu-container"
                              onMouseEnter={handleSubmenuEnter}
                              onMouseLeave={handleMenuItemLeave}
                            >
                                <div
                                  className="submenu-item"
                                  onClick={() => setDebugMode(!debugMode)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {debugMode ? 'Hide Debug Overlay' : 'Show Debug Overlay'}
                                </div>
                                <div
                                  className="submenu-item"
                                  onClick={() => onToggleTrackpadZoom?.()}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {trackpadZoomEnabled ? 'Disable Trackpad Zoom (Browser)' : 'Enable Trackpad Zoom (Browser)'}
                                </div>
                                <div
                                  className="submenu-item"
                                  onClick={() => onToggleShowConnectionNames?.()}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {showConnectionNames ? 'Hide Connection Names' : 'Show Connection Names'}
                                </div>
                                <div
                                  className={`submenu-item has-submenu ${openSubmenu === 'Grid' ? 'active-submenu-parent' : ''}`}
                                  onMouseEnter={() => setOpenSubmenu('Grid')}
                                  onMouseLeave={handleMenuItemLeave}
                                  style={{ cursor: 'pointer' }}
                                >
                                  Grid
                                  <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.7 }} />

                                  {openSubmenu === 'Grid' && (
                                    <div 
                                      className="submenu-container"
                                      onMouseEnter={handleSubmenuEnter}
                                      onMouseLeave={handleMenuItemLeave}
                                      style={{ left: '100%', top: 0 }}
                                    >
                                      <div
                                        className="submenu-item"
                                        onClick={() => onSetGridMode?.('off')}
                                        style={{ opacity: gridMode === 'off' ? 1 : 0.8, cursor: 'pointer' }}
                                      >
                                        Off {gridMode === 'off' ? '✓' : ''}
                                      </div>
                                      <div
                                        className="submenu-item"
                                        onClick={() => onSetGridMode?.('hover')}
                                        style={{ opacity: gridMode === 'hover' ? 1 : 0.8, cursor: 'pointer' }}
                                      >
                                        On Move {gridMode === 'hover' ? '✓' : ''}
                                      </div>
                                      <div
                                        className="submenu-item"
                                        onClick={() => onSetGridMode?.('always')}
                                        style={{ opacity: gridMode === 'always' ? 1 : 0.8, cursor: 'pointer' }}
                                      >
                                        Always {gridMode === 'always' ? '✓' : ''}
                                      </div>
                                      <div style={{ padding: '6px 6px 0 6px', width: '100%' }}
                                           onMouseDown={(e) => e.stopPropagation()}
                                           onMouseUp={(e) => e.stopPropagation()}
                                           onClick={(e) => e.stopPropagation()}
                                           onPointerDown={(e) => e.stopPropagation()}
                                           onPointerUp={(e) => e.stopPropagation()}
                                           onTouchStart={(e) => e.stopPropagation()}
                                           onTouchEnd={(e) => e.stopPropagation()}
                                      >
                                        <MaroonSlider
                                          label="Grid Size"
                                          value={gridSize || 200}
                                          min={20}
                                          max={400}
                                          step={5}
                                          suffix="px"
                                          onChange={(v) => onSetGridSize?.(v)}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
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

                              <div
                                className="submenu-item"
                                onClick={() => onSetRoutingStyle?.('straight')}
                                style={{ opacity: routingStyle === 'straight' ? 1 : 0.8, cursor: 'pointer' }}
                              >
                                Routing: Straight {routingStyle === 'straight' ? '✓' : ''}
                              </div>
                              <div
                                className="submenu-item"
                                onClick={() => onSetRoutingStyle?.('manhattan')}
                                style={{ opacity: routingStyle === 'manhattan' ? 1 : 0.8, cursor: 'pointer' }}
                              >
                                Routing: Manhattan {routingStyle === 'manhattan' ? '✓' : ''}
                              </div>
                              <div
                                className="submenu-item"
                                onClick={() => onSetRoutingStyle?.('clean')}
                                style={{ opacity: routingStyle === 'clean' ? 1 : 0.8, cursor: 'pointer' }}
                              >
                                Routing: Clean {routingStyle === 'clean' ? '✓' : ''}
                              </div>
                              {routingStyle === 'clean' && (
                                <div style={{ padding: '6px 6px 0 6px', width: '100%' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ fontSize: '12px', color: '#BDB6B5', opacity: 0.9 }}>Connection spacing</div>
                                    <div style={{ fontSize: '12px', color: '#BDB6B5', opacity: 0.8 }}>{cleanLaneSpacing || 200}px</div>
                                  </div>
                                  <div
                                    style={{ width: 'calc(100% - 16px)', margin: '6px 8px 0 8px' }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onMouseUp={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onPointerUp={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      className="submenu-slider"
                                      type="range"
                                      min={100}
                                      max={400}
                                      step={10}
                                      value={cleanLaneSpacing || 200}
                                      onChange={(e) => onSetCleanLaneSpacing?.(Number(e.target.value))}
                                      onInput={(e) => onSetCleanLaneSpacing?.(Number(e.target.value))}
                                      draggable={false}
                                      onMouseDown={(e) => { setIsInteracting(true); e.stopPropagation(); }}
                                      onMouseUp={(e) => { setIsInteracting(false); e.stopPropagation(); }}
                                      onClick={(e) => e.stopPropagation()}
                                      onPointerDown={(e) => { setIsInteracting(true); e.stopPropagation(); }}
                                      onPointerUp={(e) => { setIsInteracting(false); e.stopPropagation(); }}
                                      onTouchStart={(e) => { setIsInteracting(true); e.stopPropagation(); }}
                                      onTouchEnd={(e) => { setIsInteracting(false); e.stopPropagation(); }}
                                    />
                                  </div>
                                </div>
                              )}
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