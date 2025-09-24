/**
 * Universe Manager Modal - Modal wrapper for UniverseManagementPanel
 *
 * This provides a modal interface for universe management that can be triggered
 * from anywhere in the application, including on startup for mobile/tablet users
 * who may need immediate access to universe management.
 */

import React, { useEffect, useRef } from 'react';
import UniverseManagementPanel from './UniverseManagementPanel.jsx';

const UniverseManagerModal = ({
  isOpen,
  onClose,
  showTitle = true,
  canCloseByBackdrop = true,
  priority = false // High priority for startup scenarios
}) => {
  const modalRef = useRef(null);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Focus management for accessibility
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  }, [isOpen]);

  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (event) => {
    if (canCloseByBackdrop && event.target === event.currentTarget && onClose) {
      onClose();
    }
  };

  const backdropStyles = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: priority ? 10000 : 1000, // Higher z-index for priority modals
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px'
  };

  return (
    <div
      style={backdropStyles}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={showTitle ? "universe-modal-title" : undefined}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'transparent',
          outline: 'none'
        }}
      >
        <UniverseManagementPanel
          isModal={true}
          onClose={onClose}
          showTitle={showTitle}
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            minWidth: '320px'
          }}
        />
      </div>
    </div>
  );
};

// Hook for using the modal
export const useUniverseModal = () => {
  const [isOpen, setIsOpen] = React.useState(false);

  const openModal = React.useCallback(() => setIsOpen(true), []);
  const closeModal = React.useCallback(() => setIsOpen(false), []);

  const UniverseModal = React.useCallback((props) => (
    <UniverseManagerModal
      isOpen={isOpen}
      onClose={closeModal}
      {...props}
    />
  ), [isOpen, closeModal]);

  return {
    isOpen,
    openModal,
    closeModal,
    UniverseModal
  };
};

export default UniverseManagerModal;