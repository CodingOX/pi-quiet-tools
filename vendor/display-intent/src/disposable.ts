export type CleanupCallback = () => void;

/** Runtime-local cleanup registry. One scope belongs to one ExtensionAPI. */
export class DisposableScope {
  private cleanupCallbacks: CleanupCallback[] = [];
  private disposed = false;

  registerCleanup(callback: CleanupCallback): void {
    if (this.disposed) {
      callback();
      return;
    }
    this.cleanupCallbacks.push(callback);
  }

  registerTimer(timer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): void {
    this.registerCleanup(() => clearInterval(timer as ReturnType<typeof setInterval>));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let index = this.cleanupCallbacks.length - 1; index >= 0; index -= 1) {
      try {
        this.cleanupCallbacks[index]();
      } catch (cleanupError) {
        void cleanupError;
      }
    }
    this.cleanupCallbacks = [];
  }

  getCleanupCount(): number {
    return this.cleanupCallbacks.length;
  }
}

export function createDisposableScope(): DisposableScope {
  return new DisposableScope();
}
