'use client'

// Grade Calculator — moved into Learn as a tab.
// Wraps the existing GradeCalculator component from tools, unchanged.

import { GradeCalculator } from '@/components/tools/grade-calculator'

export default function GradeCalcTab() {
  return <GradeCalculator mode="page" onClose={() => {}} />
}
