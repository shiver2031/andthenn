"use server";
import { closeProject, confirmDeliverable, queueProjectArchive, seedClosureChecklist, toggleClosureChecklistItem } from "./commercial/actions";
import { revalidatePath } from "next/cache";
import { isResourceId } from "../../lib/resource-access";

export async function runProjectCommand(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const projectId = String(form.get("projectId") ?? "");
  if (!isResourceId(projectId)) return { error: "Project unavailable." };
  try {
    switch (form.get("command")) {
      case "confirm-output": await confirmDeliverable(form); break;
      case "prepare": await seedClosureChecklist(form); break;
      case "check": await toggleClosureChecklistItem(form); break;
      case "archive": await queueProjectArchive(form); break;
      case "close": await closeProject(form); break;
      default: return { error: "Choose a project action." };
    }
    for (const path of [`/projects/${projectId}`, "/projects", "/home", "/reports"]) revalidatePath(path);
    return { success: "Project updated." };
  } catch (error) {
    return { error: error instanceof Error && !error.message.startsWith("Failed query:") ? error.message : "Unable to update the project. Reload and retry." };
  }
}
