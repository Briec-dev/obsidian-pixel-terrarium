export interface FixedStepLoopOptions {
  intervalMs: number;
  maxDeltaMs?: number;
  maxStepSec?: number;
  canRun: () => boolean;
  onBeforeStart?: () => void;
  onStep: (stepSec: number) => void;
}

/**
 * Shared fixed-cadence requestAnimationFrame loop that caps delta spikes,
 * skips work below intervalMs, and guarantees RAF termination when paused.
 */
export class FixedStepLoop {
  private rafId: number | null = null;
  private lastFrameMs = 0;
  private frameAccumMs: number;
  private readonly maxDeltaMs: number;
  private readonly maxStepSec: number;

  constructor(private readonly options: FixedStepLoopOptions) {
    this.frameAccumMs = options.intervalMs;
    this.maxDeltaMs = options.maxDeltaMs ?? 100;
    this.maxStepSec = options.maxStepSec ?? 0.1;
  }

  isRunning(): boolean {
    return this.rafId !== null;
  }

  sync(): void {
    if (this.options.canRun()) {
      if (this.rafId === null) {
        this.options.onBeforeStart?.();
        this.start();
      }
    } else {
      this.stop();
    }
  }

  start(): void {
    if (this.rafId !== null || !this.options.canRun()) {
      return;
    }
    this.lastFrameMs = performance.now();
    this.frameAccumMs = this.options.intervalMs;
    const tick = (nowMs: number) => {
      this.rafId = null;
      if (!this.options.canRun()) return;

      const deltaMs = Math.min(this.maxDeltaMs, Math.max(0, nowMs - this.lastFrameMs));
      this.lastFrameMs = nowMs;

      try {
        this.frameAccumMs += deltaMs;
        if (this.frameAccumMs >= this.options.intervalMs) {
          const stepSec = Math.min(this.maxStepSec, this.frameAccumMs / 1000);
          this.frameAccumMs = 0;
          this.options.onStep(stepSec);
        }
      } finally {
        if (this.options.canRun()) {
          this.rafId = window.requestAnimationFrame(tick);
        }
      }
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
