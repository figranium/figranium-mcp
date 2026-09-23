export interface WorkflowBoundaryIssue {
  index: number;
  message: string;
}

type ActionWithType = { type: string };

export function getWorkflowBoundaryIssues(actions: ActionWithType[]): WorkflowBoundaryIssue[] {
  const issues: WorkflowBoundaryIssue[] = [];
  const firstAction = actions[0];
  const lastAction = actions.at(-1);

  if (firstAction?.type === 'wait') {
    issues.push({
      index: 0,
      message: "Timed Wait cannot be the first action. It would delay every run without waiting for a concrete event; use the task-level wait field for an initial delay.",
    });
  }

  if (firstAction?.type === 'navigate') {
    issues.push({
      index: 0,
      message: "Navigate To cannot be the first action. Set the task-level url instead so the task's initial destination is explicit.",
    });
  }

  if (lastAction?.type === 'get_content') {
    issues.push({
      index: actions.length - 1,
      message: "Get Content cannot be the final action. Its value must be consumed by a later action; use extractionScript for final structured output.",
    });
  }

  return issues;
}
