import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { HEADER_HEIGHT } from './constants';
import { ArrowLeftFromLine, Home, ImagePlus, XCircle } from 'lucide-react';

/**
 * Panel
 * 
 * - Home tab at index 0 (locked).
 * - Node tabs afterwards.
 * - Double-click logic is handled in NodeCanvas, which calls openNodeTab(nodeId, nodeName).
 * - "onSaveNodeData" merges bio/image into the NodeCanvas state.
 * - Image is scaled horizontally with "objectFit: contain."
 * - The circle around X has a fade‑in transition on hover.
 */
const Panel = forwardRef(
  ({ isExpanded, onToggleExpand, nodes, onOpenNodeTab, onSaveNodeData }, ref) => {
    const [tabs, setTabs] = useState([{ type: 'home', isActive: true }]);
    const [closingOverlay, setClosingOverlay] = useState(false);

    useEffect(() => {
      if (!isExpanded) {
        setClosingOverlay(true);
        const timer = setTimeout(() => {
          setClosingOverlay(false);
        }, 300);
        return () => clearTimeout(timer);
      }
    }, [isExpanded]);

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
          if (src) {
            onSaveNodeData(nodeId, {
              image: { src, width: 200, height: 200 },
            });
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };

    const handleBioChange = (nodeId, newBio) => {
      onSaveNodeData(nodeId, { bio: newBio });
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
      // 2-col grid of nodes
      tabContent = (
        <div style={{ padding: '10px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            {nodes.map((node) => (
              <div
                key={node.id}
                style={{
                  backgroundColor: 'maroon',
                  color: '#bdb5b5',
                  fontFamily: 'Helvetica',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  openNodeTab(node.id, node.name);
                }}
              >
                {node.name}
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
              <h3
                style={{
                  margin: 0,
                  color: '#260000',
                  fontFamily: 'Helvetica',
                }}
              >
                {nodeData.name}
              </h3>
              <ImagePlus
                size={24}
                color="#260000"
                style={{ cursor: 'pointer' }}
                onClick={() => handleAddImage(nodeId)}
              />
            </div>

            <textarea
              placeholder="Add a bio..."
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
                fontFamily: 'Helvetica',
              }}
              value={nodeData.bio || ''}
              onChange={(e) => handleBioChange(nodeId, e.target.value)}
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
              // Node tab
              const bg = isActive ? '#bdb5b5' : '#979090';
              return (
                <div
                  key={index}
                  style={{
                    backgroundColor: bg,
                    borderTopLeftRadius: '10px',
                    borderTopRightRadius: '10px',
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    color: '#260000',
                    fontWeight: 'bold',
                    userSelect: 'none',
                    fontSize: '0.9rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 8px',
                    marginRight: '4px',
                    height: '100%',
                    cursor: 'pointer',
                  }}
                  onClick={() => activateTab(index)}
                >
                  {tab.title}
                  <div
                    style={{
                      marginLeft: '6px',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
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
