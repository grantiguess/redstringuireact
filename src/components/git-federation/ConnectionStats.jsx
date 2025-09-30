import React from 'react';
import {
  GitBranch,
  RefreshCw,
  Save,
  CheckCircle,
  AlertCircle,
  Clock,
  Github,
  Cloud
} from 'lucide-react';

const STATUS_COLORS = {
  success: '#2e7d32',
  warning: '#ef6c00',
  error: '#c62828',
  info: '#1565c0'
};

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

const ConnectionStats = ({ universe, syncStatus, isSlim = false }) => {
  const sync = universe.sync || {};
  const engine = sync.engine || syncStatus || {};

  const cards = [];

  cards.push({
    title: 'Sync State',
    value: sync.label || 'Unknown',
    tone: sync.tone || STATUS_COLORS.info,
    description: sync.description || '',
    icon: <GitBranch size={14} />
  });

  cards.push({
    title: 'Pending Commits',
    value: typeof sync.pendingCommits === 'number' ? sync.pendingCommits : '—',
    tone: sync.pendingCommits > 0 ? STATUS_COLORS.warning : STATUS_COLORS.success,
    description: sync.pendingCommits > 0 ? 'Changes queued for the next push.' : 'Working tree clean.',
    icon: sync.pendingCommits > 0 ? <RefreshCw size={14} /> : <Save size={14} />
  });

  cards.push({
    title: 'Engine Health',
    value: sync.isHealthy === false ? 'Degraded' : (sync.isHealthy === true ? 'Healthy' : 'Unknown'),
    tone: sync.isHealthy === true ? STATUS_COLORS.success : (sync.isHealthy === false ? STATUS_COLORS.error : STATUS_COLORS.info),
    description: sync.isInBackoff ? 'Engine is backing off after repeated failures.' : (sync.isHealthy === true ? 'Background commits available.' : 'Monitoring background sync status.'),
    icon: sync.isHealthy === true ? <CheckCircle size={14} color={STATUS_COLORS.success} /> : <AlertCircle size={14} color={sync.isHealthy === false ? STATUS_COLORS.error : STATUS_COLORS.warning} />
  });

  cards.push({
    title: 'Last Sync',
    value: sync.lastSync ? formatWhen(sync.lastSync) : 'Never',
    tone: STATUS_COLORS.info,
    description: engine.lastCommitTime ? `Last commit at ${formatWhen(engine.lastCommitTime)}` : 'No commits recorded yet.',
    icon: <Clock size={14} />
  });

  cards.push({
    title: 'Source of Truth',
    value: universe.sync?.sourceOfTruth || universe.sourceOfTruth || 'unknown',
    tone: universe.sourceOfTruth === 'git' ? STATUS_COLORS.success : universe.sourceOfTruth === 'local' ? STATUS_COLORS.warning : STATUS_COLORS.info,
    description: universe.sourceOfTruth === 'git'
      ? 'Git repository is primary.'
      : universe.sourceOfTruth === 'local'
        ? 'Local file is primary. Git operates as backup.'
        : 'Browser cache currently holds the latest state.',
    icon: universe.sourceOfTruth === 'git'
      ? <Github size={14} />
      : universe.sourceOfTruth === 'local'
        ? <Save size={14} />
        : <Cloud size={14} />
  });

  if (sync.consecutiveErrors > 0) {
    cards.push({
      title: 'Error Count',
      value: sync.consecutiveErrors,
      tone: STATUS_COLORS.error,
      description: sync.lastErrorTime ? `Last error at ${formatWhen(sync.lastErrorTime)}` : 'Recent sync errors detected.',
      icon: <AlertCircle size={14} color={STATUS_COLORS.error} />
    });
  }

  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: isSlim ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {cards.map((card, idx) => (
        <div
          key={`${card.title}-${idx}`}
          style={{
            border: `1px solid ${card.tone}`,
            backgroundColor: 'rgba(255,255,255,0.3)',
            borderRadius: 8,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minHeight: 80
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: '#260000', fontWeight: 700 }}>{card.title}</div>
            {card.icon || null}
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: card.tone }}>{card.value}</div>
          {card.description && (
            <div style={{ fontSize: '0.7rem', color: '#444' }}>{card.description}</div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ConnectionStats;
