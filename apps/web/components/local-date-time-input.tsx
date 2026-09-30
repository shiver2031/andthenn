"use client";

import { useSyncExternalStore, type InputHTMLAttributes } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Wait for the browser timezone before rendering a local date and its bounds. */
export function LocalDateTimeInput({ defaultValue, max, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "defaultValue" | "max"> & { defaultValue?: string | undefined; max?: string | undefined }) {
  const ready = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return <input {...props} key={String(ready)} type="datetime-local" disabled={!ready || props.disabled} defaultValue={ready && defaultValue ? localDateTime(defaultValue) : ""} max={ready && max ? localDateTime(max) : undefined}/>;
}
