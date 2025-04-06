import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { HEADER_HEIGHT } from './constants';
import { ArrowLeftFromLine, Home, ImagePlus, XCircle } from 'lucide-react';
import './Panel.css'

/**
 * Panel
 * 
 * - Home tab at index 0 (locked).
 * - Node tabs afterwards.
 * - Double-click logic is handled in NodeCanvas, which calls openNodeTab(nodeId, nodeName).
 * - "onSaveNodeData" merges bio/image (and now name) into the NodeCanvas state.
 * - Image is scaled horizontally with "objectFit: contain."
 * - The circle around X has a fade‑in transition on hover.
 */
const Panel = forwardRef(
  ({
    isExpanded,
    onToggleExpand,
    nodes,
    onOpenNodeTab,
    onSaveNodeData,
    onFocusChange,
    projectTitle,
    projectBio,
    onProjectTitleChange,
    onProjectBioChange
  }, ref) => {
    const [tabs, setTabs] = useState([{ type: 'home', isActive: true }]);
    const [closingOverlay, setClosingOverlay] = useState(false);

    const [editingTitle, setEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState('');
    const titleInputRef = useRef(null);
    const [editingProjectTitle, setEditingProjectTitle] = useState(false);
    const [tempProjectTitle, setTempProjectTitle] = useState('');
    const projectTitleInputRef = useRef(null);

    useEffect(() => {
      if (!isExpanded) {
        setClosingOverlay(true);
        const timer = setTimeout(() => {
          setClosingOverlay(false);
        }, 300);
        return () => clearTimeout(timer);
      }
    }, [isExpanded]);

    useEffect(() => {
      if (editingTitle && titleInputRef.current) {
        titleInputRef.current.focus();
        titleInputRef.current.select();
      }
    }, [editingTitle]);

    useEffect(() => {
      if (editingProjectTitle && projectTitleInputRef.current) {
        projectTitleInputRef.current.focus();
        projectTitleInputRef.current.select();
      }
    }, [editingProjectTitle]);

    // Exposed so NodeCanvas can open tabs
    const openNodeTab = (nodeId, nodeName) => {
      setTabs((prev) => {
        let updated = prev.map((t) => ({ ...t, isActive: false }));
        const existingIndex = updated.findIndex(
          (t) => t.type === 'node' && t.nodeId === nodeId
        );
        if (existingIndex >= 0) {
          const [theTab] = updated.splice(existingIndex, 1);
          theTab.isActive = true;
          updated.splice(1, 0, theTab);
        } else {
          updated.splice(1, 0, {
            type: 'node',
            nodeId,
            title: nodeName,
            isActive: true,
          });
        }
        return updated;
      });
    };

    // Optionally track onOpenNodeTab changes if needed.
    useEffect(() => {
      // For now we don't need to do anything here.
    }, [onOpenNodeTab]);

    useImperativeHandle(ref, () => ({
      openNodeTab,
      // Expose function to close tabs based on a Set of node IDs
      closeTabsByIds: (idsToDelete) => {
        setTabs(prevTabs => {
          let activeTabWasDeleted = false;
          const currentActiveIndex = prevTabs.findIndex(t => t.isActive);

          // Filter out tabs whose nodeId is in the Set
          const remainingTabs = prevTabs.filter(tab => {
            if (tab.type === 'node' && idsToDelete.has(tab.nodeId)) {
              if (tab.isActive) {
                activeTabWasDeleted = true;
              }
              return false; // Filter out this tab
            }
            return true; // Keep this tab
          });

          // If the active tab was deleted, or no node tabs remain,
          // activate the home tab if it exists.
          if ((activeTabWasDeleted || remainingTabs.length <= 1) && remainingTabs[0]?.type === 'home') {
              remainingTabs[0].isActive = true;
               // Ensure other tabs (if any somehow remained active) are inactive
              for(let i = 1; i < remainingTabs.length; i++) {
                   remainingTabs[i].isActive = false;
               }
          } else if (remainingTabs.length > 0 && !remainingTabs.some(t => t.isActive)) {
              // Fallback: if no tab is active after deletion, activate home
              remainingTabs[0].isActive = true;
          }

          return remainingTabs;
        });
      }
    }));

    const closeTab = (index) => {
      if (index === 0) return; // can't close home
      setTabs((prev) => {
        let updated = [...prev];
        const wasActive = updated[index].isActive;
        updated.splice(index, 1);
        if (wasActive && updated.length > 0) {
          updated[0].isActive = true;
        }
        return updated;
      });
    };

    const activateTab = (index) => {
      setTabs((prev) =>
        prev.map((t, i) => ({ ...t, isActive: i === index }))
      );
    };

    const handleAddImage = (nodeId) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          const src = evt.target?.result;
          if (typeof src === 'string') {
            // Create an Image object to get dimensions
            const img = new Image();
            img.onload = () => {
              // Save src and original dimensions
              const placeholderThumbnailSrc = src; // TODO: Generate/get real thumbnail URL
              onSaveNodeData(nodeId, {
                image: {
                  src, // Original source
                  thumbnailSrc: placeholderThumbnailSrc, // Thumbnail source
                  naturalWidth: img.naturalWidth,
                  naturalHeight: img.naturalHeight,
                },
              });
            };
            img.onerror = () => {
              console.error('Image failed to load for dimension reading');
              // Optionally save just the src as a fallback?
              // onSaveNodeData(nodeId, { image: { src } });
            };
            img.src = src;
          } else {
            console.error('FileReader did not return a string src');
          }
        };
        reader.onerror = () => {
          console.error('FileReader failed to read the file');
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };

    const handleBioChange = (nodeId, newBio) => {
      onSaveNodeData(nodeId, { bio: newBio });
    };

    const commitProjectTitleChange = () => {
      const newName = tempProjectTitle.trim();
      onProjectTitleChange(newName);
      setEditingProjectTitle(false);
    };

    const activeTab = tabs.find((t) => t.isActive);

    let tabContent = null;
    if (!activeTab) {
      tabContent = (
        <div style={{ padding: '10px' }}>
          No tab selected, default to home soon...
        </div>
      );
    } else if (activeTab.type === 'home') {
      tabContent = (
        <div style={{ padding: '10px' }}>
          <div style={{ marginBottom: '8px' }}>
            {editingProjectTitle ? (
              <input
                ref={projectTitleInputRef}
                type="text"
                className="panel-title-input"
                value={tempProjectTitle}
                onChange={(e) => setTempProjectTitle(e.target.value)}
                onFocus={() => onFocusChange?.(true)}
                onBlur={() => {
                  commitProjectTitleChange();
                  onFocusChange?.(false);
                }}
                onKeyDown={(e) => {
                  if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) {
                    e.stopPropagation();
                  }
                  if (e.key === 'Enter') {
                    commitProjectTitleChange();
                  } else if (e.key === 'Escape') {
                    setEditingProjectTitle(false);
                    onFocusChange?.(false);
                  }
                }}
                style={{ fontFamily: 'inherit', fontSize: '1.1rem', fontWeight: 'bold', color: '#260000' }}
                autoFocus
              />
            ) : (
              <h2
                style={{
                  margin: 0,
                  color: '#260000',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                }}
                onDoubleClick={() => {
                  setEditingProjectTitle(true);
                  setTempProjectTitle(projectTitle);
                }}
              >
                {projectTitle}
              </h2>
            )}
          </div>

          <textarea
            placeholder="Add a bio..."
            className="panel-bio-textarea"
            style={{
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              minHeight: '60px',
              color: '#260000',
              border: '1px solid #ccc',
              borderRadius: '4px',
              padding: '0.5rem',
              backgroundColor: '#bdb5b5',
              fontSize: '14px',
              lineHeight: '1.4',
              fontFamily: 'inherit',
            }}
            value={projectBio || ''}
            onFocus={() => onFocusChange?.(true)}
            onBlur={() => onFocusChange?.(false)}
            onChange={(e) => onProjectBioChange(e.target.value)}
            onKeyDown={(e) => {
              if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) {
                e.stopPropagation();
              }
            }}
          />

          {/* Divider Line */}
          <div style={{ borderTop: '1px solid #ccc', margin: '15px 0' }}></div>

          {/* 3. "Components" Header (no border) */}
          <h3 style={{
             marginTop: 0,
             marginBottom: '10px',
             color: '#555',
             fontSize: '0.9rem',
             userSelect: 'none' // Prevent selection
             /* Remove borderBottom */
           }}>
            Components
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              maxHeight: '300px',
              overflowY: 'auto',
            }}
          >
            {nodes.map((node) => (
              <div
                key={node.id}
                style={{
                  backgroundColor: 'maroon',
                  borderRadius: '6px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: '0 5px',
                  overflow: 'hidden'
                }}
                title={node.name}
                onClick={() => openNodeTab(node.id, node.name)}
              >
                <span style={{
                  color: '#bdb5b5',
                  fontSize: '0.8rem',
                  width: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  padding: '0 10px',
                  boxSizing: 'border-box',
                  userSelect: 'none'
                }}>
                  {node.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    } else if (activeTab.type === 'node') {
      const nodeId = activeTab.nodeId;
      const nodeData = nodes.find((n) => n.id === nodeId);
      if (!nodeData) {
        tabContent = (
          <div style={{ padding: '10px', color: '#aaa' }}>Node not found...</div>
        );
      } else {
        // Function to commit the title change (on blur or Enter key)
        const commitTitleChange = () => {
          const newName = tempTitle.trim();
          if (newName && newName !== nodeData.name) {
            // Update the node data
            onSaveNodeData(nodeId, { name: newName });
            // Update the tab's title in state
            setTabs((prev) =>
              prev.map((tab) => {
                if (tab.type === 'node' && tab.nodeId === nodeId) {
                  return { ...tab, title: newName };
                }
                return tab;
              })
            );
          }
          setEditingTitle(false);
        };

        tabContent = (
          <div style={{ padding: '10px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              {/* Editable title: double‑click to enable editing */}
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  className="panel-title-input"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  onFocus={() => onFocusChange?.(true)}
                  onBlur={() => {
                    commitTitleChange();
                    onFocusChange?.(false);
                  }}
                  onKeyDown={(e) => {
                    // Prevent global key handling for these keys while editing
                    if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) {
                      e.stopPropagation();
                    }
                    if (e.key === 'Enter') {
                      commitTitleChange();
                    } else if (e.key === 'Escape') {
                      setEditingTitle(false);
                      onFocusChange?.(false);
                    }
                  }}
                  style={{ fontFamily: 'inherit' }}
                  autoFocus
                />
              ) : (
                <h3
                  style={{
                    margin: 0,
                    color: '#260000',
                    cursor: 'pointer',
                    overflow: 'hidden',
                  }}
                  onDoubleClick={() => {
                    setEditingTitle(true);
                    setTempTitle(nodeData.name);
                  }}
                >
                  <span style={{
                     display: 'inline-block',
                     maxWidth: '210px',
                     whiteSpace: 'normal',
                     overflowWrap: 'break-word',
                     verticalAlign: 'bottom'
                  }}>
                     {nodeData.name}
                  </span>
                </h3>
              )}

              <ImagePlus
                size={24}
                color="#260000"
                style={{ cursor: 'pointer', flexShrink: 0 }}
                onClick={() => handleAddImage(nodeId)}
              />
            </div>

            <textarea
              placeholder="Add a bio..."
              className="panel-bio-textarea"
              style={{
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                minHeight: '60px',
                color: '#260000',
                border: '1px solid #ccc',
                borderRadius: '4px',
                padding: '0.5rem',
                backgroundColor: '#bdb5b5',
                fontSize: '14px',
                lineHeight: '1.4',
                fontFamily: 'inherit',
              }}
              value={nodeData.bio || ''}
              onFocus={() => onFocusChange?.(true)}
              onBlur={() => onFocusChange?.(false)}
              onChange={(e) => handleBioChange(nodeId, e.target.value)}
              onKeyDown={(e) => {
                if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) {
                  e.stopPropagation();
                }
              }}
            />

            {nodeData.image?.src && (
              <div
                style={{
                  marginTop: '8px',
                  position: 'relative',
                  width: '100%',
                  maxWidth: '100%',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={nodeData.image.src}
                  alt="Node"
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    objectFit: 'contain',
                  }}
                />
              </div>
            )}
          </div>
        );
      }
    }

    return (
      <div>
        {closingOverlay && (
          <div
            style={{
              position: 'fixed',
              top: HEADER_HEIGHT + 20,
              right: 20,
              width: isExpanded ? 320 : 40,
              height: isExpanded ? 'auto' : 40,
              backgroundColor: '#260000',
              opacity: 0.4,
              transition: 'opacity 0.3s ease',
              borderRadius: '10px',
              pointerEvents: 'none',
              zIndex: 9998,
            }}
          />
        )}

        <div
          style={{
            position: 'fixed',
            top: HEADER_HEIGHT + 20,
            right: 20,
            width: isExpanded ? 320 : 40,
            height: isExpanded ? 'auto' : 40,
            maxHeight: 'calc(100vh - 80px)',
            backgroundColor: '#bdb5b5',
            borderRadius: '10px',
            boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
            zIndex: 9999,
            overflow: 'hidden',
            transition: 'width 0.2s ease, height 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              position: 'relative',
              height: 40,
              backgroundColor: '#716C6C',
              display: 'flex',
              alignItems: 'stretch',
              paddingLeft: '8px',
            }}
          >
            {tabs.map((tab, index) => {
              const isActive = tab.isActive;
              if (tab.type === 'home') {
                const bg = isActive ? '#bdb5b5' : '#979090';
                return (
                  <div
                    key="home"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '10px 10px 0 0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      backgroundColor: bg,
                      marginRight: '6px',
                      flexShrink: 0
                    }}
                    onClick={() => {
                      setTabs((prev) =>
                        prev.map((t, i) => ({ ...t, isActive: i === 0 }))
                      );
                    }}
                  >
                    <Home size={20} color="#260000" />
                  </div>
                );
              }
              // Node tab header
              const bg = isActive ? '#bdb5b5' : '#979090';
              return (
                <div
                  key={index}
                  className="panel-tab"
                  style={{
                    backgroundColor: bg,
                    borderTopLeftRadius: '10px',
                    borderTopRightRadius: '10px',
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    color: '#260000',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0px 8px',
                    marginRight: '6px',
                    height: '100%',
                    cursor: 'pointer',
                    maxWidth: '150px'
                  }}
                  onClick={() => activateTab(index)}
                >
                  <span style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginRight: '8px',
                  }}>
                    {tab.title}
                  </span>
                  <div
                    style={{
                      marginLeft: 'auto',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      flexShrink: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background-color 0.2s ease, opacity 0.2s ease',
                      opacity: 1,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(index);
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#ccc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <XCircle size={16} color="#260000" />
                  </div>
                </div>
              );
            })}

            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 40,
                height: 40,
                backgroundColor: isExpanded ? '#979090' : '#260000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                borderTopRightRadius: '10px',
                borderBottomRightRadius: isExpanded ? 0 : '10px',
                transition: 'background-color 0.2s ease',
              }}
              onClick={onToggleExpand}
            >
              <ArrowLeftFromLine
                size={20}
                color={isExpanded ? '#260000' : '#aaa'}
                style={{
                  transform: `rotate(${isExpanded ? '180deg' : '0deg'})`,
                  transformOrigin: 'center',
                  transition: 'transform 0.2s ease',
                }}
              />
            </div>
          </div>

          {isExpanded && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              {tabContent}
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default Panel;
