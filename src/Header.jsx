import React, { useState, useEffect, useRef } from 'react';
import { HEADER_HEIGHT } from './constants';
import RedstringMenu from './RedstringMenu';
import { Bookmark } from 'lucide-react';

// Import all logo states
import logo1 from './assets/redstring_button/header_logo_1.svg';
import logo2 from './assets/redstring_button/header_logo_2.svg';
import logo3 from './assets/redstring_button/header_logo_3.svg';
import logo4 from './assets/redstring_button/header_logo_4.svg';
import logo5 from './assets/redstring_button/header_logo_5.svg';
import logo6 from './assets/redstring_button/header_logo_6.svg';
import logo7 from './assets/redstring_button/header_logo_7.svg';

const Header = ({ 
  projectTitle, 
  onTitleChange, 
  onEditingStateChange, 
  // Receive debug props
  debugMode, 
  setDebugMode,
  bookmarkActive = false,
  onBookmarkToggle,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentLogoIndex, setCurrentLogoIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  // Keep local editing state, but text state is now props
  const [isEditing, setIsEditing] = useState(false);
  const [tempTitle, setTempTitle] = useState(projectTitle); // Local temp title for editing
  const inputRef = useRef(null);

  const logos = [logo1, logo2, logo3, logo4, logo5, logo6, logo7];

  // Preload images
  useEffect(() => {
    const preloadImages = async () => {
      const imagePromises = logos.map(src => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.src = src;
          img.onload = resolve;
          img.onerror = reject;
        });
      });

      try {
        await Promise.all(imagePromises);
        setImagesLoaded(true);
      } catch (error) {
        console.error('Error preloading images:', error);
      }
    };

    preloadImages();
  }, []);

  // Update temp title if prop changes while not editing
  useEffect(() => {
    if (!isEditing) {
      setTempTitle(projectTitle);
    }
  }, [projectTitle, isEditing]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      const inputElement = inputRef.current;

      const updateInputWidth = () => {
        const text = inputElement.value;
        const style = window.getComputedStyle(inputElement);
        const tempSpan = document.createElement('span');
        tempSpan.style.font = style.font;
        tempSpan.style.letterSpacing = style.letterSpacing;
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.position = 'absolute';
        tempSpan.style.whiteSpace = 'pre';
        tempSpan.innerText = text || ' ';
        document.body.appendChild(tempSpan);
        const textWidth = tempSpan.offsetWidth;
        document.body.removeChild(tempSpan);

        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingRight = parseFloat(style.paddingRight) || 0;
        const borderLeft = parseFloat(style.borderLeftWidth) || 0;
        const borderRight = parseFloat(style.borderRightWidth) || 0;
        let newWidth = textWidth + paddingLeft + paddingRight + borderLeft + borderRight;
        
        // Min width specific to header input, can be adjusted
        const minWidth = 50; 
        if (newWidth < minWidth) {
          newWidth = minWidth;
        }
        // Max width consideration if needed, though input has maxWidth style already
        // const maxWidth = parseFloat(style.maxWidth) || Infinity;
        // if (newWidth > maxWidth) newWidth = maxWidth;

        inputElement.style.width = `${newWidth}px`;
      };

      inputElement.focus();

      if (inputElement.value === '') {
        const originalSelectionStart = inputElement.selectionStart;
        const originalSelectionEnd = inputElement.selectionEnd;
        inputElement.value = '\u200B'; // Insert zero-width space
        inputElement.setSelectionRange(0, 0); // Move caret to start
        // Schedule to remove the zero-width space and restore selection or select all
        setTimeout(() => {
          if (inputElement.value === '\u200B') { // Only if it's still our ZWS
            inputElement.value = '';
            inputElement.focus(); // Re-focus after clearing
            inputElement.setSelectionRange(0, 0); // Caret at start for empty
          } else {
            // If user typed something super fast, try to restore original selection
            // or just select all if that seems more appropriate.
            // For now, if modified, we assume the user typed and don't interfere.
            // Or, simply re-select all if that's the desired empty-field behavior.
            // inputElement.select();
          }
          // Ensure caret is visible after this manipulation by focusing again if needed
          // although it should already be focused.
        }, 0);
      } else {
        inputElement.select(); // Select all if not empty
      }

      updateInputWidth(); // Initial width set

      inputElement.addEventListener('input', updateInputWidth);

      return () => {
        inputElement.removeEventListener('input', updateInputWidth);
        if (inputElement) {
          inputElement.style.width = 'auto'; // Reset width
        }
      };
    } else if (inputRef.current) {
        inputRef.current.style.width = 'auto'; // Reset if editing becomes false
    }
  }, [isEditing]);

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const animateFrames = async (opening) => {
    if (isAnimating || !imagesLoaded) return;
    setIsAnimating(true);
    
    const frames = opening ? [0, 1, 2, 3, 4, 5, 6] : [6, 5, 4, 3, 2, 1, 0];
    
    for (const frame of frames) {
      setCurrentLogoIndex(frame);
      await sleep(30); // 30ms per frame as you preferred
    }
    
    setIsAnimating(false);
    setIsMenuOpen(opening);
  };

  const toggleMenu = async () => {
    if (isAnimating) return;
    
    const opening = !isMenuOpen;
    setIsMenuOpen(opening); 
    await animateFrames(opening);
  };

  const handleTitleDoubleClick = () => {
    setTempTitle(projectTitle); // Start editing with current prop value
    setIsEditing(true);
    onEditingStateChange?.(true);
  };

  const handleTitleChange = (event) => {
    setTempTitle(event.target.value); // Update local temp title
  };

  // Commit changes using the callback prop
  const commitChange = () => {
      setIsEditing(false);
      onEditingStateChange?.(false);
      onTitleChange(tempTitle); // Call the callback passed from NodeCanvas
  };

  const handleTitleBlur = () => {
    commitChange();
  };

  const handleTitleKeyDown = (event) => {
    if (event.key === 'Enter') {
      commitChange();
      event.target.blur();
    }
    if (event.key === 'Escape') {
      setIsEditing(false); // Discard changes on Escape
      setTempTitle(projectTitle); // Reset temp title
      onEditingStateChange?.(false);
      event.target.blur();
    }
  };

  // Don't render until images are loaded
  if (!imagesLoaded) {
    return (
      <header
          style={{
            height: `${HEADER_HEIGHT}px`,
            backgroundColor: '#260000',
            color: '#bdb5b5',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            position: 'relative',
            zIndex: 1000,
          }}
        >
          {/* The button stays in the header */}
          <img 
            src={logos[currentLogoIndex]}
            alt=""
            style={{
              height: `${HEADER_HEIGHT}px`,
              width: `${HEADER_HEIGHT}px`,
              objectFit: 'contain',
              cursor: isAnimating ? 'default' : 'pointer',
            }}
            onClick={toggleMenu}
          />
          
          {/* Pass debug props to RedstringMenu here */}
          <RedstringMenu 
            isOpen={isMenuOpen} 
            debugMode={debugMode} 
            setDebugMode={setDebugMode} 
          />
      </header>
    );
  }

  return (
    <header
      style={{
        height: `${HEADER_HEIGHT}px`,
        backgroundColor: '#260000',
        color: '#bdb5b5',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10000,
      }}
    >
      {/* Menu button container with explicit height */}
      <div style={{ 
        position: 'relative',
        height: `${HEADER_HEIGHT}px`,
        display: 'flex',
        alignItems: 'center'
      }}>
        <img 
          src={logos[currentLogoIndex]}
          alt=""
          style={{
            height: `${HEADER_HEIGHT}px`,
            width: `${HEADER_HEIGHT}px`,
            objectFit: 'contain',
            cursor: isAnimating ? 'default' : 'pointer',
            display: 'block' // Prevent any inline spacing issues
          }}
          onClick={toggleMenu}
        />
        {/* Pass debug props to RedstringMenu here */}
        <RedstringMenu 
          isOpen={isMenuOpen} 
          debugMode={debugMode} 
          setDebugMode={setDebugMode} 
        />
      </div>

      {/* Title container - adjust padding */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        color: '#bdb5b5',
        fontSize: '18px',
        userSelect: isEditing ? 'auto' : 'none',
        textAlign: 'center',
        padding: '0 5px' // Reduce horizontal padding
      }}>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="editable-title-input"
            value={tempTitle}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            spellCheck="false"
            style={{
              color: '#bdb5b5',
              textAlign: 'center',
              maxWidth: 'calc(100vw - 200px)',
              boxSizing: 'border-box'
            }}
            autoFocus
          />
        ) : (
          <span 
            onDoubleClick={handleTitleDoubleClick} 
            style={{ 
              cursor: 'pointer', 
              padding: '2px 5px',
              fontWeight: 'bold'
            }}
          >
            {projectTitle}
          </span>
        )}
      </div>

      {/* Bookmark Icon Button */}
      <div
        title={bookmarkActive ? 'Remove Bookmark' : 'Add Bookmark'}
        style={{
          position: 'absolute',
          right: '0',
          height: `${HEADER_HEIGHT}px`,
          width: `${HEADER_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
        onClick={() => {
          // Log the state received via props just before calling the callback
          console.log('[Header Bookmark Click] bookmarkActive prop:', bookmarkActive);
          onBookmarkToggle(); // Call the callback passed from NodeCanvas
        }}
      >
        <Bookmark
          size={28}
          color="#7A0000"
          fill={bookmarkActive ? '#7A0000' : 'none'}
          strokeWidth={3}
        />
      </div>
    </header>
  );
};

export default Header;