import React, { useState, useEffect, useRef } from 'react';
import { HEADER_HEIGHT } from './constants';
import RedstringMenu from './RedstringMenu';

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
  setDebugMode 
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
      inputRef.current.focus();
      inputRef.current.select();
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
            value={tempTitle}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            size={Math.max(tempTitle.length, 10) + 4}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid #bdb5b5',
              color: '#bdb5b5',
              padding: '2px 5px',
              fontSize: '18px',
              fontFamily: 'inherit',
              textAlign: 'center',
              maxWidth: 'calc(100vw - 200px)',
              boxSizing: 'border-box'
            }}
            autoFocus
          />
        ) : (
          <span onDoubleClick={handleTitleDoubleClick} style={{ cursor: 'pointer', padding: '2px 5px' }}>
            {projectTitle}
          </span>
        )}
      </div>
    </header>
  );
};

export default Header;