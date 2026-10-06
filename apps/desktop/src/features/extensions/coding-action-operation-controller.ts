// 同步互斥先于 React 渲染生效，避免同一事件批次的重复操作覆盖草稿。
export class CodingActionOperationController {
  busy = false;
  async retry(dirty: boolean, confirmDiscard: () => boolean, reload: () => Promise<void>, onBusy: (busy: boolean) => void, onStart: () => void, onError: (cause: unknown) => void): Promise<void> {
    await this.run(async () => { if (!dirty || confirmDiscard()) await reload(); }, onBusy, onStart, onError);
  }
  async run(operation: () => Promise<void>, onBusy: (busy: boolean) => void, onStart: () => void, onError: (cause: unknown) => void): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    onBusy(true);
    onStart();
    try { await operation(); }
    catch (cause) { onError(cause); }
    finally { this.busy = false; onBusy(false); }
  }
}
