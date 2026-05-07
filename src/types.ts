/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum LearningStyle {
  VISUAL = 'Visual',
  AUDITORY = 'Auditory',
  KINESTHETIC = 'Kinesthetic',
  READ_WRITE = 'Read/Write',
}

export enum Difficulty {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced',
}

export interface UserProfile {
  name: string;
  goals: string[];
  learningStyle: LearningStyle;
  availableHoursPerDay: number;
  currentMood?: string;
  xp: number;
  streak: number;
  achievements: string[];
  moodHistory: { mood: string; timestamp: string }[];
}

export interface ResourceLink {
  title: string;
  url: string;
  type: 'video' | 'article' | 'book' | 'repo';
  relevance: number; // 0-100
}

export interface SubTopic {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed';
  completionPercentage: number;
}

export interface Topic {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  estimatedTimeHours: number;
  prerequisites: string[];
  status: 'pending' | 'in-progress' | 'completed';
  subtopics?: SubTopic[];
  masteryScale?: number; // 0-100
  resources?: ResourceLink[];
  relatedTopics?: string[]; // IDs
}

export interface SystemTestResult {
  step: string;
  status: 'pass' | 'fail' | 'warning';
  details: string;
  timestamp: string;
}

export interface DiagnosticReport {
  id: string;
  generatedAt: string;
  overallHealth: 'Optimal' | 'Degraded' | 'Critical';
  testResults: SystemTestResult[];
}

export interface StudySession {
  id: string;
  topicId: string;
  subtopicId?: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  type: 'learning' | 'practice' | 'revision' | 'assessment';
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface StudyMaterial {
  id: string;
  topicId: string;
  type: 'summary' | 'flashcards' | 'cheatsheet';
  content: string;
  flashcards?: Flashcard[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface Assessment {
  id: string;
  topicId: string;
  questions: QuizQuestion[];
  score?: number;
  feedback?: string;
}

export interface StudyProject {
  id: string;
  subject: string;
  deadline: string;
  topics: Topic[];
  sessions: StudySession[];
  materials?: StudyMaterial[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  parts: { text: string }[];
  createdAt: string;
}

export interface ChatThread {
  id: string;
  mode: 'focused' | 'free';
  topicId: string | null;
  scheduledSessionId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
}

export interface TopicMemory {
  topicId: string;
  summary: string;
  lastUpdatedAt: string;
  ownerId: string;
}
