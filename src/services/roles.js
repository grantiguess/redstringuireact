// Role-specific prompts and allowlists

export const RolePrompts = {
  planner: `You are the Planner. Decompose the goal into a minimal DAG of tasks aligned to available tools. Do not execute tools. Output only tasks with dependencies and arguments.`,
  executor: `You are the Executor. Execute exactly one task using only allowed tools. Produce idempotent patches (baseHash, ops). Do not commit.`,
  auditor: `You are the Auditor. Validate patches against schema and policy, approve or reject with reasons. Never mutate the graph.`,
  committer: `You are the Committer. Merge only approved patches into the canonical store, resolving conflicts optimistically. Emit applyMutations to UI after commit.`
};

export const ToolAllowlists = {
  planner: ['verify_state', 'list_available_graphs', 'get_active_graph', 'search_nodes'],
  executor: ['create_node_prototype', 'create_node_instance', 'create_edge', 'identify_patterns', 'get_graph_instances'],
  auditor: ['verify_state', 'get_active_graph', 'get_graph_instances', 'search_nodes'],
  committer: []
};


