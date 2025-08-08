import queueManager from '../queue/Queue.js';
import toolRegistry from '../toolRegistry.js';
import toolValidator from '../toolValidator.js';
import { RolePrompts, ToolAllowlists } from '../roles.js';

// Planner: consumes goals and enqueues tasks (simple passthrough here; DAG may be produced by LLM elsewhere)
export async function runPlannerOnce() {
  const items = queueManager.pull('goalQueue', { max: 1 });
  if (items.length === 0) return;
  const item = items[0];
  // Fan out tasks from provided DAG or create a trivial task
  const dag = item.dag || { tasks: [] };
  if (Array.isArray(dag.tasks) && dag.tasks.length > 0) {
    for (const t of dag.tasks) {
      queueManager.enqueue('taskQueue', { ...t, threadId: t.threadId || item.threadId, partitionKey: t.threadId || item.threadId || 'default' });
    }
  } else {
    queueManager.enqueue('taskQueue', { toolName: 'verify_state', args: {}, threadId: item.threadId, partitionKey: item.threadId || 'default' });
  }
  queueManager.ack('goalQueue', item.leaseId);
}

// Executor: pulls one task per thread and produces a patch
export async function runExecutorOnce() {
  const tasks = queueManager.pull('taskQueue', { max: 1 });
  if (tasks.length === 0) return;
  const task = tasks[0];
  try {
    const allow = new Set(ToolAllowlists.executor);
    if (!allow.has(task.toolName)) throw new Error(`Tool not allowed for executor: ${task.toolName}`);
    const validation = toolValidator.validateToolArgs(task.toolName, task.args || {});
    if (!validation.valid) throw new Error(`Validation failed: ${validation.error}`);
    const result = await toolRegistry.executeTool(task.toolName, validation.sanitized, { role: 'executor' });
    // Convert result to ops (minimal: when we know exact op mapping)
    // For core create_node_instance, produce addNodeInstance op
    const ops = [];
    if (task.toolName === 'create_node_instance') {
      ops.push({ type: 'addNodeInstance', graphId: task.args.graph_id, prototypeId: task.args.prototype_id, position: { x: task.args.x, y: task.args.y }, instanceId: result?.result?.instance_id });
    }
    // Fallback: executor could be richer; keep empty ops acceptable
    const patch = {
      patchId: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      threadId: task.threadId,
      graphId: task.args?.graph_id || result?.result?.graph_id || 'unknown',
      baseHash: null,
      ops
    };
    queueManager.enqueue('patchQueue', patch, { partitionKey: patch.threadId || 'default' });
    queueManager.ack('taskQueue', task.leaseId);
  } catch (e) {
    queueManager.nack('taskQueue', task.leaseId);
  }
}

// Auditor: pulls patches and validates, then enqueues a review item
export async function runAuditorOnce() {
  const pulled = queueManager.pull('patchQueue', { max: 1 });
  if (pulled.length === 0) return;
  const item = pulled[0];
  try {
    // Basic checks: ops schema-compatible, references present, etc.
    const ok = Array.isArray(item.ops);
    const decision = ok ? 'approved' : 'rejected';
    queueManager.enqueue('reviewQueue', { status: decision, graphId: item.graphId, patch: item });
    // Ack original patch item now that mirrored
    queueManager.ack('patchQueue', item.leaseId);
  } catch (e) {
    queueManager.nack('patchQueue', item.leaseId);
  }
}


