"use client";
import { useTaskMutation } from "./task-mutation-boundary";
import { startTransition, type FormHTMLAttributes } from "react";
/** Command errors are data, so keep native inputs intact until the user resolves them. */
export function PreservingForm({ action, children, ...props }: Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & { action: (data: FormData) => void }) {
  const mutation = useTaskMutation();
  return <form {...props} onSubmit={(event) => { event.preventDefault(); if (mutation?.pending) return; const data = new FormData(event.currentTarget); (mutation?.startTransition ?? startTransition)(() => action(data)); }}>{children}</form>;
}
