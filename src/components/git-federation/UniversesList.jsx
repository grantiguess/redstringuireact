import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown, Github, Upload, Download, X, Edit, Star, Save, Activity, Link, FileText } from 'lucide-react';
import SectionCard from './shared/SectionCard.jsx';

function buttonStyle(variant = 'outline') {
  const base = {
    border: '1px solid #260000',
    backgroundColor: 'transparent',
    color: '#260000',
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.15s',
    outline: 'none',
    boxShadow: 'none'
  };

  switch (variant) {
    case 'solid':
      return { ...base, backgroundColor: '#260000', color: '#fefefe' };
    case 'danger':
      return { ...base, borderColor: '#c62828', color: '#c62828' };
    case 'disabled':
      return { ...base, opacity: 0.5, cursor: 'not-allowed' };
    default:
      return base;
  }
}

function formatWhen(timestamp) {
  if (!timestamp) return 'Never';
  try {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  } catch {
    return 'Unknown';
  }
}

const UniversesList = ({
  universes = [],
  activeUniverseSlug,
  syncStatusMap = {},
  onCreateUniverse,
  onSwitchUniverse,
  onDeleteUniverse,
  onLinkRepo,
  onLinkLocalFile,
  onCreateLocalFile,
  onDownloadLocalFile,
  onDownloadRepoFile,
  onRemoveLocalFile,
  onRemoveRepoSource,
  onEditRepoSource,
  onSetMainRepoSource,
  onSaveRepoSource,
  onSetPrimarySource,
  onLoadFromLocal,
  onLoadFromRepo,
  isSlim = false
}) => {
  // No collapsing - active universe is always expanded, others show compact view
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [showLocalFileMenu, setShowLocalFileMenu] = useState(null); // Track which universe's menu is open
  const loadMenuRef = useRef(null);
  const localFileMenuRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (loadMenuRef.current && !loadMenuRef.current.contains(event.target)) {
        setShowLoadMenu(false);
      }
      if (localFileMenuRef.current && !localFileMenuRef.current.contains(event.target)) {
        setShowLocalFileMenu(null);
      }
    };

    if (showLoadMenu || showLocalFileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showLoadMenu, showLocalFileMenu]);

  const handleLoadFromLocalClick = () => {
    setShowLoadMenu(false);
    // Trigger file picker to load a .redstring file
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.redstring';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file && onLoadFromLocal) {
        onLoadFromLocal(file);
      }
    };
    input.click();
  };

  const handleLoadFromRepoClick = () => {
    setShowLoadMenu(false);
    if (onLoadFromRepo) {
      onLoadFromRepo();
    }
  };

  return (
    <SectionCard
      title="Universes"
      subtitle="Manage your knowledge spaces"
      actions={
        <div style={{ display: 'flex', gap: 6 }}>
          <div ref={loadMenuRef} style={{ position: 'relative' }}>
            <button 
              onClick={() => setShowLoadMenu(!showLoadMenu)}
              style={buttonStyle('outline')}
            >
              <Upload size={14} /> Load <ChevronDown size={12} />
            </button>
            {showLoadMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                backgroundColor: '#ffffff',
                border: '1px solid #260000',
                borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 1000,
                minWidth: 150
              }}>
                <button
                  onClick={handleLoadFromLocalClick}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#260000',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Download size={14} /> From Local File
                </button>
                <button
                  onClick={handleLoadFromRepoClick}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#260000',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Github size={14} /> Import From Repository
                </button>
              </div>
            )}
          </div>
          <button onClick={onCreateUniverse} style={buttonStyle('solid')}>
            <Plus size={14} /> New
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {universes.map((universe) => {
          const isActive = universe.slug === activeUniverseSlug;
          const nodeCount = universe.nodeCount || universe.raw?.nodeCount || 0;
          const connectionCount = universe.connectionCount || universe.raw?.connectionCount || 0;
          const graphCount = universe.graphCount || universe.raw?.graphCount || 0;

          return (
            <div
              key={universe.slug}
              style={{
                border: isActive ? '2px solid #7A0000' : '1px solid #260000',
                borderRadius: 8,
                backgroundColor: '#bdb5b5',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, color: '#260000' }}>{universe.name}</span>
                      {isActive && (
                        <span style={{
                          fontSize: '0.6rem',
                          padding: '2px 6px',
                          borderRadius: 10,
                          backgroundColor: '#7A0000',
                          color: '#ffffff',
                          fontWeight: 700
                        }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#555', marginTop: 2 }}>
                      {nodeCount} things · {connectionCount} connections · {graphCount} webs
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!isActive && (
                    <button onClick={() => onSwitchUniverse(universe.slug)} style={buttonStyle('outline')}>
                      Switch
                    </button>
                  )}
                  {universes.length > 1 && (
                    <button
                      onClick={() => onDeleteUniverse(universe.slug, universe.name)}
                      style={buttonStyle('danger')}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Content - Only for Active Universe */}
              {isActive && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 24 }}>
                  {/* Storage Slots */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#260000' }}>
                      Storage
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* Repository Slot */}
                      {universe.raw?.gitRepo?.linkedRepo ? (
                        <div
                          style={{
                            padding: 8,
                            backgroundColor: '#cfc6c6',
                            borderRadius: 6,
                            border: `2px solid ${universe.sourceOfTruth === 'git' ? '#7A0000' : '#979090'}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            maxWidth: '100%',
                            overflow: 'hidden'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Github size={14} />
                              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#260000' }}>
                                @{universe.raw.gitRepo.linkedRepo.user}/{universe.raw.gitRepo.linkedRepo.repo}
                              </span>
                              {universe.sourceOfTruth === 'git' && (
                                <span style={{
                                  fontSize: '0.6rem',
                                  padding: '2px 4px',
                                  borderRadius: 3,
                                  backgroundColor: 'rgba(122,0,0,0.1)',
                                  color: '#7A0000'
                                }}>
                              Source of Truth
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {onDownloadRepoFile && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDownloadRepoFile(universe.slug);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#7A0000',
                                cursor: 'pointer',
                                padding: '2px',
                                opacity: 0.7
                              }}
                              title="Download latest from Git repository"
                            >
                              <Download size={12} />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onRemoveRepoSource && universe.raw.gitRepo?.linkedRepo) {
                                onRemoveRepoSource(universe.slug, {
                                  user: universe.raw.gitRepo.linkedRepo.user,
                                  repo: universe.raw.gitRepo.linkedRepo.repo
                                });
                              }
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#d32f2f',
                              cursor: 'pointer',
                              padding: '2px',
                              opacity: 0.7
                            }}
                            title="Remove repository"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Git Status Information */}
                      {(() => {
                        const syncStatus = syncStatusMap[universe.slug];
                            const fileName = `universes/${universe.slug}/${universe.slug}.redstring`;
                            const statusText = syncStatus?.status || 'unknown';
                            const lastSync = syncStatus?.lastSync ? formatWhen(syncStatus.lastSync) : 'Never';
                            const hasError = syncStatus?.error;
                            const isLoading = syncStatus?.isLoading || syncStatus?.isSyncing;

                            return (
                              <div style={{
                                fontSize: '0.65rem',
                                color: '#444',
                                padding: '4px 0',
                                borderTop: '1px solid #979090',
                                marginTop: '4px',
                                paddingTop: '6px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                  <span style={{ fontWeight: 600, color: '#260000' }}>File:</span>
                                  <code style={{ fontSize: '0.6rem', background: '#e0e0e0', padding: '1px 3px', borderRadius: 2 }}>
                                    {fileName}
                                  </code>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                  <span style={{ fontWeight: 600, color: '#260000' }}>Status:</span>
                                  <span style={{
                                    color: hasError ? '#d32f2f' : isLoading ? '#ef6c00' : statusText === 'synced' ? '#7A0000' : '#666',
                                    fontWeight: 500
                                  }}>
                                    {isLoading ? '⟳ Loading...' : hasError ? '⚠ Error' : statusText}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontWeight: 600, color: '#260000' }}>Last sync:</span>
                                  <span style={{ color: '#666' }}>{lastSync}</span>
                                </div>
                                {hasError && (
                                  <div style={{
                                    marginTop: 4,
                                    padding: '3px 6px',
                                    backgroundColor: '#ffebee',
                                    borderRadius: 3,
                                    border: '1px solid #ffcdd2'
                                  }}>
                                    <span style={{ color: '#c62828', fontSize: '0.6rem' }}>
                                      {syncStatus.error}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(() => {
                              const isSourceOfTruth = universe.sourceOfTruth === 'git';
                              const hasOtherStorage = !!(universe.raw?.localFile?.enabled);
                              const canToggle = hasOtherStorage;
                              
                              return onSetPrimarySource && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (canToggle) {
                                      onSetPrimarySource(universe.slug, 'git');
                                    }
                                  }}
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '2px 6px',
                                    borderRadius: 6,
                                    cursor: canToggle ? 'pointer' : 'default',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    border: isSourceOfTruth ? '1px solid #7A0000' : '1px solid #7A0000',
                                    backgroundColor: isSourceOfTruth ? '#7A0000' : 'transparent',
                                    color: isSourceOfTruth ? '#bdb5b5' : '#7A0000',
                                    opacity: canToggle ? 1 : 0.7
                                  }}
                                  title={!canToggle ? 'Only storage option (must remain source of truth)' : isSourceOfTruth ? 'Currently source of truth' : 'Click to make source of truth'}
                                >
                                  <Star size={10} fill={isSourceOfTruth ? '#bdb5b5' : 'none'} />
                                  {isSourceOfTruth ? 'Source of Truth' : 'Not Source of Truth'}
                                </button>
                              );
                            })()}
                            {onSaveRepoSource && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSaveRepoSource(universe.slug);
                                }}
                                style={{
                                  ...buttonStyle('outline'),
                                  fontSize: '0.65rem',
                                  padding: '2px 6px',
                                  color: '#7A0000',
                                  borderColor: '#7A0000'
                                }}
                                title="Manual save"
                              >
                                <Save size={10} />
                                Save
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          padding: 12,
                          backgroundColor: 'transparent',
                          borderRadius: 6,
                          border: '2px dashed #979090',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <button
                            onClick={() => onLinkRepo && onLinkRepo(universe.slug)}
                            style={{
                              ...buttonStyle('outline'),
                              fontSize: '0.7rem',
                              color: '#666',
                              borderColor: '#979090'
                            }}
                          >
                            <Plus size={12} />
                            Add Repository
                          </button>
                        </div>
                      )}

                      {/* Local File Slot */}
                      {universe.raw?.localFile?.enabled ? (
                        <div
                          style={{
                            padding: 8,
                            backgroundColor: '#cfc6c6',
                            borderRadius: 6,
                            border: `2px solid ${universe.sourceOfTruth === 'local' ? '#7A0000' : '#979090'}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            maxWidth: '100%',
                            overflow: 'hidden'
                          }}
                        >
                          {(() => {
                            const localFile = universe.raw?.localFile || {};
                            const lastSavedLabel = localFile.lastSaved
                              ? formatWhen(localFile.lastSaved)
                              : localFile.hadFileHandle
                                ? 'Never'
                                : 'Not linked yet';
                            const lastSavedColor = localFile.hadFileHandle ? '#666' : '#7A0000';

                            return (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Save size={14} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#260000' }}>
                                      Local File
                                    </span>
                                    {universe.sourceOfTruth === 'local' && (
                                      <span style={{
                                        fontSize: '0.6rem',
                                        padding: '2px 4px',
                                        borderRadius: 3,
                                        backgroundColor: 'rgba(122,0,0,0.1)',
                                        color: '#7A0000'
                                      }}>
                                        Source of Truth
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {onDownloadLocalFile && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onDownloadLocalFile(universe.slug);
                                        }}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: '#7A0000',
                                          cursor: 'pointer',
                                          padding: '2px',
                                          opacity: 0.7
                                        }}
                                        title="Download/export local file"
                                      >
                                        <Download size={12} />
                                      </button>
                                    )}
                                    {onRemoveLocalFile && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onRemoveLocalFile(universe.slug);
                                        }}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: '#d32f2f',
                                          cursor: 'pointer',
                                          padding: '2px',
                                          opacity: 0.7
                                        }}
                                        title="Unlink local file"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div style={{
                                  fontSize: '0.65rem',
                                  color: '#444',
                                  padding: '4px 0',
                                  borderTop: '1px solid #979090',
                                  marginTop: '4px',
                                  paddingTop: '6px'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                    <span style={{ fontWeight: 600, color: '#260000' }}>File:</span>
                                    <span style={{ fontSize: '0.65rem' }}>
                                      {localFile.path || localFile.lastFilePath || `${universe.slug}.redstring`}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontWeight: 600, color: '#260000' }}>Last saved:</span>
                                    <span style={{ color: lastSavedColor }}>
                                      {lastSavedLabel}
                                    </span>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {(() => {
                                    const isSourceOfTruth = universe.sourceOfTruth === 'local';
                                    const hasOtherStorage = !!(universe.raw?.gitRepo?.linkedRepo);
                                    const canToggle = hasOtherStorage;

                                    return onSetPrimarySource && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (canToggle) {
                                            onSetPrimarySource(universe.slug, 'local');
                                          }
                                        }}
                                        style={{
                                          fontSize: '0.65rem',
                                          padding: '2px 6px',
                                          borderRadius: 6,
                                          cursor: canToggle ? 'pointer' : 'default',
                                          fontWeight: 600,
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          border: '1px solid #7A0000',
                                          backgroundColor: isSourceOfTruth ? '#7A0000' : 'transparent',
                                          color: isSourceOfTruth ? '#bdb5b5' : '#7A0000',
                                          opacity: canToggle ? 1 : 0.7
                                        }}
                                        title={!canToggle ? 'Only storage option (must remain source of truth)' : isSourceOfTruth ? 'Currently source of truth' : 'Click to make source of truth'}
                                      >
                                        <Star size={10} fill={isSourceOfTruth ? '#bdb5b5' : 'none'} />
                                        {isSourceOfTruth ? 'Source of Truth' : 'Not Source of Truth'}
                                      </button>
                                    );
                                  })()}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <div 
                          ref={showLocalFileMenu === universe.slug ? localFileMenuRef : null}
                          style={{
                            padding: 12,
                            backgroundColor: 'transparent',
                            borderRadius: 6,
                            border: '2px dashed #979090',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative'
                          }}
                        >
                          <button
                            onClick={() => setShowLocalFileMenu(showLocalFileMenu === universe.slug ? null : universe.slug)}
                            style={{
                              ...buttonStyle('outline'),
                              fontSize: '0.7rem',
                              color: '#666',
                              borderColor: '#979090'
                            }}
                          >
                            <Plus size={12} />
                            Add Local File
                            <ChevronDown size={10} />
                          </button>
                          
                          {showLocalFileMenu === universe.slug && (
                            <div style={{
                              position: 'absolute',
                              top: '100%',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              marginTop: 4,
                              backgroundColor: '#ffffff',
                              border: '1px solid #260000',
                              borderRadius: 6,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              zIndex: 1000,
                              minWidth: 160
                            }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowLocalFileMenu(null);
                                  // Create new file - this will trigger save dialog and link file handle
                                  if (onCreateLocalFile) {
                                    onCreateLocalFile(universe.slug);
                                  }
                                }}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: 'none',
                                  background: 'none',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  color: '#260000',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <FileText size={12} /> Create New File
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowLocalFileMenu(null);
                                  // Link existing file - trigger file picker
                                  if (onLinkLocalFile) {
                                    onLinkLocalFile(universe.slug);
                                  }
                                }}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: 'none',
                                  background: 'none',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  color: '#260000',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <Link size={12} /> Link Existing File
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Browser Storage Warning */}
                      {(!universe.raw?.gitRepo?.linkedRepo && !universe.raw?.localFile?.enabled) && (
                        <div style={{
                          padding: 8,
                          backgroundColor: 'rgba(122,0,0,0.08)',
                          borderRadius: 6,
                          border: '1px solid #7A0000',
                          fontSize: '0.7rem',
                          color: '#7A0000',
                          textAlign: 'center',
                          fontWeight: 500
                        }}>
                          ⚠ Data stored in browser only. Link long-term storage to save your data reliably.
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};

export default UniversesList;
