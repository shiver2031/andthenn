"use client";
import { startTransition, type FormHTMLAttributes } from "react";
/** Command errors are data, so keep native inputs intact until the user resolves them. */
export function PreservingForm({ action, children, ...props }: Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & { action: (data: FormData) => void }) {
  return <form {...props} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(() => action(data)); }}>{children}</form>;
}
