import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, Github, Upload, Download, X, Edit, Star, Save, Activity } from 'lucide-react';
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
    transition: 'all 0.15s'
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
  onDownloadLocalFile,
  onRemoveRepoSource,
  onEditRepoSource,
  onSetMainRepoSource,
  onSaveRepoSource,
  onSetPrimarySource,
  isSlim = false
}) => {
  // Track which universes are expanded
  const [expandedUniverses, setExpandedUniverses] = useState(new Set([activeUniverseSlug]));

  const toggleExpand = (slug) => {
    setExpandedUniverses((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  return (
    <SectionCard
      title="Universes"
      subtitle="Manage your knowledge spaces"
      actions={
        <button onClick={onCreateUniverse} style={buttonStyle('solid')}>
          <Plus size={14} /> New
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {universes.map((universe) => {
          const isActive = universe.slug === activeUniverseSlug;
          const isExpanded = expandedUniverses.has(universe.slug);

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
                <button
                  onClick={() => toggleExpand(universe.slug)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 0,
                    flex: 1,
                    outline: 'none'
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <ChevronDown 
                    size={16} 
                    style={{ 
                      transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 0.2s ease',
                      color: '#260000'
                    }} 
                  />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, color: '#260000' }}>{universe.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#555' }}>
                      Created {formatWhen(universe.createdAt)} · Updated {formatWhen(universe.updatedAt)}
                    </div>
                  </div>
                </button>
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

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 24 }}>
                  {/* Storage Info */}
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#260000', marginBottom: 6 }}>
                      Storage
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#555', marginBottom: 8 }}>
                      Primary: {universe.storage?.primary?.label || 'Browser cache'}
                    </div>
                  </div>

                  {/* Storage Slots */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#260000' }}>
                      Storage
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* Repository Slot */}
                      {universe.raw?.gitRepo?.linkedRepo ? (
                        <button
                          onClick={() => onSetPrimarySource && onSetPrimarySource(universe.slug, 'git')}
                          style={{
                            padding: 8,
                            backgroundColor: '#cfc6c6',
                            borderRadius: 6,
                            border: `2px solid ${universe.sourceOfTruth === 'git' ? '#2e7d32' : '#979090'}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            cursor: 'pointer',
                            width: '100%',
                            textAlign: 'left'
                          }}
                          title={universe.sourceOfTruth === 'git' ? 'Already primary' : 'Click to set as primary'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Github size={14} />
                              <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                                @{universe.raw.gitRepo.linkedRepo.user}/{universe.raw.gitRepo.linkedRepo.repo}
                              </span>
                              {universe.sourceOfTruth === 'git' && (
                                <span style={{
                                  fontSize: '0.6rem',
                                  padding: '2px 4px',
                                  borderRadius: 3,
                                  backgroundColor: '#e8f5e8',
                                  color: '#2e7d32'
                                }}>
                                  Primary
                                </span>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveRepoSource && onRemoveRepoSource(universe.slug, {
                                  user: universe.raw.gitRepo.linkedRepo.user,
                                  repo: universe.raw.gitRepo.linkedRepo.repo
                                });
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
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
                                  color: '#2e7d32',
                                  borderColor: '#2e7d32'
                                }}
                                title="Manual save"
                              >
                                <Save size={10} />
                                Save
                              </button>
                            )}
                          </div>
                        </button>
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
                        <button
                          onClick={() => onSetPrimarySource && onSetPrimarySource(universe.slug, 'local')}
                          style={{
                            padding: 8,
                            backgroundColor: '#cfc6c6',
                            borderRadius: 6,
                            border: `2px solid ${universe.sourceOfTruth === 'local' ? '#2e7d32' : '#979090'}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            cursor: 'pointer',
                            width: '100%',
                            textAlign: 'left'
                          }}
                          title={universe.sourceOfTruth === 'local' ? 'Already primary' : 'Click to set as primary'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Upload size={14} />
                              <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                                {universe.raw.localFile.path || `${universe.name || universe.slug}.redstring`}
                              </span>
                              {universe.sourceOfTruth === 'local' && (
                                <span style={{
                                  fontSize: '0.6rem',
                                  padding: '2px 4px',
                                  borderRadius: 3,
                                  backgroundColor: '#e8f5e8',
                                  color: '#2e7d32'
                                }}>
                                  Primary
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDownloadLocalFile && onDownloadLocalFile(universe.slug);
                              }}
                              style={{
                                ...buttonStyle('outline'),
                                fontSize: '0.65rem',
                                padding: '2px 6px',
                                color: '#2e7d32',
                                borderColor: '#2e7d32'
                              }}
                              title="Download file"
                            >
                              <Download size={10} />
                              Download
                            </button>
                          </div>
                        </button>
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
                            onClick={() => onLinkLocalFile && onLinkLocalFile(universe.slug)}
                            style={{
                              ...buttonStyle('outline'),
                              fontSize: '0.7rem',
                              color: '#666',
                              borderColor: '#979090'
                            }}
                          >
                            <Plus size={12} />
                            Add Local File
                          </button>
                        </div>
                      )}


                      {/* Browser Storage Warning */}
                      {(!universe.raw?.gitRepo?.linkedRepo && !universe.raw?.localFile?.enabled) && (
                        <div style={{
                          padding: 8,
                          backgroundColor: '#fff3e0',
                          borderRadius: 6,
                          border: '1px solid #ff9800',
                          fontSize: '0.7rem',
                          color: '#e65100',
                          textAlign: 'center'
                        }}>
                          Data stored in browser only. Link long-term storage to save your data reliably.
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
