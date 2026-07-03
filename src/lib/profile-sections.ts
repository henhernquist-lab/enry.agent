import type { UserProfile } from './user-profile'
import { User, BookOpen, Dumbbell, Apple, Clock, Sliders } from 'lucide-react'

export type SectionKey = 'identity' | 'academics' | 'athletics' | 'fitness' | 'productivity' | 'preferences'

export interface FieldDef {
  label: string
  key: keyof UserProfile
  type: 'text' | 'textarea' | 'select'
  options?: { label: string; value: string }[]
  placeholder?: string
}

export interface Section {
  key: SectionKey
  title: string
  icon: React.ElementType
  fields: FieldDef[]
}

export const PROFILE_SECTIONS: Section[] = [
  {
    key: 'identity',
    title: 'Identity',
    icon: User,
    fields: [
      { label: 'Name', key: 'name', type: 'text', placeholder: 'Your name' },
      { label: 'Grade', key: 'grade', type: 'text', placeholder: 'e.g. 10th grade / Freshman' },
    ],
  },
  {
    key: 'academics',
    title: 'Academics',
    icon: BookOpen,
    fields: [
      { label: 'Classes', key: 'classes', type: 'textarea', placeholder: 'e.g. AP Calculus, English, Chemistry' },
      { label: 'Help Subjects', key: 'helpSubjects', type: 'textarea', placeholder: 'e.g. Calculus, essay writing' },
      { label: 'GPA Goal', key: 'gpaGoal', type: 'text', placeholder: 'e.g. 4.0' },
    ],
  },
  {
    key: 'athletics',
    title: 'Athletics',
    icon: Dumbbell,
    fields: [
      { label: 'Sports', key: 'sports', type: 'text', placeholder: 'e.g. Track, Football, Basketball' },
      { label: 'Current PRs', key: 'currentPRs', type: 'textarea', placeholder: 'e.g. 200m: 23.72' },
      { label: 'Target PRs', key: 'targetPRs', type: 'textarea', placeholder: 'e.g. 200m: 22.5' },
      { label: 'Training Days', key: 'trainingDays', type: 'text', placeholder: 'e.g. 5' },
    ],
  },
  {
    key: 'fitness',
    title: 'Fitness & Nutrition',
    icon: Apple,
    fields: [
      { label: 'Weight Goals', key: 'weightGoals', type: 'text', placeholder: 'e.g. 160lbs → 175lbs' },
      {
        label: 'Diet Goal',
        key: 'dietGoal',
        type: 'select',
        options: [
          { label: 'Bulking — gaining mass', value: 'bulking' },
          { label: 'Cutting — losing fat', value: 'cutting' },
          { label: 'Maintaining', value: 'maintaining' },
          { label: 'Not set', value: '' },
        ],
      },
      { label: 'Avoided Foods', key: 'avoidedFoods', type: 'textarea', placeholder: 'e.g. Dairy, gluten' },
      { label: 'Protein Target (g)', key: 'proteinTarget', type: 'text', placeholder: 'e.g. 160' },
    ],
  },
  {
    key: 'productivity',
    title: 'Productivity',
    icon: Clock,
    fields: [
      { label: 'Wake Time', key: 'wakeTime', type: 'text', placeholder: 'e.g. 6:30 AM' },
      { label: 'Practice Time', key: 'practiceTime', type: 'text', placeholder: 'e.g. 3:00 PM' },
      { label: 'Homework Time', key: 'homeworkTime', type: 'text', placeholder: 'e.g. 7:00 PM' },
      { label: 'Sleep Goal (hours)', key: 'sleepGoal', type: 'text', placeholder: 'e.g. 8' },
    ],
  },
  {
    key: 'preferences',
    title: 'Preferences',
    icon: Sliders,
    fields: [
      {
        label: 'Communication Style',
        key: 'communicationStyle',
        type: 'select',
        options: [
          { label: 'Direct and blunt', value: 'direct' },
          { label: 'Friendly and encouraging', value: 'friendly' },
          { label: 'Balanced', value: 'balanced' },
        ],
      },
    ],
  },
]
