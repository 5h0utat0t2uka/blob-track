export const TIMING_SAMPLE_LIMIT = 120
export const TIMING_LABELS = {
  capture: 'CAPTURE',
  roundTrip: 'WORKER ROUND TRIP',
  inference: 'INFERENCE TIME',
  tracking: 'TRACKING TIME',
  render: 'DRAW SUBMISSION',
  total: 'CAPTURE TO DRAW',
} as const

export type TimingSample = Record<keyof typeof TIMING_LABELS, number>
export type TimingSummary = Record<keyof TimingSample, { average: number; p95: number }>

/** Bounded rolling samples. Sorting happens at report time, not per video frame. */
export class ProcessingTimings {
  private samples: TimingSample[] = []
  private cursor = 0

  reset(): void {
    this.samples.length = 0
    this.cursor = 0
  }

  add(sample: TimingSample): void {
    this.samples[this.cursor] = sample
    this.cursor = (this.cursor + 1) % TIMING_SAMPLE_LIMIT
  }

  summarize(): TimingSummary {
    return Object.fromEntries(Object.keys(TIMING_LABELS).map((name) => {
      const key = name as keyof TimingSample
      const values = this.samples.map((sample) => sample[key]).sort((a, b) => a - b)
      return [key, {
        average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
        p95: values.length ? values[Math.ceil(values.length * 0.95) - 1] : 0,
      }]
    })) as TimingSummary
  }
}
