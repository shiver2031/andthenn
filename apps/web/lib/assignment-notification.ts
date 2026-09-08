/** Snapshot assignment context so the notification remains useful after later edits. */
export function assignmentNotification(assigner: string, task: { name: string; dueAt: Date | string; priority: string }, timezone = "Asia/Kolkata") {
  const due = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(task.dueAt));
  return `${assigner} assigned you: "${task.name}"\nDue: ${due} (${timezone})\nPriority: ${task.priority}`;
}
