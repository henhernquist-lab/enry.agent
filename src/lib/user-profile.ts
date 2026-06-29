export interface UserProfile {
  // Identity
  name: string
  grade: string

  // Academics
  classes: string
  helpSubjects: string
  gpaGoal: string

  // Athletics
  sports: string
  currentPRs: string
  targetPRs: string
  trainingDays: string

  // Fitness & Nutrition
  weightGoals: string
  dietGoal: 'bulking' | 'cutting' | 'maintaining' | ''
  avoidedFoods: string
  proteinTarget: string

  // Productivity
  wakeTime: string
  practiceTime: string
  homeworkTime: string
  sleepGoal: string

  // Preferences
  communicationStyle: 'direct' | 'friendly' | 'balanced'
  priorities: PriorityRanking

  // Metadata
  setupComplete: boolean
  setupDate: number
}

export type PriorityKey = 'grades' | 'athletics' | 'projects' | 'social'

export interface PriorityRanking {
  grades: number
  athletics: number
  projects: number
  social: number
}

const STORAGE_KEY = 'enry_user_profile'

export function createDefaultProfile(): UserProfile {
  return {
    name: '',
    grade: '',
    classes: '',
    helpSubjects: '',
    gpaGoal: '',
    sports: '',
    currentPRs: '',
    targetPRs: '',
    trainingDays: '',
    weightGoals: '',
    dietGoal: '',
    avoidedFoods: '',
    proteinTarget: '',
    wakeTime: '',
    practiceTime: '',
    homeworkTime: '',
    sleepGoal: '',
    communicationStyle: 'balanced',
    priorities: { grades: 2, athletics: 3, projects: 1, social: 4 },
    setupComplete: false,
    setupDate: 0,
  }
}

export function loadProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveProfile(profile: UserProfile): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {}
}

export function hasCompletedSetup(): boolean {
  const profile = loadProfile()
  return profile?.setupComplete === true
}

export function profileToSystemPrompt(profile: UserProfile): string {
  const priorityLabels: Record<PriorityKey, string> = {
    grades: 'Grades',
    athletics: 'Athletics',
    projects: 'Building Projects',
    social: 'Social Life',
  }

  const sortedPriorities = (Object.entries(profile.priorities) as [PriorityKey, number][])
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => priorityLabels[key])

  const dietLabel =
    profile.dietGoal === 'bulking' ? 'Bulking (gaining mass)' :
    profile.dietGoal === 'cutting' ? 'Cutting (losing fat)' :
    profile.dietGoal === 'maintaining' ? 'Maintaining' : 'Not specified'

  const styleLabel =
    profile.communicationStyle === 'direct' ? 'Direct and blunt' :
    profile.communicationStyle === 'friendly' ? 'Friendly and encouraging' :
    'Somewhere in between'

  const lines: string[] = [
    '## User Profile (from onboarding)',
    '',
    `You are speaking with **${profile.name}**, grade ${profile.grade}.`,
    '',
    '### Academics',
    `- Classes this year: ${profile.classes || 'Not specified'}`,
    `- Subjects needing help: ${profile.helpSubjects || 'Not specified'}`,
    `- GPA goal: ${profile.gpaGoal || 'Not specified'}`,
    '',
    '### Athletics',
    `- Sports: ${profile.sports || 'Not specified'}`,
    `- Current PRs: ${profile.currentPRs || 'Not specified'}`,
    `- Target PRs: ${profile.targetPRs || 'Not specified'}`,
    `- Training days/week: ${profile.trainingDays || 'Not specified'}`,
    '',
    '### Fitness & Nutrition',
    `- Weight goals: ${profile.weightGoals || 'Not specified'}`,
    `- Diet phase: ${dietLabel}`,
    `- Foods avoided: ${profile.avoidedFoods || 'None'}`,
    `- Daily protein target: ${profile.proteinTarget || 'Not specified'}g`,
    '',
    '### Productivity',
    `- Wakes up at: ${profile.wakeTime || 'Not specified'}`,
    `- Practice/training at: ${profile.practiceTime || 'Not specified'}`,
    `- Homework time: ${profile.homeworkTime || 'Not specified'}`,
    `- Sleep goal: ${profile.sleepGoal || 'Not specified'} hours`,
    '',
    '### Preferences',
    `- Communication style: ${styleLabel}`,
    `- Current priorities (ranked): ${sortedPriorities.join(' > ')}`,
    '',
    'Use this profile to personalize every response. Reference their name, goals, and priorities naturally.',
  ]

  return lines.join('\n')
}
