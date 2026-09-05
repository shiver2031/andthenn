"use server";
import { designateCompletionReviewer, confirmTaskCompletion, moveTask, reopenTask, requestTaskCompletion, updateTaskStatus } from "./actions";

export async function runTaskCommand(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  try {
    switch (form.get("command")) {
      case "designate": await designateCompletionReviewer(form); break;
      case "status": await updateTaskStatus(form); break;
      case "request": await requestTaskCompletion(form); break;
      case "confirm": await confirmTaskCompletion(form); break;
      case "reopen": await reopenTask(form); break;
      case "phase": await moveTask(form); return { success: "Task phase updated." };
      default: return { error: "Choose a task action." };
    }
    return { success: "Task updated." };
  } catch (error) { return { error: error instanceof Error && !error.message.startsWith("Failed query:") ? error.message : "Unable to update task. Retry shortly." }; }
}
