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

const Header = ({ onEditingStateChange }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentLogoIndex, setCurrentLogoIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  // Add state for editable title
  const [headerText, setHeaderText] = useState('Untitled');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null); // Ref to focus the input

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

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select(); // Select text for easy replacement
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
    setIsEditing(true);
    onEditingStateChange?.(true);
  };

  const handleTitleChange = (event) => {
    setHeaderText(event.target.value);
  };

  const handleTitleBlur = () => {
    setIsEditing(false);
    onEditingStateChange?.(false);
    if (!headerText.trim()) {
      setHeaderText('Untitled');
    }
  };

  const handleTitleKeyDown = (event) => {
    if (event.key === 'Enter') {
      setIsEditing(false);
      onEditingStateChange?.(false);
      if (!headerText.trim()) {
        setHeaderText('Untitled');
      }
      event.target.blur();
    }
    if (event.key === 'Escape') {
      setIsEditing(false);
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
          
          {/* Menu is rendered separately */}
          <RedstringMenu isOpen={isMenuOpen} />
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
        zIndex: 1001,
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
        <RedstringMenu isOpen={isMenuOpen} />
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
            value={headerText}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            size={Math.max(headerText.length, 10) + 4}
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
          <span onDoubleClick={handleTitleDoubleClick} style={{ cursor: 'pointer', padding: '2px 5px' }}> { /* Reduce horizontal padding */ }
            {headerText}
          </span>
        )}
      </div>
    </header>
  );
};

export default Header;