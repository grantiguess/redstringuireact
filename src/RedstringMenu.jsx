import React, { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import './RedstringMenu.css';

const RedstringMenu = ({ isOpen }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const menuItems = ['File', 'Edit', 'View', 'Help'];

  useEffect(() => {
    if (isOpen) {
      setIsExiting(false);
      setShouldRender(true);
    } else {
      setIsExiting(true);
      // Wait for animation to complete before removing from DOM
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 150); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div className={`menu-container ${isExiting ? 'exiting' : 'entering'}`}>
        <div className="menu-items">
        {menuItems.map((item, index) => (
            <button key={index} className="menu-item">
            <span>{item}</span>
            <ChevronRight 
                size={16} 
                className="menu-item-chevron"
            />
            </button>
        ))}
        </div>
    </div>
  );
};

export default RedstringMenu;