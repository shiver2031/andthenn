/** Serialize local date/time controls in the browser, where their timezone is known. */
export function browserFormData(form: HTMLFormElement) {
  const data = new FormData(form);
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type="datetime-local"][name]')) {
    if (!input.disabled && input.value) data.set(input.name, new Date(input.value).toISOString());
  }
  return data;
}
