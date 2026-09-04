// Analysis resolution presets (long edge in pixels). The source aspect ratio is preserved.
export const ANALYSIS_LONG_EDGES = [320, 480] as const

export type AnalysisLongEdge = (typeof ANALYSIS_LONG_EDGES)[number]

// Use the second preset by default, both in the UI and in the engine.
export const DEFAULT_ANALYSIS_LONG_EDGE: AnalysisLongEdge = ANALYSIS_LONG_EDGES[1]

export function isAnalysisLongEdge(value: number): value is AnalysisLongEdge {
  return ANALYSIS_LONG_EDGES.some((longEdge) => longEdge === value)
}
