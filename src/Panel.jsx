import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { useDrag, useDrop, useDragLayer } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend'; // Import for hiding default preview
import { HEADER_HEIGHT, NODE_CORNER_RADIUS, THUMBNAIL_MAX_DIMENSION } from './constants';
import { ArrowLeftFromLine, Home, ImagePlus, XCircle } from 'lucide-react';
import './Panel.css'
import { generateThumbnail } from './utils'; // Import thumbnail generator
import ToggleButton from './ToggleButton'; // Import the new component

// Define Item Type for react-dnd
const ItemTypes = {
  TAB: 'tab',
};

// --- Custom Drag Layer --- A component to render the preview
const CustomDragLayer = ({ tabBarRef }) => {
  const { itemType, isDragging, item, initialOffset, currentOffset } = useDragLayer(
    (monitor) => ({
      item: monitor.getItem(),
      itemType: monitor.getItemType(),
      initialOffset: monitor.getInitialSourceClientOffset(),
      currentOffset: monitor.getSourceClientOffset(),
      isDragging: monitor.isDragging(),
    })
  );

  if (!isDragging || itemType !== ItemTypes.TAB || !initialOffset || !currentOffset) {
    return null;
  }

  // Get the tab data from the item
  const { tab } = item; // Assuming tab data is passed in item

  // Style for the layer element
  const layerStyles = {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: 1, // Lower z-index to be below buttons (which are zIndex: 2)
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
  };

  // Function to calculate clamped transform
  const getItemStyles = (initialOffset, currentOffset, tabBarRef) => {
    if (!initialOffset || !currentOffset) {
      return { display: 'none' };
    }

    let clampedX = currentOffset.x;
    const tabBarBounds = tabBarRef.current?.getBoundingClientRect();

    if (tabBarBounds) {
      // Clamp the x position within the tab bar bounds
      clampedX = Math.max(
        tabBarBounds.left,
        Math.min(currentOffset.x, tabBarBounds.right - 150) // Adjust right bound by approx tab width
      );
    }

    // Use clamped X for horizontal, initial Y for vertical
    const transform = `translate(${clampedX}px, ${initialOffset.y}px)`;
    return {
      transform,
      WebkitTransform: transform,
    };
  }

  // Style the preview element itself (similar to the original tab)
  const previewStyles = {
    backgroundColor: '#bdb5b5', // Active tab color for preview
    borderTopLeftRadius: '10px',
    borderTopRightRadius: '10px',
    color: '#260000',
    fontWeight: 'bold',
    fontSize: '0.9rem',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0px 8px',
    height: '40px', // Match tab height
    maxWidth: '150px',
    // boxShadow: '0 4px 8px rgba(0,0,0,0.3)', // Removed shadow
    opacity: 0.9, // Slightly transparent
  };

  return (
    <div style={layerStyles}>
      <div style={{ ...previewStyles, ...getItemStyles(initialOffset, currentOffset, tabBarRef) }}>
         {/* Simplified content for preview */}
        <span style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginRight: '8px',
          userSelect: 'none'
        }}>
          {item.title} {/* Use title from item */} 
        </span>
        {/* No close button in preview */}
      </div>
    </div>
  );
};
// --- End Custom Drag Layer ---


// Draggable Tab Component
const DraggableTab = ({ tab, index, moveTab, activateTab, closeTab }) => {
  const ref = useRef(null);

  const [, drop] = useDrop({
    accept: ItemTypes.TAB,
    hover(item, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleX = (hoverBoundingRect.right - hoverBoundingRect.left) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientX = clientOffset.x - hoverBoundingRect.left;

      if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) {
        return;
      }
      if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) {
        return;
      }

      moveTab(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemTypes.TAB,
    item: () => {
      // Include tab title in the item for the drag layer
      return { id: tab.nodeId, index, title: tab.title, tab: tab }; // Pass full tab data
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  // Hide default browser preview
  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  // Style the original tab when dragging
  const opacity = isDragging ? 0.4 : 1; // Make original tab faded, not invisible
  const cursor = isDragging ? 'grabbing' : 'grab'; // Change cursor based on state

  const isActive = tab.isActive;
  const bg = isActive ? '#bdb5b5' : '#979090';

  drag(drop(ref));

  const originalIndex = index + 1;

  return (
    <div
      ref={ref}
      className="panel-tab"
      style={{
        opacity,
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
        cursor: cursor, // Updated cursor
        maxWidth: '150px',
        transition: 'opacity 0.1s ease' // Smooth fade out
      }}
      onClick={() => activateTab(originalIndex)}
    >
       {/* Content remains same, but invisible when dragging */}
      <span style={{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        marginRight: '8px',
        userSelect: 'none'
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
          cursor: 'pointer'
        }}
        onClick={(e) => {
          e.stopPropagation();
          closeTab(originalIndex);
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
};

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
const MIN_PANEL_WIDTH = 100;
const INITIAL_PANEL_WIDTH = 250;

// Helper to read width from storage
const getInitialWidth = (side, defaultValue) => {
  try {
    const storedWidth = localStorage.getItem(`panelWidth_${side}`);
    if (storedWidth !== null) {
      const parsedWidth = JSON.parse(storedWidth);
      if (typeof parsedWidth === 'number' && parsedWidth >= MIN_PANEL_WIDTH && parsedWidth <= window.innerWidth) {
         return parsedWidth;
      }
    }
  } catch (error) {
    console.error(`Error reading panelWidth_${side} from localStorage:`, error);
  }
  return defaultValue; 
};

// Helper to read the last *non-default* width
const getInitialLastCustomWidth = (side, defaultValue) => {
    // Attempt to read specific key first
    try {
      const stored = localStorage.getItem(`lastCustomPanelWidth_${side}`);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        // Ensure it's valid and not the default width itself
        if (typeof parsed === 'number' && parsed >= MIN_PANEL_WIDTH && parsed <= window.innerWidth && parsed !== INITIAL_PANEL_WIDTH) {
           return parsed;
        }
      }
    } catch (error) {
      console.error(`Error reading lastCustomPanelWidth_${side} from localStorage:`, error);
    }
    // Fallback: Read the current width, use if it's not the default
    const currentWidth = getInitialWidth(side, defaultValue);
    return currentWidth !== INITIAL_PANEL_WIDTH ? currentWidth : defaultValue;
  };

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
    onProjectBioChange,
    side = 'right',
  }, ref) => {
    const [tabs, setTabs] = useState([{ type: 'home', isActive: true }]);
    const [closingOverlay, setClosingOverlay] = useState(false);

    const [editingTitle, setEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState('');
    const titleInputRef = useRef(null);
    const [editingProjectTitle, setEditingProjectTitle] = useState(false);
    const [tempProjectTitle, setTempProjectTitle] = useState('');
    const projectTitleInputRef = useRef(null);
    const tabBarRef = useRef(null);

    // Initialize width using helper
    const [panelWidth, setPanelWidth] = useState(() => getInitialWidth(side, INITIAL_PANEL_WIDTH));
    // Initialize last custom width using helper
    const [lastCustomWidth, setLastCustomWidth] = useState(() => getInitialLastCustomWidth(side, INITIAL_PANEL_WIDTH));
    const [isAnimatingWidth, setIsAnimatingWidth] = useState(false);

    const isResizing = useRef(false);
    const resizeStartX = useRef(0);
    const resizeStartWidth = useRef(0);
    const panelRef = useRef(null);

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
      // Find the corresponding node data from the props
      const nodeData = nodes.find(n => n.id === nodeId);
      
      // Determine initial values for the new tab
      let initialBio = '';
      let initialThumb = null;
      let initialImageSrc = null;
      let initialAspectRatio = null;

      if (nodeData) {
        const desc = nodeData.getDescription();
        initialBio = (desc && desc !== "No description.") ? desc : ''; // Use empty string if default placeholder
        initialThumb = nodeData.getThumbnailSrc() || null;
        initialImageSrc = nodeData.getImageSrc() || null; 
        initialAspectRatio = nodeData.getImageAspectRatio() || null;
      }

      setTabs((prev) => {
        let updated = prev.map((t) => ({ ...t, isActive: false }));
        const existingIndex = updated.findIndex(
          (t) => t.type === 'node' && t.nodeId === nodeId
        );
        if (existingIndex >= 0) {
          const [theTab] = updated.splice(existingIndex, 1);
          theTab.isActive = true;
          // Update existing tab data on reopen?
          // For now, just reactivate and move to front.
          // The useEffect sync should handle data updates if needed.
          updated.splice(1, 0, theTab);
        } else {
          // Create new tab with pre-populated data
          updated.splice(1, 0, {
            type: 'node',
            nodeId,
            title: nodeName, // Use name passed from NodeCanvas
            isActive: true,
            // Initialize with data derived from nodeData
            bio: initialBio,
            thumbnailSrc: initialThumb,
            imageSrc: initialImageSrc, 
            imageAspectRatio: initialAspectRatio,
          });
        }
        return updated;
      });
      // Reset editing state when opening/switching tabs
      setEditingTitle(false);
      setEditingProjectTitle(false);
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

    // --- Function to handle moving tabs ---
    const moveTab = (dragIndex, hoverIndex) => {
      setTabs((prevTabs) => {
        const nodeTabs = prevTabs.slice(1); // Get only the draggable node tabs
        const draggedTab = nodeTabs[dragIndex];

        const updatedNodeTabs = [...nodeTabs];
        updatedNodeTabs.splice(dragIndex, 1); // Remove dragged tab
        updatedNodeTabs.splice(hoverIndex, 0, draggedTab); // Insert at hover position

        // Reconstruct the full tabs array with Home tab first
        return [prevTabs[0], ...updatedNodeTabs];
      });
    };
    // -------------------------------------

    const handleAddImage = (nodeId) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 1. Read full image as data URL
        const reader = new FileReader();
        reader.onload = async (loadEvent) => {
          const fullImageSrc = loadEvent.target?.result;
          if (typeof fullImageSrc !== 'string') {
            console.error('FileReader did not return a string src');
            return;
          }

          // Need to load the full image to get dimensions for aspect ratio
          const img = new Image();
          img.onload = async () => {
            try {
              // Calculate aspect ratio
              const aspectRatio = (img.naturalHeight > 0 && img.naturalWidth > 0) 
                                  ? img.naturalHeight / img.naturalWidth 
                                  : 1; // Default aspect ratio if dimensions are zero

              // Generate thumbnail
              const thumbSrc = await generateThumbnail(fullImageSrc, THUMBNAIL_MAX_DIMENSION);

              // Prepare data with aspect ratio
              const nodeDataToSave = {
                imageSrc: fullImageSrc,
                thumbnailSrc: thumbSrc,
                imageAspectRatio: aspectRatio, // Include aspect ratio
              };

              // Call the save handler
              console.log('Calling onSaveNodeData with aspect ratio:', nodeId, nodeDataToSave);
              onSaveNodeData(nodeId, nodeDataToSave);

            } catch (error) {
              console.error("Thumbnail generation or saving failed:", error);
              // Fallback: Save without thumbnail/aspect ratio? Consider error handling.
              // onSaveNodeData(nodeId, { imageSrc: fullImageSrc }); 
            }
          };
          img.onerror = (error) => {
            console.error('Image failed to load for dimension/aspect ratio reading:', error);
            // Handle failure - maybe don't save image data?
          };
          img.src = fullImageSrc; // Load the full image src

        };
        reader.onerror = (error) => {
          console.error('FileReader failed to read the file:', error);
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };

    const handleBioChange = (nodeId, newBio) => {
      onSaveNodeData(nodeId, { description: newBio }); // Use 'description' key for CoreNode
    };

    const commitProjectTitleChange = () => {
      const newName = tempProjectTitle.trim();
      onProjectTitleChange(newName);
      setEditingProjectTitle(false);
    };

    // --- Tab Bar Scroll Handler ---
    const handleTabBarWheel = (e) => {
      if (tabBarRef.current) {
        e.preventDefault();
        e.stopPropagation();

        let scrollAmount = 0;
        // Prioritize axis with larger absolute delta
        if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
          scrollAmount = e.deltaY;
        } else {
          scrollAmount = e.deltaX;
        }

        const sensitivity = 0.5; 
        const scrollChange = scrollAmount * sensitivity;

        tabBarRef.current.scrollLeft += scrollChange;
      } else {
        console.log('[Tab Wheel] Ref does NOT exist'); // Log if ref is missing
      }
    };

    // --- Effect to manually add non-passive wheel listener ---
    useEffect(() => {
      const tabBarNode = tabBarRef.current;
      if (tabBarNode) {
        console.log('[Tab Wheel Effect] Adding non-passive wheel listener');
        // Add listener with passive: false to allow preventDefault
        tabBarNode.addEventListener('wheel', handleTabBarWheel, { passive: false });

        // Cleanup function
        return () => {
          console.log('[Tab Wheel Effect] Removing wheel listener');
          tabBarNode.removeEventListener('wheel', handleTabBarWheel, { passive: false });
        };
      }
    }, []); // Run only once on mount

    // --- START: Effect to synchronize local tabs with nodes prop ---
    useEffect(() => {
      if (side === 'right') { 
        setTabs(currentTabs => {
            let needsUpdate = false;
            const updatedTabs = currentTabs.map(tab => {
                if (tab.type === 'node' && tab.nodeId) {
                    const nodeFromProp = nodes.find(n => n.id === tab.nodeId);
                    if (nodeFromProp) {
                        let updatedTab = { ...tab };
                        let tabChanged = false;

                        // Sync Title (if not currently editing)
                        const latestName = nodeFromProp.getName() || 'Untitled';
                        if (!editingTitle && tab.title !== latestName) {
                           updatedTab.title = latestName;
                           tabChanged = true;
                        }

                        // --- Refined Bio Sync Logic --- 
                        const latestBio = nodeFromProp.getDescription(); // Get raw description
                        const isDefaultPlaceholder = latestBio === "No description.";
                        // Target empty string if it's the default placeholder, otherwise use actual value or empty
                        const targetBio = isDefaultPlaceholder ? '' : latestBio || '';

                        // Update local tab state if it differs from the target
                        if (tab.bio !== targetBio) {
                            updatedTab.bio = targetBio;
                            tabChanged = true;
                        }
                        // --- End Refined Bio Sync Logic ---

                        // Sync Thumbnail
                        const latestThumb = nodeFromProp.getThumbnailSrc() || null;
                        if (tab.thumbnailSrc !== latestThumb) {
                            updatedTab.thumbnailSrc = latestThumb;
                            tabChanged = true;
                        }
                         // Sync Full Image Src (might not be needed directly in tab state unless used)
                         const latestImageSrc = nodeFromProp.getImageSrc() || null;
                         if (tab.imageSrc !== latestImageSrc) {
                             updatedTab.imageSrc = latestImageSrc;
                             tabChanged = true;
                         }
                         // Sync Aspect Ratio
                         const latestAspectRatio = nodeFromProp.getImageAspectRatio() || null;
                         if (tab.imageAspectRatio !== latestAspectRatio) {
                             updatedTab.imageAspectRatio = latestAspectRatio;
                             tabChanged = true;
                         }

                        if (tabChanged) {
                            needsUpdate = true;
                            return updatedTab;
                        }
                    } else {
                        // Node doesn't exist in props anymore? Maybe remove tab? (Optional)
                        // console.warn(`Node ${tab.nodeId} for tab not found in props.`);
                    }
                }
                return tab; // Return unchanged tab if no sync needed or not a node tab
            });

            // Only update state if any tab actually changed
            return needsUpdate ? updatedTabs : currentTabs;
        });
      } else {
        // TODO: Implement specific sync logic for left panel tabs (e.g., graph browser)
        // For now, maybe initialize with a placeholder tab if side is left?
        // Or perhaps the initial state should differ based on side?
        // Let's keep the default [{ type: 'home', isActive: true }] for now.
      }
    }, [nodes, editingTitle, side]); // Add side to dependency array
    // --- END: Effect to synchronize ---

    // --- Resize Handlers (Reordered definitions) ---
    const handleResizeMouseMove = useCallback((e) => {
      if (!isResizing.current) return;

      const currentX = e.clientX;
      const dx = currentX - resizeStartX.current;
      let newWidth;

      if (side === 'left') {
        newWidth = resizeStartWidth.current + dx;
      } else { // side === 'right'
        newWidth = resizeStartWidth.current - dx;
      }

      // Clamp width
      const maxWidth = window.innerWidth / 2;
      const clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(newWidth, maxWidth));
      
      setPanelWidth(clampedWidth);
    }, [side]); // Dependency on `side`

    const handleResizeMouseUp = useCallback(() => {
      if (isResizing.current) {
        isResizing.current = false;
        window.removeEventListener('mousemove', handleResizeMouseMove);
        window.removeEventListener('mouseup', handleResizeMouseUp);
        document.body.style.userSelect = ''; 
        document.body.style.cursor = ''; 

        try {
            const finalWidth = panelRef.current?.offsetWidth; // Get final width
            if (finalWidth) {
                // Save current width
                localStorage.setItem(`panelWidth_${side}`, JSON.stringify(finalWidth));
                // If it's not the default, save as last custom width
                if (finalWidth !== INITIAL_PANEL_WIDTH) {
                  setLastCustomWidth(finalWidth); // Update state
                  localStorage.setItem(`lastCustomPanelWidth_${side}`, JSON.stringify(finalWidth));
                }
            }
        } catch (error) {
            console.error(`Error saving panelWidth_${side} to localStorage:`, error);
        }
      }
    }, [side, handleResizeMouseMove]); // Now handleResizeMouseMove is defined above

    const handleResizeMouseDown = useCallback((e) => {
      e.preventDefault(); // Prevent text selection during drag
      e.stopPropagation(); // Stop propagation if needed
      isResizing.current = true;
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = panelRef.current?.offsetWidth || panelWidth; // Get current width accurately
      window.addEventListener('mousemove', handleResizeMouseMove);
      window.addEventListener('mouseup', handleResizeMouseUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }, [handleResizeMouseMove, handleResizeMouseUp]); // Dependencies are defined above

    // --- Double Click Handler ---
    const handleHeaderDoubleClick = useCallback((e) => {
      console.log('[Panel DblClick] Handler triggered');
      const target = e.target;

      // Check if the click originated within a draggable tab element
      if (target.closest('.panel-tab')) { 
        console.log('[Panel DblClick] Click originated inside a .panel-tab, exiting.');
        return;
      }
      
      // If we reach here, the click was on the header bar itself or empty space within it.
      console.log('[Panel DblClick] Click target OK (not inside a tab).');

      let newWidth;
      console.log('[Panel DblClick] Before toggle:', { currentWidth: panelWidth, lastCustom: lastCustomWidth });
      
      if (panelWidth === INITIAL_PANEL_WIDTH) {
        // Toggle to last custom width (if it's different)
        newWidth = (lastCustomWidth !== INITIAL_PANEL_WIDTH) ? lastCustomWidth : panelWidth; 
        console.log('[Panel DblClick] Was default, toggling to last custom (or current if same):', newWidth);
      } else {
        // Current width is custom, save it as last custom and toggle to default
        console.log('[Panel DblClick] Was custom, saving current as last custom:', panelWidth);
        setLastCustomWidth(panelWidth); // Update state
        try { // Separate try/catch for this specific save
          localStorage.setItem(`lastCustomPanelWidth_${side}`, JSON.stringify(panelWidth));
        } catch (error) {
          console.error(`Error saving lastCustomPanelWidth_${side} before toggle:`, error);
        }
        newWidth = INITIAL_PANEL_WIDTH;
        console.log('[Panel DblClick] Toggling to default:', newWidth);
      }

      if (newWidth !== panelWidth) {
        setIsAnimatingWidth(true);
        setPanelWidth(newWidth);
        try {
          localStorage.setItem(`panelWidth_${side}`, JSON.stringify(newWidth));
        } catch (error) {
          console.error(`Error saving panelWidth_${side} after double click:`, error);
        }
      } else {
        console.log('[Panel DblClick] Width did not change, no update needed.');
      }
    }, [panelWidth, lastCustomWidth, side]);

    // Effect for cleanup
    useEffect(() => {
      // Cleanup function to remove listeners if component unmounts while resizing
      return () => {
        if (isResizing.current) {
          window.removeEventListener('mousemove', handleResizeMouseMove);
          window.removeEventListener('mouseup', handleResizeMouseUp);
          document.body.style.userSelect = ''; 
          document.body.style.cursor = ''; 
        }
      };
    }, [handleResizeMouseMove, handleResizeMouseUp]);

    // <<< Add Effect to reset animation state after transition >>>
    useEffect(() => {
        let timeoutId = null;
        if (isAnimatingWidth) {
          // Set timeout matching the transition duration
          timeoutId = setTimeout(() => {
            setIsAnimatingWidth(false);
          }, 200); // Duration of width transition
        }
        // Cleanup the timeout if the component unmounts or state changes again
        return () => clearTimeout(timeoutId);
      }, [isAnimatingWidth]);
    // --- End Resize Handlers & related effects ---

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
        <div className="panel-content-inner home-tab" >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', flexWrap: 'nowrap' }}>
            {/* Project Title - Editable on Double Click */}
            {editingProjectTitle ? (
              <input
                ref={projectTitleInputRef}
                type="text"
                id="project-title-input"
                name="projectTitleInput"
                value={tempProjectTitle}
                onChange={(e) => setTempProjectTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitProjectTitleChange(); }}
                onBlur={commitProjectTitleChange}
                onFocus={() => onFocusChange?.(true)}
                style={{ fontFamily: 'inherit', fontSize: '1.1rem', fontWeight: 'bold', color: '#260000' }}
              />
            ) : (
              <h2
                style={{
                  margin: '0 10px 0 0', 
                  color: '#260000',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  userSelect: 'none'
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
            id="project-bio-textarea"
            name="projectBioTextarea"
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
                  borderRadius: NODE_CORNER_RADIUS,
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
        // Use the state value directly now, as useEffect synchronizes it
        const displayBio = activeTab.bio || '';
        const displayTitle = activeTab.title || 'Untitled';

        // Function to commit the title change (on blur or Enter key)
        const commitTitleChange = () => {
          const newName = tempTitle.trim();
          if (newName && newName !== activeTab.title) {
            // Update the node data
            onSaveNodeData(nodeId, { name: newName });
            // Update the tab's title in state immediately for responsiveness
            setTabs((prev) =>
              prev.map((tab) =>
                tab.nodeId === nodeId ? { ...tab, title: newName } : tab
              )
            );
          }
          setEditingTitle(false);
        };

        tabContent = (
          <div className="panel-content-inner node-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  id={`node-title-input-${nodeId}`}
                  name={`nodeTitleInput-${nodeId}`}
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitTitleChange(); }}
                  onBlur={commitTitleChange}
                  onFocus={() => onFocusChange?.(true)}
                  style={{ fontFamily: 'inherit' }}
                />
              ) : (
                <h3
                  style={{
                    margin: 0,
                    color: '#260000',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    userSelect: 'none'
                  }}
                  onDoubleClick={() => {
                    setEditingTitle(true);
                    setTempTitle(displayTitle);
                  }}
                >
                  <span style={{
                     display: 'inline-block',
                     maxWidth: '210px',
                     whiteSpace: 'normal',
                     overflowWrap: 'break-word',
                     verticalAlign: 'bottom'
                  }}>
                     {displayTitle}
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
              id={`node-bio-textarea-${nodeId}`}
              name={`nodeBioTextarea-${nodeId}`}
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
                userSelect: 'text'
              }}
              value={displayBio}
              onFocus={() => onFocusChange?.(true)}
              onBlur={() => onFocusChange?.(false)}
              onChange={(e) => handleBioChange(nodeId, e.target.value)}
              onKeyDown={(e) => {
                if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) {
                  e.stopPropagation();
                }
              }}
            />

            {nodeData.getImageSrc() && (
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
                  src={nodeData.getImageSrc()}
                  alt="Node"
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    objectFit: 'contain',
                    borderRadius: '6px'
                  }}
                />
              </div>
            )}
          </div>
        );
      }
    }

    // --- Positioning and Animation Styles based on side ---
    const positionStyle = side === 'left' ? { left: 0 } : { right: 0 };
    const transformStyle = side === 'left'
      ? (isExpanded ? 'translateX(0%)' : 'translateX(-100%)')
      : (isExpanded ? 'translateX(0%)' : 'translateX(100%)');

    // Dynamically build transition string
    const transitionStyle = `transform 0.2s ease${isAnimatingWidth ? ', width 0.2s ease' : ''}`;

    // --- Resize Handle Styles ---
    const handleStyle = {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: '5px', // Width of the handle
      cursor: 'col-resize',
      zIndex: 10000, // Above panel content, below toggle button maybe?
      backgroundColor: 'transparent', // Make it invisible initially
      // Add visual feedback on hover if desired
      // 'transition': 'background-color 0.2s ease',
    };
    if (side === 'left') {
      handleStyle.right = '-2px'; // Position slightly outside on the right
    } else { // side === 'right'
      handleStyle.left = '-2px'; // Position slightly outside on the left
    }

    return (
      <>
        {/* Pass side prop to ToggleButton */}
        <ToggleButton isExpanded={isExpanded} onClick={onToggleExpand} side={side} />

        {/* Main Sliding Panel Container */}
        <div
          ref={panelRef} // Assign ref here
          style={{
            position: 'fixed',
            top: HEADER_HEIGHT, 
            ...positionStyle, 
            bottom: 0, 
            width: `${panelWidth}px`, // Use state variable for width
            backgroundColor: '#bdb5b5',
            boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
            zIndex: 9999, 
            overflow: 'hidden', // Keep hidden to clip content
            display: 'flex',
            flexDirection: 'column',
            transform: transformStyle, 
            transition: transitionStyle, // Animate transform and width
          }}
        >
          {/* Resize Handle */}
          <div 
             style={handleStyle}
             onMouseDown={handleResizeMouseDown}
             // Add hover effect inline if needed
             // onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)'}
             // onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          />

          {/* Main Header Row Container */}
          <div 
            style={{
              height: 40,
              backgroundColor: '#716C6C',
              display: 'flex',
              alignItems: 'stretch',
              position: 'relative',
            }}
            onDoubleClick={handleHeaderDoubleClick}
          >
             {/* 1. Home Button (Fixed Left - RENDER ONLY IF EXPANDED) */}
             {isExpanded && (() => {
               const isActive = tabs[0]?.isActive;
               const bg = isActive ? '#bdb5b5' : '#979090';
               return (
                 <div
                   key="home"
                   style={{
                     width: 40,
                     height: 40,
                     // borderTopLeftRadius: '10px', // Removed rounding
                     borderTopRightRadius: 0,
                     borderBottomLeftRadius: 0,
                     borderBottomRightRadius: 0,
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     cursor: 'pointer',
                     backgroundColor: bg,
                     flexShrink: 0,
                     zIndex: 2
                   }}
                   onClick={() => activateTab(0)}
                 >
                   <Home size={20} color="#260000" />
                 </div>
               );
             })()}

            {/* 2. Scrollable Tab Area (RENDER ONLY IF EXPANDED) */}
            {isExpanded && (
              <div
                style={{
                  flexGrow: 1,
                  overflow: 'hidden',
                  position: 'relative',
                  height: '100%'
                }}
              >
                {/* Inner div that actually scrolls */}
                <div
                  ref={tabBarRef}
                  className="hide-scrollbar"
                  style={{
                    height: '100%', // Fill the scroll area container
                    display: 'flex',
                    alignItems: 'stretch',
                    paddingLeft: '10px', // <<< Increased left padding
                    paddingRight: '50px', // <<< Increased right padding
                    overflowX: 'auto', // Still needs to scroll horizontally
                    overflowY: 'hidden',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {/* Map ONLY node tabs (index > 0) */}
                  {tabs.slice(1).map((tab, index) => (
                      <DraggableTab
                        key={tab.nodeId} // Use nodeId as key
                        tab={tab}
                        index={index} // Pass relative index
                        moveTab={moveTab}
                        activateTab={activateTab}
                        closeTab={closeTab}
                      />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Conditionally Render Content */}
          <div style={{ 
            flex: 1, 
            overflow: 'auto',
            // Opacity/pointerEvents might be redundant if parent uses transform 
            // opacity: isExpanded ? 1 : 0, 
            // pointerEvents: isExpanded ? 'auto' : 'none',
            // transition: 'opacity 0.15s ease'
          }}>
            {tabContent}
          </div>
        </div>
      </>
    );
  }
);

export default Panel;