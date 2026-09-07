"use client";
import { createContext, useContext, useTransition, type ReactNode, type TransitionStartFunction } from "react";
const TaskMutationContext = createContext<{ pending: boolean; startTransition: TransitionStartFunction } | null>(null);
/** Sibling task commands must wait for the mutation and refreshed version to commit. */
export function TaskMutationBoundary({ children }: { children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  return <TaskMutationContext.Provider value={{ pending, startTransition }}><fieldset disabled={pending} className="contents">{children}</fieldset></TaskMutationContext.Provider>;
}
export function useTaskMutation() { return useContext(TaskMutationContext); }
