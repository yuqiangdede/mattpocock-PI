/** Electron 验证使用真实 DOM 与输入事件，避免直接改 React 内部状态。 */
export async function until<T>(read: () => T | false | null | undefined | Promise<T | false | null | undefined>): Promise<T> {
  const end = performance.now() + 15000;
  while (performance.now() < end) {
    const value = await read();
    if (value) return value;
    await new Promise<void>(requestAnimationFrame);
  }
  throw new Error(`Shortcut settings timed out: ${document.body.textContent?.slice(-1500)}`);
}

export function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

export async function click(label: string) {
  const button = await until(() => [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => (item.textContent?.trim() === label || item.getAttribute("aria-label") === label) && !item.disabled));
  button.focus();
  button.click();
}

export async function fill(label: string, value: string, insertText: (value: string) => Promise<unknown>) {
  const input = await until(() => [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")]
    .find(item => item.getAttribute("aria-label") === label || [...document.querySelectorAll("label")]
      .some(candidate => candidate.textContent?.trim() === label && (candidate.htmlFor === item.id || candidate.contains(item)))));
  input.focus();
  input.select();
  await insertText(value);
  await until(() => input.value === value);
}

export async function select(label: string, value: string, optionLabel = value) {
  const control = await until(() => document.querySelector<HTMLSelectElement | HTMLButtonElement>(`[aria-label="${label}"]`));
  if (control instanceof HTMLButtonElement) {
    control.click();
    const option = await until(() => [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
      .find(item => item.textContent?.trim() === optionLabel && !item.disabled));
    option.click();
    await until(() => !document.querySelector('[role="option"]'));
    return;
  }
  check([...control.options].some(option => option.value === value), `${label} 没有选项 ${value}`);
  control.value = value;
  control.dispatchEvent(new Event("change", { bubbles: true }));
  await until(() => control.value === value);
}
