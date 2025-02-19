import React, { useState, useEffect } from 'react';
import { HEADER_HEIGHT } from './constants';
import { ArrowLeftFromLine, Home, ImagePlus, XCircle } from 'lucide-react';

/**
 * Panel
 * 
 * - Home tab at index 0 (locked)
 * - Node tabs after that
 * - Max height => 40px top margin + 40px bottom margin => "calc(100vh - 80px)"
 * - Images scale horizontally => "width: 100%, height: auto, objectFit: contain"
 * - Circle around 'X' in tabs has a fade-in transition.
 */
const Panel = ({
  isExpanded,
  onToggleExpand,
  nodes,
  onOpenNodeTab,
  onSaveNodeData
}) => {
  // tabs => [ { type:'home', isActive:true }, { type:'node', nodeId, title, isActive }, ... ]
  const [tabs, setTabs] = useState([
    { type: 'home', isActive: true },
  ]);

  // Fade overlay on collapse
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

  // openNodeTab => add/focus a node tab
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

  // closeTab => can't close home index=0
  const closeTab = (index) => {
    if (index === 0) return;
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

  // activateTab => click
  const activateTab = (index) => {
    setTabs((prev) =>
      prev.map((t, i) => ({ ...t, isActive: i === index }))
    );
  };

  // handleAddImage => base64 upload
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
    // fallback => home
    tabContent = (
      <div style={{ padding: '10px' }}>
        <em>No active tab, defaulting to home soon.</em>
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
                color: 'white',
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
        <div style={{ padding: '10px', color: '#aaa' }}>
          Node not found...
        </div>
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
              backgroundColor: '#fff',
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
                // Let the panel's internal container handle the max width.
                // We'll do "height: auto" in the <img> to keep aspect ratio
                overflow: 'hidden',
                resize: 'none', // we won't let the user "resize" the container
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
                  // This ensures it scales to fill horizontally, 
                  // and grows vertically as needed 
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
      {/* Maroon overlay fade */}
      {closingOverlay && (
        <div
          style={{
            position: 'fixed',
            top: HEADER_HEIGHT + 20,
            right: 20,
            width: isExpanded ? 320 : 40,
            // maxHeight for the panel, so top/bottom margins remain
            maxHeight: 'calc(100vh - 80px)',
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
          backgroundColor: '#fff',
          borderRadius: '10px',
          boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
          zIndex: 9999,
          overflow: 'hidden',
          transition: 'width 0.2s ease, height 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          // Limit total height => top/bottom margins remain
          maxHeight: 'calc(100vh - 80px)',
        }}
      >
        {/* TABS BAR */}
        <div
          style={{
            position: 'relative',
            height: 40,
            backgroundColor: '#efecec',
            display: 'flex',
            alignItems: 'stretch',
            paddingLeft: '8px',
          }}
        >
          {tabs.map((tab, index) => {
            const isActive = tab.isActive;
            if (tab.type === 'home') {
              // locked tab
              const bg = isActive ? '#fff' : '#ddd';
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
            // node tab
            const bg = isActive ? '#fff' : '#ddd';
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
                    // fade in transition
                    transition: 'background-color 0.2s ease, opacity 0.2s ease',
                    opacity: 1, // always visible, but background fades
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

          {/* Collapse button */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 40,
              height: 40,
              backgroundColor: isExpanded ? '#ddd' : '#260000',
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

        {/* MAIN CONTENT */}
        {isExpanded && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            {tabContent}
          </div>
        )}
      </div>
    </div>
  );
};

export default Panel;
