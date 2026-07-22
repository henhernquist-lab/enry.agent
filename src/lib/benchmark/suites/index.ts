import type { BenchmarkSuite } from '../types'
import { codingSuite } from './coding'
import { reasoningSuite } from './reasoning'
import { mathSuite } from './math'
import { writingSuite } from './writing'
import { summarizationSuite } from './summarization'
import { toolCallingSuite } from './tool-calling'
import { longContextSuite } from './long-context'
import { jsonStructuredSuite } from './json-structured'
import { instructionFollowingSuite } from './instruction-following'
import { latencySuite } from './latency'
import { costEfficiencySuite } from './cost-efficiency'
import { reliabilitySuite } from './reliability'

export const ALL_SUITES: BenchmarkSuite[] = [
  codingSuite,
  reasoningSuite,
  mathSuite,
  writingSuite,
  summarizationSuite,
  toolCallingSuite,
  longContextSuite,
  instructionFollowingSuite,
  jsonStructuredSuite,
  latencySuite,
  costEfficiencySuite,
  reliabilitySuite,
]
