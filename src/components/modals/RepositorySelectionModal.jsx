import React, { useState, useEffect } from 'react';
import {
  Github,
  Search,
  Plus,
  RefreshCw,
  Book,
  Lock,
  Unlock,
  ExternalLink,
  Calendar,
  Users,
  ArrowUpDown,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  FileText
} from 'lucide-react';
import Modal from '../shared/Modal.jsx';
import { oauthFetch } from '../../services/bridgeConfig.js';
import { persistentAuth } from '../../services/persistentAuth.js';
import { gitFederationService } from '../../services/gitFederationService.js';

const RepositorySelectionModal = ({
  isOpen,
  onClose,
  onSelectRepository,
  onAddToManagedList,
  managedRepositories = []
}) => {
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('updated');
  const [sortOrder, setSortOrder] = useState('desc');
  const [authStatus, setAuthStatus] = useState(persistentAuth.getAuthStatus());
  const [expandedRepos, setExpandedRepos] = useState(new Set());
  const [discoveredUniverses, setDiscoveredUniverses] = useState({});

  useEffect(() => {
    if (isOpen && authStatus.isAuthenticated) {
      loadRepositories();
    }
  }, [isOpen, authStatus.isAuthenticated]);

  const loadRepositories = async () => {
    try {
      setLoading(true);
      setError(null);

      let token = await persistentAuth.getAccessToken();
      if (!token) {
        throw new Error('No access token available');
      }

      const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          try {
            await persistentAuth.refreshAccessToken?.();
            token = await persistentAuth.getAccessToken();
            if (!token) throw new Error('Authentication expired. Please sign in again.');
          } catch (e) {
            throw new Error('Authentication expired. Please sign in again.');
          }
        } else {
          throw new Error(`Failed to load repositories: ${response.status}`);
        }
      }

      const repos = await response.json();
      setRepositories(repos);
    } catch (err) {
      console.error('Failed to load repositories:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleRepoExpansion = async (repoId) => {
    const newExpanded = new Set(expandedRepos);

    if (newExpanded.has(repoId)) {
      newExpanded.delete(repoId);
      setExpandedRepos(newExpanded);
    } else {
      newExpanded.add(repoId);
      setExpandedRepos(newExpanded);

      // Discover universes if not already cached
      if (!discoveredUniverses[repoId]) {
        try {
          const repo = repositories.find(r => r.id === repoId);
          if (repo?.owner?.login && repo?.name) {
            const universes = await gitFederationService.discoverUniverses({
              user: repo.owner.login,
              repo: repo.name,
              authMethod: 'oauth'
            });

            setDiscoveredUniverses(prev => ({
              ...prev,
              [repoId]: universes || []
            }));
          }
        } catch (err) {
          console.warn('Failed to discover universes for repo:', repoId, err);
          setDiscoveredUniverses(prev => ({
            ...prev,
            [repoId]: []
          }));
        }
      }
    }
  };

  const filteredAndSortedRepos = repositories
    .filter(repo =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'updated':
          aVal = new Date(a.updated_at || 0);
          bVal = new Date(b.updated_at || 0);
          break;
        case 'created':
          aVal = new Date(a.created_at || 0);
          bVal = new Date(b.created_at || 0);
          break;
        case 'private':
          aVal = a.private ? 1 : 0;
          bVal = b.private ? 1 : 0;
          break;
        default:
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const handleSort = (newSortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  const isAlreadyManaged = (repo) => {
    return managedRepositories.some(r =>
      `${r.owner?.login || r.owner}/${r.name}` === `${repo.owner?.login || repo.owner}/${repo.name}`
    );
  };

  if (!authStatus.isAuthenticated) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Repository Selection" size="medium">
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '16px',
          color: '#666',
          padding: '40px'
        }}>
          <Github size={48} style={{ opacity: 0.3 }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>
              GitHub Authentication Required
            </div>
            <div style={{ fontSize: '0.9rem' }}>
              Please sign in with GitHub to browse your repositories
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Repositories" size="slim">
      {/* Compact search */}
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #979090',
        backgroundColor: '#bdb5b5',
        flexShrink: 0
      }}>
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              opacity: 0.6,
              color: '#260000'
            }}
          />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 8px 8px 28px',
              border: '1px solid #979090',
              borderRadius: '4px',
              fontSize: '0.8rem',
              backgroundColor: '#979090',
              color: '#260000',
              boxSizing: 'border-box',
              fontFamily: "'EmOne', sans-serif"
            }}
          />
        </div>

        {/* Compact controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.7rem'
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {[
              { key: 'updated', label: 'Recent' },
              { key: 'name', label: 'A-Z' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleSort(key)}
                style={{
                  background: sortBy === key ? '#260000' : 'none',
                  color: sortBy === key ? '#bdb5b5' : '#666',
                  border: '1px solid #260000',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontFamily: "'EmOne', sans-serif"
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#444' }}>
              {filteredAndSortedRepos.length}
            </span>
            <button
              onClick={loadRepositories}
              disabled={loading}
              style={{
                background: 'none',
                border: 'none',
                color: '#260000',
                cursor: loading ? 'not-allowed' : 'pointer',
                padding: '2px',
                opacity: loading ? 0.6 : 0.8
              }}
            >
              <RefreshCw size={10} style={{
                animation: loading ? 'spin 1s linear infinite' : 'none'
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: '#ffebee',
          borderBottom: '1px solid #f44336',
          color: '#d32f2f',
          fontSize: '0.75rem'
        }}>
          {error}
        </div>
      )}

      {/* Repository list */}
      <div style={{ flex: 1, overflow: 'auto', paddingTop: '8px', paddingBottom: '8px' }}>
        {loading ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px',
            color: '#666'
          }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginRight: '12px' }} />
            Loading repositories...
          </div>
        ) : filteredAndSortedRepos.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            padding: '60px',
            color: '#666',
            gap: '12px'
          }}>
            {repositories.length === 0 ? (
              <>
                <Book size={48} style={{ opacity: 0.3 }} />
                <div>No repositories found</div>
              </>
            ) : (
              <>
                <Search size={32} style={{ opacity: 0.3 }} />
                <div>No repositories match "{searchQuery}"</div>
              </>
            )}
          </div>
        ) : (
          filteredAndSortedRepos.map((repo) => {
            const isExpanded = expandedRepos.has(repo.id);
            const universes = discoveredUniverses[repo.id] || [];
            const hasUniverses = universes.length > 0;

            return (
            <div
              key={repo.id}
              style={{
                borderBottom: '1px solid #979090',
                backgroundColor: '#bdb5b5'
              }}
            >
              {/* Main repository row */}
              <div
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#979090';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={(e) => {
                  // Check if the click was on a button or link
                  if (e.target.closest('button') || e.target.closest('a')) {
                    return; // Don't handle if clicking on buttons/links
                  }
                  toggleRepoExpansion(repo.id);
                }}
              >
              {/* Compact repo header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flex: 1,
                  minWidth: 0
                }}>
                  <Github size={14} />
                  <span style={{
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {repo.name}
                  </span>
                  {repo.private && <Lock size={10} style={{ opacity: 0.6 }} />}
                  {isAlreadyManaged(repo) && (
                    <CheckCircle size={10} style={{ color: '#2e7d32' }} />
                  )}

                  {/* Universe count indicator */}
                  {isExpanded && universes.length > 0 && (
                    <span style={{
                      fontSize: '0.7rem',
                      color: '#666',
                      backgroundColor: '#979090',
                      padding: '1px 4px',
                      borderRadius: '2px'
                    }}>
                      {universes.length} universe{universes.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {/* Expand/collapse button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRepoExpansion(repo.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#260000',
                      cursor: 'pointer',
                      padding: '2px',
                      opacity: 0.6,
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '1'}
                    onMouseLeave={(e) => e.target.style.opacity = '0.6'}
                    title={isExpanded ? 'Hide universes' : 'Show universes'}
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  {repo.html_url && (
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        color: '#260000',
                        opacity: 0.6,
                        textDecoration: 'none',
                        padding: '2px'
                      }}
                      title="View on GitHub"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}

                  {isAlreadyManaged(repo) && onSelectRepository && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRepository(repo);
                      }}
                      style={{
                        background: '#2e7d32',
                        border: 'none',
                        color: '#bdb5b5',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        fontFamily: "'EmOne', sans-serif"
                      }}
                      title="Select repository"
                    >
                      Select
                    </button>
                  )}

                  {onAddToManagedList && !isAlreadyManaged(repo) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToManagedList(repo);
                        if (onSelectRepository) {
                          onSelectRepository(repo);
                        }
                      }}
                      style={{
                        background: '#260000',
                        border: 'none',
                        color: '#bdb5b5',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        fontFamily: "'EmOne', sans-serif"
                      }}
                      title="Add to your repository list"
                    >
                      <Plus size={10} />
                      Add
                    </button>
                  )}
                </div>
              </div>

              {/* Compact description */}
              {repo.description && (
                <div style={{
                  fontSize: '0.7rem',
                  color: '#444',
                  marginBottom: '6px',
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {repo.description}
                </div>
              )}

              {/* Compact metadata */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.65rem',
                color: '#666'
              }}>
                <span>Updated {formatDate(repo.updated_at)}</span>
                <span>{repo.owner?.login}</span>
              </div>
              </div>

              {/* Expandable universe section */}
              {isExpanded && (
                <div style={{
                  backgroundColor: '#979090',
                  borderTop: '1px solid #808080',
                  padding: '8px 12px'
                }}>
                  {discoveredUniverses[repo.id] === undefined ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.7rem',
                      color: '#666'
                    }}>
                      <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />
                      Scanning for universes...
                    </div>
                  ) : universes.length === 0 ? (
                    <div style={{
                      fontSize: '0.7rem',
                      color: '#666',
                      fontStyle: 'italic'
                    }}>
                      No universes found in this repository
                    </div>
                  ) : (
                    <div>
                      <div style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: '#260000',
                        marginBottom: '4px'
                      }}>
                        Found {universes.length} universe{universes.length === 1 ? '' : 's'}:
                      </div>
                      {universes.map((universe, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.65rem',
                            color: '#333',
                            marginBottom: index < universes.length - 1 ? '2px' : '0'
                          }}
                        >
                          <FileText size={8} />
                          <span style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {universe.name || universe.path || `Universe ${index + 1}`}
                          </span>
                          {universe.path && (
                            <span style={{ opacity: 0.6 }}>
                              ({universe.path})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })
        )}
      </div>

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </Modal>
  );
};

export default RepositorySelectionModal;