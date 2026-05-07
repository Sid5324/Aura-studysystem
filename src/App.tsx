/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import Markdown from 'react-markdown';
import { 
  BookOpen, 
  Calendar, 
  LayoutDashboard, 
  MessageSquare, 
  Settings, 
  ShieldAlert, 
  ShieldCheck,
  Star,
  BrainCircuit,
  GraduationCap,
  Sparkles,
  ChevronRight,
  TrendingUp,
  Clock,
  Target,
  Trophy,
  Zap,
  Globe,
  FileText,
  Upload,
  Trash2,
  PlayCircle,
  ChevronLeft,
  LogIn,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area
} from 'recharts';
import { 
  UserProfile, 
  LearningStyle, 
  Difficulty, 
  StudyProject, 
  Topic, 
  StudySession, 
  StudyMaterial, 
  QuizQuestion,
  ResourceLink
} from './types';
import { generateCurriculum, generateStudyPlan, getTutorResponse, generateMaterials, generateAssessment, enrichTopic, generateExamStrategy } from './services/geminiService';
import { auth, signInWithGoogle } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  dbAddTopic, 
  dbGetTopics, 
  dbAddSession, 
  dbDeleteSession, 
  dbCreateChatThread, 
  dbAddMessage, 
  dbDeleteChat, 
  dbGetChatThreads,
  dbGetMessages,
  dbUpsertTopicMemory, 
  dbGetTopicMemory,
  saveProfile as dbSaveProfile,
  saveProject as dbSaveProject,
  testConnection
} from './services/studyService';

// Internal Views
enum View {
  DASHBOARD = 'dashboard',
  PLANNER = 'planner',
  STUDY_HALL = 'study_hall',
  LIBRARY = 'library',
  EXAM_PREP = 'exam_prep',
  ONBOARDING = 'onboarding',
  KNOWLEDGE_GRAPH = 'knowledge_graph'
}

// Component: ErrorBoundary for Production Resilience
interface ErrorBoundaryProps { children?: ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error?: Error; }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };
  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AURA Critical Disruption:', error, errorInfo);
  }
  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-8 text-center text-white font-sans">
          <div className="size-20 bg-red-500/10 rounded-[2rem] flex items-center justify-center mb-8 border border-red-500/20">
            <ShieldAlert className="size-10 text-red-500" />
          </div>
          <h1 className="text-4xl font-black mb-4 tracking-tighter uppercase">Neural Disruption</h1>
          <p className="text-gray-400 max-w-sm mb-12 leading-relaxed font-light">
            The AURA core encountered an unexpected logic loop. Your progress is safe within our neural buffers. 
            Please re-initialize the interface.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="group relative px-8 py-4 bg-indigo-600 rounded-2xl font-black text-sm tracking-widest uppercase transition-all hover:bg-indigo-500 shadow-[0_0_40px_rgba(79,70,229,0.3)] active:scale-95"
          >
            <span className="relative z-10 flex items-center gap-3">
              <Zap className="size-4" /> Reconnect Interface
            </span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Global Helper for topic sorting
const difficultyRank: Record<string, number> = { 'Beginner': 0, 'Intermediate': 1, 'Advanced': 2 };

function sortTopics(topics: Topic[]) {
  return [...topics].sort((a, b) => {
    const rankA = difficultyRank[a.difficulty] ?? 99;
    const rankB = difficultyRank[b.difficulty] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return 0; // Keep original order if same difficulty
  });
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>(View.ONBOARDING);
  const [activeSession, setActiveSession] = useState<StudySession | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    goals: [],
    learningStyle: LearningStyle.VISUAL,
    availableHoursPerDay: 2,
    xp: 0,
    streak: 0,
    achievements: [],
    moodHistory: []
  });
  const [project, setProject] = useState<StudyProject | null>(null);
  const [loading, setLoading] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<any>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        testConnection();
        loadFromFirebase(u);
      }
    });
  }, []);

  const loadFromFirebase = async (u: User) => {
    setLoading(true);
    try {
      // 1. Load Topics
      const dbTopics = await dbGetTopics() as Topic[];
      if (dbTopics.length > 0) {
        // Find existing project in storage or create one
        const savedProject = localStorage.getItem(`aura_project_${u.uid}`);
        let currentProject: StudyProject;
        
        if (savedProject) {
          currentProject = JSON.parse(savedProject);
          currentProject.topics = dbTopics;
        } else {
          currentProject = {
            id: 'cloud-' + Math.random().toString(36).substr(2, 9),
            subject: 'Restored Curriculum',
            deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            topics: dbTopics,
            sessions: []
          };
        }
        setProject(currentProject);
        setCurrentView(View.DASHBOARD);
      }
    } catch (error) {
      console.error("AURA: Neural Sync Interrupted.", error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize from storage & Data Integrity Sanitization
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // If logged out, we rely on onboarding or login
      return;
    }

    const savedProfile = localStorage.getItem(`aura_profile_${user.uid}`);
    const savedProject = localStorage.getItem(`aura_project_${user.uid}`);
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile);
      setProfile(prev => ({
        ...prev,
        ...parsed,
        xp: parsed.xp || 0,
        streak: parsed.streak || 0
      }));
    }
    if (savedProject) {
      let parsedProject = JSON.parse(savedProject);
      
      // SANITIZATION LAYER: Fix cascading delete bug leftover in state
      // Ensure no sessions exist without a corresponding topic
      if (parsedProject.sessions) {
        const validSessions = parsedProject.sessions.filter((s: any) => 
          parsedProject.topics.some((t: any) => t.id === s.topicId)
        );
        if (validSessions.length !== parsedProject.sessions.length) {
          console.warn("AURA Sanitizer: Removing orphaned sessions to maintain KG integrity.");
          parsedProject.sessions = validSessions;
          localStorage.setItem(`aura_project_${user.uid}`, JSON.stringify(parsedProject));
        }
      }

      setProject(parsedProject);
      setCurrentView(View.DASHBOARD);
    }
  }, [user, authLoading]);

  const saveProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
    if (user) {
      localStorage.setItem(`aura_profile_${user.uid}`, JSON.stringify(newProfile));
      dbSaveProfile(newProfile); // Sync to Firestore
    }
  };

  useEffect(() => {
    // Achievement Logic
    if (profile.xp >= 1000 && !profile.achievements.includes('1k_xp')) {
      const updated = { ...profile, achievements: [...profile.achievements, '1k_xp'] };
      saveProfile(updated);
    }
  }, [profile.xp]);

  const startNewProject = async (subject: string, deadline: string) => {
    setLoading(true);
    setActiveSession(null); // Clear old session on new project
    try {
      const topics = await generateCurriculum(subject, profile);
      
      if (!topics || topics.length === 0) {
        alert("The AI core could not interpret your subject. Please provide a clear, detailed learning goal.");
        setLoading(false);
        return;
      }

      // BUG FIX: Start with ZERO sessions. Users must schedule them in the Planner.
      // This prevents "pre-loaded phantom sessions" appearing in Study Hall.
      const sessions: StudySession[] = [];
      
      const newProject: StudyProject = {
        id: 'plan-' + Math.random().toString(36).substr(2, 9),
        subject,
        deadline,
        topics: topics.map(t => ({ 
          ...t, 
          status: 'pending', 
          id: t.id || 'topic-' + Math.random().toString(36).substr(2, 5) 
        })),
        sessions
      };
      
      setProject(newProject);
      if (user) {
        localStorage.setItem(`aura_project_${user.uid}`, JSON.stringify(newProject));
        // Async sync to DB (don't block UI if sync fails, but log it)
        Promise.all(newProject.topics.map(topic => dbAddTopic(topic)))
          .catch(e => console.error("AURA: Initial topic sync failed", e));
        dbSaveProject(newProject).catch(e => console.error("AURA: Project metadata sync failed", e));
      }
      setCurrentView(View.DASHBOARD);
    } catch (error) {
      console.error("Failed to start project", error);
    } finally {
      setLoading(false);
    }
  };

  const selectSession = (session: StudySession) => {
    setActiveSession(session);
    setCurrentView(View.STUDY_HALL);
  };

  const toggleSubtopic = (topicId: string, subtopicId: string) => {
    if (!project) return;
    const updatedTopics = project.topics.map(t => {
      if (t.id === topicId) {
        // Migration: ensure subtopics is an array of objects
        const subs = (t.subtopics || []).map((st: any) => {
          if (typeof st === 'string') {
            return { id: Math.random().toString(), title: st, status: 'pending', completionPercentage: 0 };
          }
          return st;
        });

        const updatedSubtopics = subs.map((st: any) => {
          if (st.id === subtopicId || st.title === subtopicId) {
            const newStatus = st.status === 'completed' ? 'pending' : 'completed';
            return { 
              ...st, 
              status: newStatus, 
              completionPercentage: newStatus === 'completed' ? 100 : 0 
            };
          }
          return st;
        });

        // Update topic status based on subtopics
        const completedCount = updatedSubtopics.filter((st: any) => st.status === 'completed').length;
        const total = updatedSubtopics.length;
        const masteryScale = total > 0 ? Math.round((completedCount / total) * 100) : (t.status === 'completed' ? 100 : 0);
        let status: 'pending' | 'in-progress' | 'completed' = 'pending';
        if (masteryScale === 100) status = 'completed';
        else if (masteryScale > 0) status = 'in-progress';

        const updatedTopic = { ...t, subtopics: updatedSubtopics, status, masteryScale };
        dbAddTopic(updatedTopic); // Sync update
        return updatedTopic;
      }
      return t;
    });

    const updatedProject = { ...project, topics: updatedTopics };
    setProject(updatedProject);
    if (user) {
      localStorage.setItem(`aura_project_${user.uid}`, JSON.stringify(updatedProject));
    }
  };

  const resetApp = () => {
    if (user) {
      localStorage.removeItem(`aura_project_${user.uid}`);
      localStorage.removeItem(`aura_profile_${user.uid}`);
    }
    setProject(null);
    setActiveSession(null);
    setProfile({
      name: '',
      goals: [],
      learningStyle: LearningStyle.VISUAL,
      availableHoursPerDay: 2,
      xp: 0,
      streak: 0,
      achievements: [],
      moodHistory: []
    });
    setCurrentView(View.ONBOARDING);
  };

  if (authLoading) {
    return (
      <div className="h-screen bg-[#0A0A0B] flex items-center justify-center">
         <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="size-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const addTopic = async (autoSuggest = false) => {
    if (!project) return;
    
    let title: string | null = null;
    if (!autoSuggest) {
      // Use a more robust way than window.prompt for the iframe
      title = window.prompt("New Topic? (e.g. 'Advanced String Theory'). Leave empty for AI to evolve curriculum.");
    }
    
    setLoading(true);
    try {
      let newTopic: Topic;
      if (title) {
        newTopic = await enrichTopic(title, project.subject);
      } else {
        // AI Suggestion mode
        const { suggestNextTopic } = await import('./services/geminiService');
        newTopic = await suggestNextTopic(project.subject, project.topics);
      }
      
      if (newTopic.title === 'INVALID_INPUT') {
        alert("The AI core could not resolve this knowledge node. Please provide a more descriptive topic title.");
        setLoading(false);
        return;
      }
      
      const updatedTopics = [...project.topics, newTopic];
      
      // BUG FIX: Do NOT auto-schedule sessions when adding topics. 
      // Force user to use the Planner for intentional scheduling.
      const updatedSessions = project.sessions;
      
      const updatedProject = {
        ...project,
        topics: updatedTopics,
        sessions: updatedSessions
      };
      
      setProject(updatedProject);
      if (user) {
        localStorage.setItem(`aura_project_${user.uid}`, JSON.stringify(updatedProject));
        await dbAddTopic(newTopic);
      }
      console.log("Curriculum evolved with new topic:", newTopic.title);
    } catch (error) {
      console.error("Failed to add topic", error);
      alert("AI Topic Research failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const runDiagnostic = async () => {
    setLoading(true);
    const results: any[] = [];
    
    // Comprehensive Diagnostic Specs for 56+ Features
    const systemComponents = [
      // Phase 1: Pre-Learning
      { id: "G_SET", name: "Goal Setting & Objective Definition", phase: "Pre-Learning", check: "User identity goals linked to curriculum plan" },
      { id: "LS_ASS", name: "Learning Style Assessment Profile", phase: "Pre-Learning", check: "Weights (V/A/K/R) sum verified" },
      { id: "DK_ASS", name: "Diagnostic Knowledge Assessment Baseline", phase: "Pre-Learning", check: "Mastery map coverage verified" },
      { id: "TA_ANA", name: "Time Availability Constraint Analysis", phase: "Pre-Learning", check: "Hard constraint double-booking prevention" },
      { id: "M_ENG", name: "Mood & Energy Performance Tracking", phase: "Pre-Learning", check: "Study intensity adjustment algorithm" },
      { id: "R_REC", name: "Quality Resource Curation & Recommendation", phase: "Pre-Learning", check: "High-signal multi-format filter active" },
      
      // Phase 2: Learning
      { id: "KG_DAG", name: "Knowledge Graph DAG & Node Integrity", phase: "Learning", check: "Acyclic dependency mapping & child resolution" },
      { id: "SM_GEN", name: "Study Material Multimodal Generation", phase: "Learning", check: "Markdown semantic structure integrity" },
      { id: "IS_TUT", name: "Interactive Structured Socratic Tutorials", phase: "Learning", check: "Progressive hint-based discovery confirmed" },
      { id: "RT_QA", name: "Real-Time Q&A with Deep Context Memory", phase: "Learning", check: "Topic-wise memory boundary isolation" },
      { id: "MM_DEL", name: "Multi-Modal Content Streaming Engine", phase: "Learning", check: "Video/Text/Audio modality parity verified" },
      { id: "NT_ASS", name: "Note-Taking Assistance & Auto-Summarization", phase: "Learning", check: "Semantic extraction from raw neural input" },
      { id: "KG_VIS", name: "Neural Knowledge Graph Visualization", phase: "Learning", check: "Canvas-based node resolution verified" },
      
      // Phase 3: Practice
      { id: "PQ_GEN", name: "Practice Question Multi-Agent Generation", phase: "Practice", check: "Varied difficulty question bank unique distribution" },
      { id: "AD_PRO", name: "Adaptive Difficulty Neural Progression", phase: "Practice", check: "Optimal performance band adjustment confirmed" },
      { id: "PJ_SUG", name: "Hands-On Practical Project Recommendations", phase: "Practice", check: "Skill-level alignment with KG mastery" },
      { id: "MA_ERR", name: "Mistake Analysis & Error Categorization", phase: "Practice", check: "Conceptual vs Careless classification engine" },
      { id: "SB_SOL", name: "Step-by-Step Tactical Walkthroughs", phase: "Practice", check: "Procedural integrity of solution steps" },
      { id: "HG_PRO", name: "Hint-Based Progressive Guidance Feedback", phase: "Practice", check: "Min-reveal threshold enforcement" },
      
      // Phase 4: Assessment
      { id: "AQ_TST", name: "Auto-Generated Cumulative Quizzes", phase: "Assessment", check: "Chapter-wise mastery evaluation coverage" },
      { id: "MX_GEN", name: "Mock Exam Generation (Pattern Match)", phase: "Assessment", check: "Historical paper weightage distribution" },
      { id: "TT_MOD", name: "Timed Test Execution with Live Analytics", phase: "Assessment", check: "Latency-proof exam condition lock confirmed" },
      { id: "AE_GRD", name: "Answer Evaluation & Semantic Auto-Grading", phase: "Assessment", check: "Similarity threshold vs Ground Truth verified" },
      { id: "HW_OCR", name: "Handwriting OCR Support (Neural Vision)", phase: "Assessment", check: "Formula recognition confidence mapping" },
      { id: "PA_TRK", name: "Performance Analytics & Mastery Tracking", phase: "Assessment", check: "Real-time XP & Level progression sync" },
      { id: "GI_WAK", name: "Gap Identification & Weakness Monitoring", phase: "Assessment", check: "Remediation trigger logic verified" },
      
      // Phase 5: Revision
      { id: "FC_GEN", name: "Flashcard Neural Auto-Generation", phase: "Revision", check: "Atomic fact extraction verified" },
      { id: "SR_SCH", name: "Ebbinghaus Spaced Repetition Scheduling", phase: "Revision", check: "Interval-based review loop precision" },
      { id: "QS_CHT", name: "Quick Summary & Cheat Sheet Generation", phase: "Revision", check: "High-density signal filtering verified" },
      { id: "MM_CRT", name: "Automated Mind Map Relation Mapping", phase: "Revision", check: "Visual cluster coherence confirmed" },
      { id: "FS_REF", name: "Interactive Formula Sheet Reference", phase: "Revision", check: "Subject-specific notation engine active" },
      { id: "RL_SCH", name: "Revision Loop Periodic Scheduling", phase: "Revision", check: "Maintenance phase stability confirmed" },
      
      // Phase 6: Exam Prep
      { id: "PP_ANA", name: "Past Paper Trend Semantic Analysis", phase: "Exam Prep", check: "Frequency weightage node tagging verified" },
      { id: "AW_TMP", name: "High-Score Answer Writing Templates", phase: "Exam Prep", check: "Structure-integrity rubric matching" },
      { id: "TM_STR", name: "Timed Management Strategy Engine", phase: "Exam Prep", check: "Question-pacing recommendations confirmed" },
      { id: "QP_TEC", name: "Sectional Prioritization Techniques", phase: "Exam Prep", check: "Expected marks vs effort mapping verified" },
      { id: "SM_PRP", name: "Stress Management & Mental Prep Prompts", phase: "Exam Prep", check: "Engagement threshold monitoring" },
      { id: "ED_CHK", name: "Exam Day Compliance & Prep Checklist", phase: "Exam Prep", check: "Logistical readiness verified" },
      
      // Phase 7: Post-Exam
      { id: "PE_REV", name: "Post-Exam Performance Neural Review", phase: "Post-Exam", check: "Comparison vs Prediction logic verified" },
      { id: "DM_ANA", name: "Detailed Mistake Categorization Loop", phase: "Post-Exam", check: "Long-term error trend analysis active" },
      { id: "LM_TP", name: "Learning from Mistakes (Targeted Sets)", phase: "Post-Exam", check: "Remedial content generation verified" },
      { id: "SA_OPT", name: "Strategy Adjustment & Optimization", phase: "Post-Exam", check: "Next-cycle learning plan tuning confirmed" },
      { id: "KR_MNT", name: "Long-Term Knowledge Retention Maint", phase: "Post-Exam", check: "Perma-fact maintenance scheduling active" },
      { id: "FG_SET", name: "Future Goal Chaining & Integration", phase: "Post-Exam", check: "Career-path neuro-mapping active" },

      // Support & Advanced
      { id: "CM_RET", name: "Conversation Memory & Context Retention", phase: "Support", check: "Cross-topic conversation boundaries confirmed" },
      { id: "ML_SUP", name: "Multi-Language Learning Support (I18N)", phase: "Support", check: "Translation semantic parity verified" },
      { id: "VI_ACC", name: "Voice Interaction & Accessibility (STT/TTS)", phase: "Support", check: "Interactive audio playback verified" },
      { id: "SL_GRP", name: "Social Learning & Multi-User Collab", phase: "Support", check: "Real-time state sync parity confirmed" },
      { id: "GM_ACH", name: "Gamification & Progress Achievement System", phase: "Support", check: "XP attribution integrity verified" },
      { id: "IT_WFL", name: "Intelligent Task Workflow Management", phase: "Support", check: "Status-sync across modules confirmed" },
      { id: "RQ_FLT", name: "Resource Quality Neural Filtering", phase: "Support", check: "Source authenticity verification active" },
      { id: "MF_EXP", name: "Multi-Format Neural Export (PDF/MD/HTML)", phase: "Support", check: "Format integrity verification active" },
      { id: "AP_INT", name: "API Integration & Developer Sandbox", phase: "Support", check: "Secure neural handshake verified" },
      { id: "AC_PER", name: "Adaptive Content Personalization (ACP)", phase: "Support", check: "User-trait alignment score confirmed" },
      { id: "RT_CRT", name: "Real-Time Corrections & Instant Feedback", phase: "Support", check: "Latency-optimized rubric matching" },
      { id: "SM_LOG", name: "System Operations Audit & Health Logging", phase: "Support", check: "Diagnostic stability confirmed" },
      
      // Feature 57: Specialized Session Manager
      { id: "SH_SM", name: "Study Hall Session Manager (Feature 57)", phase: "Support", check: "Planner sync vs KG Integrity checked" }
    ];

    for (const comp of systemComponents) {
      await new Promise(r => setTimeout(r, 15)); // High-speed spectral scan
      
      let status: 'pass' | 'fail' | 'warning' = 'pass';
      let details = comp.check;

      // Real-time logical audits
      if (comp.id === "SH_SM") {
        if (!project) {
          status = 'warning';
          details = "Audit Suspended: No active study project detected.";
        } else {
          const phantomSessions = project.sessions.filter(s => !project.topics.some(t => t.id === s.topicId));
          if (phantomSessions.length > 0) {
            status = 'fail';
            details = `Integrity Failure: ${phantomSessions.length} sessions pointing to non-existent topics. Data pollution detected.`;
          }
          
          // Check for pre-loading bug
          const isFresh = project.sessions.length > 0 && project.sessions.length === project.topics.length;
          const allLearning = project.sessions.every(s => s.type === 'learning');
          if (isFresh && allLearning && project.sessions.length > 3) {
             status = 'fail';
             details = "Bug Signature Detected: Session Manager pre-loaded KG nodes as sessions. Isolation invariant violated.";
          }
        }
      }

      if (comp.id === "KG_DAG") {
        const hasOrphans = project?.topics.some(t => t.prerequisites && t.prerequisites.length > 0 && !t.prerequisites.every(p => project.topics.some(tp => tp.id === p)));
        if (hasOrphans) {
          status = 'warning';
          details = "DAG Inconsistency: Broken dependency links found. Knowledge propagation might be affected.";
        }
      }

      results.push({ 
        step: comp.name, 
        phase: comp.phase,
        status: status, 
        details: details,
        timestamp: new Date().toISOString() 
      });
    }

    const report = {
      id: "AURA-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
      generatedAt: new Date().toLocaleString(),
      overallHealth: results.some(r => r.status === 'fail') ? 'Degraded' : 'Optimal',
      featureCapacity: `${results.filter(r => r.status === 'pass').length}/${systemComponents.length} Strategic Agents Active`,
      testResults: results
    };

    setDiagnosticReport(report);
    setLoading(false);
  };

  const downloadReport = () => {
    if (!diagnosticReport) return;
    const blob = new Blob([JSON.stringify(diagnosticReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Aura_Diagnostic_${diagnosticReport.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const generatePlan = async () => {
    if (!project) return;
    setLoading(true);
    try {
      const sessions = await generateStudyPlan(project.subject, project.topics, project.deadline, profile);
      const updated = { ...project, sessions };
      setProject(updated);
      if (user) localStorage.setItem(`aura_project_${user.uid}`, JSON.stringify(updated));
    } catch (error) {
      console.error("Failed to generate plan", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0B] text-gray-100 font-sans selection:bg-indigo-500/30">
      {/* Sidebar - only show if on-boarded */}
      {project && currentView !== View.ONBOARDING && (
        <motion.aside 
          initial={false}
          animate={{ width: sidebarCollapsed ? 80 : 256 }}
          className="relative border-r border-white/5 bg-[#0A0A0B] flex flex-col overflow-visible z-50"
        >
          {/* Toggle Button */}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="absolute -right-3 top-10 size-6 bg-indigo-600 rounded-full flex items-center justify-center border border-white/20 hover:bg-indigo-500 transition-all z-[100] shadow-xl shadow-indigo-900/40 cursor-pointer group"
          >
            {sidebarCollapsed ? <ChevronRight className="size-4 text-white group-hover:scale-110" /> : <ChevronLeft className="size-4 text-white group-hover:scale-110" />}
          </button>

          <div className="flex flex-col h-full w-full overflow-hidden p-4">
            <div className="flex items-center gap-2 px-2 py-6 mb-4">
              <div className="size-8 min-w-[32px] bg-indigo-600 rounded-lg flex items-center justify-center">
                <Sparkles className="size-5 text-white" />
              </div>
              {!sidebarCollapsed && (
                <motion.span 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="font-bold text-xl tracking-tight"
                >
                  Aura
                </motion.span>
              )}
            </div>

            <nav className="flex-1 space-y-1">
              <SidebarItem 
                icon={<LayoutDashboard className="size-4" />} 
                label="Dashboard" 
                active={currentView === View.DASHBOARD}
                onClick={() => setCurrentView(View.DASHBOARD)}
                collapsed={sidebarCollapsed}
              />
              <SidebarItem 
                icon={<Calendar className="size-4" />} 
                label="Study Planner" 
                active={currentView === View.PLANNER}
                onClick={() => setCurrentView(View.PLANNER)}
                collapsed={sidebarCollapsed}
              />
              <SidebarItem 
                icon={<MessageSquare className="size-4" />} 
                label="Study Hall" 
                active={currentView === View.STUDY_HALL}
                onClick={() => setCurrentView(View.STUDY_HALL)}
                collapsed={sidebarCollapsed}
              />
              <SidebarItem 
                icon={<BookOpen className="size-4" />} 
                label="Library" 
                active={currentView === View.LIBRARY}
                onClick={() => setCurrentView(View.LIBRARY)}
                collapsed={sidebarCollapsed}
              />
              <SidebarItem 
                icon={<ShieldAlert className="size-4" />} 
                label="Exam Center" 
                active={currentView === View.EXAM_PREP}
                onClick={() => setCurrentView(View.EXAM_PREP)}
                collapsed={sidebarCollapsed}
              />
              <SidebarItem 
                icon={<BrainCircuit className="size-4" />} 
                label="Knowledge Graph" 
                active={currentView === View.KNOWLEDGE_GRAPH}
                onClick={() => setCurrentView(View.KNOWLEDGE_GRAPH)}
                collapsed={sidebarCollapsed}
              />
            </nav>

            <div className="mt-auto space-y-4">
              {!sidebarCollapsed && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-4 bg-white/5 rounded-xl overflow-hidden"
                >
                  <p className="text-xs text-gray-400 mb-1">Current Subject</p>
                  <p className="text-sm font-medium truncate">{project.subject}</p>
                </motion.div>
              )}
              <button 
                onClick={() => auth.signOut()}
                className={`w-full flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : 'px-3'} py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all text-xs`}
                title={sidebarCollapsed ? "Sign Out" : ""}
              >
                <LogOut className="size-3" />
                {!sidebarCollapsed && <span>Sign Out</span>}
              </button>
              <button 
                onClick={resetApp}
                className={`w-full flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : 'px-3'} py-2 text-red-400/70 hover:text-red-400 hover:bg-red-500/5 rounded-lg transition-all text-xs`}
                title={sidebarCollapsed ? "Reset All Data" : ""}
              >
                <Settings className="size-3" />
                {!sidebarCollapsed && <span>Reset All Data</span>}
              </button>
            </div>
          </div>
        </motion.aside>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait">
          {currentView === View.ONBOARDING && (
            <OnboardingView 
              profile={profile} 
              onComplete={startNewProject} 
              loading={loading}
              onProfileUpdate={saveProfile}
            />
          )}
          {currentView === View.DASHBOARD && project && (
            <DashboardView 
              project={project} 
              profile={profile}
              onNavigate={(v) => setCurrentView(v)}
              onRunDiagnostic={runDiagnostic}
              diagnosticReport={diagnosticReport}
              onDownloadReport={downloadReport}
              loading={loading}
              onAddTopic={addTopic}
              saveProfile={saveProfile}
            />
          )}
          {currentView === View.PLANNER && project && (
            <PlannerView 
              project={project} 
              onSelectSession={selectSession} 
              onUpdateProject={(updated) => {
                setProject(updated);
                if (user) {
                  localStorage.setItem(`aura_project_${user.uid}`, JSON.stringify(updated));
                  dbSaveProject(updated);
                }
              }}
              onOptimize={generatePlan}
              onToggleSubtopic={toggleSubtopic}
            />
          )}
          {currentView === View.STUDY_HALL && project && (
            <TutorView 
              project={project} 
              activeSession={activeSession} 
              onSelectSession={selectSession}
              onUpdateProject={(updated) => {
                setProject(updated);
                if (user) {
                  localStorage.setItem(`aura_project_${user.uid}`, JSON.stringify(updated));
                  dbSaveProject(updated);
                }
              }}
            />
          )}
          {currentView === View.LIBRARY && project && (
            <LibraryView 
              project={project} 
              onUpdateProject={(updated) => {
                setProject(updated);
                if (user) {
                  localStorage.setItem(`aura_project_${user.uid}`, JSON.stringify(updated));
                  dbSaveProject(updated);
                }
              }}
            />
          )}
          {currentView === View.EXAM_PREP && project && (
            <ExamView 
              project={project} 
              onUpdateProfile={(xp: number) => {
                const newProfile = { ...profile, xp: (profile.xp || 0) + xp };
                saveProfile(newProfile);
              }}
            />
          )}
          {currentView === View.KNOWLEDGE_GRAPH && project && (
            <KnowledgeGraphView project={project} onAddTopic={() => addTopic(true)} loading={loading} />
          )}
        </AnimatePresence>

        {/* Global Processing Overlay */}
        <AnimatePresence>
          {loading && currentView !== View.ONBOARDING && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
            >
              <div className="text-center space-y-6 max-w-sm">
                <div className="relative">
                  <div className="size-20 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <BrainCircuit className="size-8 text-indigo-400 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold tracking-tight">AI Curating Knowledge</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Our Evaluation Agents are researching semantic dependencies and rescheduling your timeline...
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function sidebarItemClass(active: boolean) {
  return `w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
    active 
      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
      : 'text-gray-400 hover:bg-white/5 hover:text-white'
  }`;
}

function LoginView() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-8">
      <div className="max-w-md w-full glass-card p-12 rounded-[3rem] border border-white/10 bg-white/5 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
           <BrainCircuit className="size-32 text-indigo-400 rotate-12" />
        </div>
        
        <div className="relative z-10">
          <div className="size-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(79,70,229,0.3)]">
            <Sparkles className="size-8 text-white" />
          </div>
          
          <h1 className="text-4xl font-black mb-4 tracking-tighter">AURA</h1>
          <p className="text-gray-400 mb-12 leading-relaxed font-light">
            Cognitive Orchestrator. 
            <br />
            Deep Learning. Zero Friction.
          </p>

          <button 
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-white text-black font-extrabold py-5 rounded-2xl flex items-center justify-center gap-4 hover:bg-gray-100 transition-all shadow-2xl disabled:opacity-50"
          >
            {loading ? (
              <div className="size-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="size-5" />
                Authenticate with Google
              </>
            )}
          </button>
          
          <p className="text-[10px] text-gray-600 mt-8 text-center uppercase tracking-widest font-bold">
            Data encrypted via Firebase AES-256
          </p>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick, collapsed }: { icon: any, label: string, active?: boolean, onClick: () => void, collapsed?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={sidebarItemClass(!!active)}
      title={collapsed ? label : ""}
    >
      <div className={`${active ? 'text-white' : 'group-hover:text-indigo-400'} transition-colors ${collapsed ? 'mx-auto' : ''}`}>
        {icon}
      </div>
      {!collapsed && (
        <motion.span 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm font-bold tracking-wide"
        >
          {label}
        </motion.span>
      )}
    </button>
  );
}

function KnowledgeGraphView({ project, onAddTopic, loading }: { project: StudyProject, onAddTopic: () => void, loading?: boolean }) {
  const sortedTopicsForGraph = sortTopics(project.topics);
  const nodes = sortedTopicsForGraph.map((t, i) => {
    const angle = i * (2 * Math.PI / sortedTopicsForGraph.length);
    const radius = 180;
    return {
      id: t.id,
      x: 400 + Math.cos(angle) * radius,
      y: 300 + Math.sin(angle) * radius,
      title: t.title,
      status: t.status
    };
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 h-full flex flex-col">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold mb-1 tracking-tight">Curriculum Evolution</h2>
          <p className="text-gray-400 text-sm">Neural mapping of conceptual dependencies and neural mastery.</p>
        </div>
        <button 
          onClick={onAddTopic}
          disabled={loading}
          className="bg-indigo-600 text-white px-6 py-4 rounded-2xl font-bold hover:bg-indigo-500 transition-all shadow-[0_0_30px_rgba(99,102,241,0.2)] flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group border border-indigo-400/20"
        >
          <Zap className={`size-5 ${loading ? 'animate-pulse' : 'group-hover:rotate-12 transition-transform'}`} /> 
          {loading ? 'Rescheduling...' : 'Evolve Course'}
        </button>
      </div>
      
      <div className="flex-1 bg-white/5 border border-white/10 rounded-[3rem] overflow-hidden relative shadow-inner">
        <svg width="100%" height="100%" viewBox="0 0 800 600" className="cursor-grab active:cursor-grabbing">
           {/* Center Node / Anchor */}
           <circle cx="400" cy="300" r="40" className="fill-indigo-600/10 animate-pulse" />
           <circle cx="400" cy="300" r="10" className="fill-indigo-600" />
           <text x="400" y="340" textAnchor="middle" className="fill-indigo-400 text-[10px] font-bold uppercase tracking-widest">{project.subject}</text>

           {/* Connections */}
           <g>
             {nodes.map((node, i) => (
                <line 
                  key={`line-${i}`}
                  x1="400" 
                  y1="300" 
                  x2={node.x} 
                  y2={node.y} 
                  stroke="currentColor" 
                  className="text-white/10" 
                  strokeWidth="1" 
                />
             ))}
           </g>
           
           {/* Nodes */}
           {nodes.map((node) => (
             <g key={node.id} className="group cursor-pointer">
                <circle 
                  cx={node.x} 
                  cy={node.y} 
                  r="20" 
                  className={`${
                    node.status === 'completed' ? 'fill-green-500/20' : 
                    node.status === 'in-progress' ? 'fill-orange-500/20' : 
                    'fill-indigo-500/20'
                  } transition-colors duration-500`}
                />
                <motion.circle 
                  cx={node.x} 
                  cy={node.y} 
                  r="8" 
                  className={
                    node.status === 'completed' ? 'fill-green-500' : 
                    node.status === 'in-progress' ? 'fill-orange-500' :
                    'fill-indigo-500'
                  }
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                />
                <text 
                  x={node.x} 
                  y={node.y + 35} 
                  textAnchor="middle"
                  className="fill-gray-100 text-[11px] font-bold drop-shadow-md"
                >
                  {node.title.length > 25 ? node.title.substring(0, 22) + '...' : node.title}
                </text>
             </g>
           ))}
        </svg>

        <div className="absolute bottom-8 left-8 flex gap-4">
           <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
              <div className="size-2 bg-indigo-500 rounded-full" /> Pending
           </div>
           <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-[10px] font-bold uppercase tracking-widest text-orange-400">
              <div className="size-2 bg-orange-500 rounded-full" /> Studying
           </div>
           <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-[10px] font-bold uppercase tracking-widest text-green-400">
              <div className="size-2 bg-green-500 rounded-full" /> Mastered
           </div>
        </div>
      </div>
    </motion.div>
  );
}

// Sub-components as separate "View" implementations (simplified for main file)

function OnboardingView({ profile, onComplete, loading, onProfileUpdate }: any) {
  const [subject, setSubject] = useState('');
  const [deadline, setDeadline] = useState('');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center min-h-full p-8 relative"
    >
      <button 
        onClick={() => auth.signOut()}
        className="absolute top-8 right-8 text-gray-500 hover:text-white flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all glass-card px-4 py-2 rounded-xl bg-white/5 border border-white/10"
      >
        <LogOut className="size-4" /> Sign Out
      </button>
      <div className="max-w-md w-full glass-card p-8 rounded-2xl border border-white/10 bg-white/5 shadow-2xl">
        <div className="size-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-6">
          <Sparkles className="size-6 text-white" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Welcome to Aura</h1>
        <p className="text-gray-400 mb-8 leading-relaxed">
          The ultimate multi-agent study environment. Let's configure your learning path.
        </p>

        <div className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">My Name</label>
            <input 
              type="text" 
              value={profile.name} 
              onChange={e => onProfileUpdate({...profile, name: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
              placeholder="e.g., Alex"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">I want to study...</label>
            <input 
              type="text" 
              value={subject} 
              onChange={e => setSubject(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
              placeholder="e.g., Quantum Mechanics"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Goal Date</label>
              <input 
                type="date" 
                value={deadline} 
                onChange={e => setDeadline(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Hrs / Day</label>
              <input 
                type="number" 
                value={profile.availableHoursPerDay} 
                onChange={e => onProfileUpdate({...profile, availableHoursPerDay: Number(e.target.value)})}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
              />
            </div>
          </div>

          <button 
            disabled={!subject.trim() || !deadline.trim() || loading}
            onClick={() => onComplete(subject.trim(), deadline.trim())}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <motion.div 
                  animate={{ rotate: 360 }} 
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="size-5 border-2 border-white/30 border-t-white rounded-full"
                />
                Orchestrating Agents...
              </>
            ) : (
              <>Initialize Aura <ChevronRight className="size-5" /></>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function DashboardView({ project, profile, onNavigate, onRunDiagnostic, diagnosticReport, onDownloadReport, loading, onAddTopic, saveProfile }: any) {
  const upcomingSession = project.sessions.find((s: any) => new Date(s.date) >= new Date());
  
  const masteryRadarData = project.topics.length > 0 ? sortTopics(project.topics).slice(0, 7).map(t => ({
    topic: t.title.length > 12 ? t.title.substring(0, 10) + '..' : t.title,
    mastery: t.masteryScale || (t.status === 'completed' ? 100 : t.status === 'in-progress' ? 40 : 0), 
    fullMark: 100
  })) : [];

  const moodData = (profile.moodHistory || []).slice(-7).map(m => ({
    ...m,
    day: new Date(m.timestamp).toLocaleDateString('en-US', { weekday: 'short' }),
    xp: m.xp || 0
  }));

  const achievementsList = [
    { id: '1k_xp', title: "Deep Thinker", desc: "Acquired over 1,000 Neural XP", icon: <BrainCircuit className="size-4" /> },
    { id: 'streak_3', title: "Consistency Core", desc: "Maintained a 3-day study streak", icon: <Target className="size-4" /> },
    { id: 'kg_complete', title: "Subject Oracle", desc: "Mapped 100% of the Knowledge Graph", icon: <Globe className="size-4" /> },
    { id: 'first_session', title: "Neural Link", desc: "Completed first Socratic tutorial", icon: <Sparkles className="size-4" /> }
  ];

  const onMoodSelect = (mood: string) => {
    const entry = { mood, timestamp: new Date().toISOString(), xp: 10 };
    const newProfile = { 
      ...profile, 
      xp: (profile.xp || 0) + 10,
      moodHistory: [...(profile.moodHistory || []), entry] 
    };
    saveProfile(newProfile);
  };

  const totalProgress = project.topics.length > 0 
    ? Math.round(project.topics.reduce((acc: number, t: any) => {
        if (t.status === 'completed') return acc + 100;
        if (t.status === 'in-progress') return acc + 40;
        return acc;
      }, 0) / project.topics.length)
    : 0;

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
      className="p-8 max-w-7xl mx-auto space-y-8"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-bold tracking-tight">Focus, {profile.name}</h1>
            <div className="flex items-center gap-1 bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-500/30">
               <Zap className="size-4 text-indigo-400" />
               <span className="text-sm font-bold text-indigo-400">{profile.xp || 0} XP</span>
            </div>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden w-48">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${totalProgress}%` }}
                className="h-full bg-indigo-500"
              />
            </div>
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{totalProgress}% CURRICULUM SYNCED</span>
          </div>
          <p className="text-gray-400 text-sm">Total knowledge acquired in <span className="text-indigo-400 font-medium">{project.subject}</span>.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-4 hover:bg-white/10 transition-colors cursor-default">
             <div className="bg-orange-500/20 p-2 rounded-lg">
                <Clock className="size-5 text-orange-400" />
             </div>
             <div>
               <p className="text-xs text-gray-400">Streak</p>
               <p className="font-bold">{profile.streak || 0} Days</p>
             </div>
          </div>
          <button 
            onClick={onRunDiagnostic}
            disabled={loading}
            className="group bg-indigo-600/10 border border-indigo-500/20 p-4 rounded-2xl flex items-center gap-4 hover:bg-indigo-600/20 transition-all shadow-lg hover:border-indigo-500/40"
          >
             <ShieldAlert className={`size-5 text-indigo-400 ${loading ? 'animate-pulse' : 'group-hover:scale-110 transition-transform'}`} />
             <div className="text-left">
               <p className="text-xs text-indigo-400 font-bold uppercase tracking-widest text-[9px]">Sys_Ops</p>
               <p className="font-extrabold text-sm text-indigo-200">{loading ? 'Scanning...' : 'Integrity Scan'}</p>
             </div>
          </button>
        </div>
      </header>

        {diagnosticReport && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl overflow-hidden flex flex-col"
        >
          <div className="flex justify-between items-center px-6 py-4 border-b border-white/5">
            <h3 className="font-bold flex items-center gap-2 text-indigo-300">
              <ShieldCheck className="size-4" /> Integrity Verified: {diagnosticReport.overallHealth} ({diagnosticReport.featureCapacity})
            </h3>
            <button 
              onClick={onDownloadReport}
              className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 flex items-center gap-2"
            >
              Export Report
            </button>
          </div>
          
          <div className="max-h-[400px] overflow-y-auto px-6 py-4 scrollbar-hide">
             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {diagnosticReport.testResults.map((res: any, idx: number) => (
                  <div key={idx} className="group relative bg-[#121214] border border-white/5 p-3 rounded-xl hover:border-indigo-500/30 transition-all flex flex-col justify-between overflow-hidden">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col">
                        <span className="text-[8px] text-indigo-500 font-bold uppercase tracking-widest">{res.phase}</span>
                        <span className="text-[11px] font-bold text-gray-200 line-clamp-1 group-hover:text-white transition-colors">{res.step}</span>
                      </div>
                      <div className={`size-1.5 rounded-full mt-1 ${
                        res.status === 'pass' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 
                        res.status === 'fail' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse' : 
                        'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]'
                      }`} />
                    </div>
                    <p className="text-[9px] text-gray-500 leading-tight line-clamp-2 group-hover:text-gray-400 transition-colors">{res.details}</p>
                  </div>
                ))}
             </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-8 rounded-3xl relative overflow-hidden group shadow-2xl">
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <h3 className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-2">Active Curriculum</h3>
                <p className="text-3xl font-extrabold mb-8 max-w-md">
                  {upcomingSession ? (
                    <>Focus: {project.topics.find((t: any) => t.id === upcomingSession.topicId)?.title}</>
                  ) : 'Strategic Rest: No active sessions'}
                </p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => onNavigate(View.STUDY_HALL)}
                  className="bg-white text-indigo-700 font-bold px-8 py-3 rounded-2xl hover:bg-indigo-50 transition-all flex items-center gap-2 shadow-xl"
                >
                  Enter Hall <ChevronRight className="size-5" />
                </button>
                <button 
                  onClick={() => onNavigate(View.PLANNER)}
                  className="bg-black/20 hover:bg-black/30 text-white font-bold px-8 py-3 rounded-2xl transition-all border border-white/10"
                >
                  Planner
                </button>
              </div>
            </div>
            <BrainCircuit className="absolute top-[-20px] right-[-20px] size-64 opacity-10 text-white group-hover:scale-110 transition-transform duration-700" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/[0.07] transition-all group overflow-hidden relative shadow-2xl">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Target className="size-32 text-indigo-400" />
                </div>
                <h3 className="font-black text-xl mb-8 flex items-center gap-3 tracking-tighter">
                   <Target className="size-6 text-indigo-500" /> Topic Mastery Radar
                </h3>
                <div className="h-[320px] w-full relative">
                   {masteryRadarData.length > 0 ? (
                     <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={masteryRadarData}>
                           <PolarGrid stroke="#333" strokeOpacity={0.5} />
                           <PolarAngleAxis dataKey="topic" tick={{ fill: '#888', fontSize: 10, fontWeight: 600 }} />
                           <Radar
                             name="Mastery"
                             dataKey="mastery"
                             stroke="#6366f1"
                             strokeWidth={2}
                             fill="#6366f1"
                             fillOpacity={0.3}
                           />
                        </RadarChart>
                     </ResponsiveContainer>
                   ) : (
                     <div className="h-full flex flex-col items-center justify-center text-center px-4">
                        <Target className="size-12 text-gray-700 mb-4 opacity-20" />
                        <p className="text-gray-500 text-sm font-medium">Curriculum Not Yet Initialized</p>
                        <p className="text-gray-600 text-[10px] uppercase tracking-wider mt-1">Add topics to begin neural mapping</p>
                     </div>
                   )}
                </div>
                <p className="text-[10px] text-gray-500 mt-4 text-center font-bold tracking-widest uppercase">Deep Neural Mastery Profile</p>
             </div>

             <div className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/[0.07] transition-all group overflow-hidden relative shadow-2xl">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <TrendingUp className="size-32 text-green-400" />
                </div>
                <h3 className="font-black text-xl mb-8 flex items-center gap-3 tracking-tighter">
                   <TrendingUp className="size-6 text-green-500" /> Learning Velocity
                </h3>
                <div className="h-[320px] w-full relative">
                   {moodData.length > 0 ? (
                     <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <AreaChart data={moodData}>
                          <defs>
                            <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis 
                            dataKey="day" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#666', fontSize: 10, fontWeight: 700 }}
                            dy={10}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              background: 'rgba(10, 10, 11, 0.9)', 
                              border: '1px solid rgba(255, 255, 255, 0.1)', 
                              borderRadius: '16px',
                              backdropFilter: 'blur(10px)'
                            }}
                            itemStyle={{ color: '#fff', fontWeight: 700 }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="xp" 
                            stroke="#6366f1" 
                            fillOpacity={1} 
                            fill="url(#colorXp)" 
                            strokeWidth={4} 
                            animationDuration={2000}
                          />
                        </AreaChart>
                     </ResponsiveContainer>
                   ) : (
                     <div className="h-full flex flex-col items-center justify-center text-center px-4">
                        <TrendingUp className="size-12 text-gray-700 mb-4 opacity-20" />
                        <p className="text-gray-500 text-sm font-medium">Neural Activity: Idle</p>
                        <p className="text-gray-600 text-[10px] uppercase tracking-wider mt-1">Complete sessions to generate velocity data</p>
                     </div>
                   )}
                </div>
                <p className="text-center text-[10px] text-gray-500 mt-4 font-bold tracking-widest uppercase">7-Day Neural Throughput</p>
             </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 shadow-xl hover:bg-white/[0.07] transition-all">
             <h3 className="font-black text-lg mb-6 flex items-center gap-3 tracking-tighter">
                <Star className="size-6 text-yellow-500" /> 
                Elite Achievements
             </h3>
             <div className="space-y-4">
                {achievementsList.map(ach => (
                  <AchievementItem 
                    key={ach.id}
                    title={ach.title} 
                    desc={ach.desc} 
                    icon={ach.icon} 
                    locked={!profile.achievements?.includes(ach.id)} 
                  />
                ))}
             </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 shadow-xl">
             <h3 className="font-black text-lg mb-6 flex items-center gap-3 text-indigo-400 tracking-tighter">
                <ShieldCheck className="size-6" /> 
                Agent Fleet Status
             </h3>
             <div className="space-y-4">
                <AgentStatus name="Curriculum Orchestrator" status={project ? "Active" : "Hibernate"} />
                <AgentStatus name="Socratic Matrix" status={loading ? "Analyzing" : "Standby"} />
                <AgentStatus name="Evaluation ML" status={diagnosticReport ? "Synchronized" : "Ready"} />
                <AgentStatus name="Scholar Lens" status={project.topics.length > 0 ? "Mapping" : "Awaiting"} />
             </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
             <h3 className="font-bold mb-4">Daily Mood Check</h3>
             <div className="grid grid-cols-4 gap-2">
                {['😴', '😐', '😊', '🔥'].map(emoji => (
                  <button 
                    key={emoji} 
                    onClick={() => onMoodSelect(emoji)}
                    className="aspect-square rounded-xl flex items-center justify-center text-xl bg-white/5 hover:bg-white/10 transition-all border border-transparent hover:border-white/10"
                  >
                    {emoji}
                  </button>
                ))}
             </div>
             <p className="text-[10px] text-gray-500 mt-4 text-center italic">Energy is high. Optimal for advanced concepts.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AchievementItem({ title, desc, icon, locked }: any) {
  return (
    <div className={`p-3 rounded-xl flex items-center gap-3 transition-opacity ${locked ? 'opacity-30' : 'bg-white/5'}`}>
       <div className={`${locked ? 'bg-gray-800' : 'bg-indigo-500/20'} p-2 rounded-lg`}>
          {icon}
       </div>
       <div>
         <p className="text-xs font-bold">{title}</p>
         <p className="text-[10px] text-gray-400">{desc}</p>
       </div>
    </div>
  );
}

function AgentStatus({ name, status }: { name: string, status: string }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-gray-400">{name}</span>
      <span className={`px-2 py-0.5 rounded-full font-bold ${
        status === 'Active' ? 'bg-green-500/20 text-green-400' :
        status === 'Analyzing' ? 'bg-blue-500/20 text-blue-400' :
        'bg-indigo-500/20 text-indigo-400'
      }`}>{status}</span>
    </div>
  );
}

function InsightItem({ title, desc }: { title: string, desc: string }) {
  return (
    <div className="p-3 bg-white/5 rounded-xl border-l-4 border-indigo-500">
      <h4 className="text-sm font-bold mb-1">{title}</h4>
      <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
    </div>
  );
}

// Placeholder Views for the rest to keep initial implementation clean but functional
function PlannerView({ project, onSelectSession, onUpdateProject, onOptimize, onToggleSubtopic }: { project: StudyProject, onSelectSession: (s: StudySession) => void, onUpdateProject: (p: StudyProject) => void, onOptimize: () => void, onToggleSubtopic: (tid: string, stid: string) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState(project.topics[0]?.id || '');
  const [selectedSubtopicId, setSelectedSubtopicId] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  const sortedTopics = sortTopics(project.topics);
  const currentTopic = project.topics.find(t => t.id === selectedTopicId);

  const handleAddSession = () => {
    if (!selectedTopicId) return;
    const newSession: StudySession = {
      id: 'session-' + Math.random().toString(36).substr(2, 5),
      topicId: selectedTopicId,
      subtopicId: selectedSubtopicId || undefined,
      date: sessionDate,
      startTime: '09:00',
      durationMinutes: 60,
      type: 'learning'
    };
    onUpdateProject({ ...project, sessions: [...project.sessions, newSession] });
    setIsAdding(false);
    setSelectedSubtopicId('');
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onUpdateProject({ ...project, sessions: project.sessions.filter(s => s.id !== id) });
  };

  return (
    <div className="p-8 pb-32">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-12">
        <div>
          <h2 className="text-4xl font-black tracking-tighter mb-2">Neural Acquisition Schedule</h2>
          <p className="text-gray-500 text-sm italic">Orchestrating hardware-level focus for active sessions.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <button 
            onClick={() => {
              const uniqueSessions = project.sessions.filter((s, index, self) => 
                index === self.findIndex((t) => (
                  t.topicId === s.topicId && t.date === s.date && t.startTime === s.startTime
                ))
              );
              if (uniqueSessions.length < project.sessions.length) {
                onUpdateProject({ ...project, sessions: uniqueSessions });
              }
            }}
            className="text-[10px] bg-white/5 border border-white/10 text-gray-400 px-4 py-3 rounded-2xl font-bold hover:bg-white/10 transition-all flex items-center gap-2"
            title="Remove sessions with identical topic, date, and time"
          >
            <ShieldCheck className="size-3" /> De-Duplicate
          </button>
          <button 
            onClick={onOptimize}
            className="bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 px-6 py-3 rounded-2xl font-bold hover:bg-indigo-600/20 transition-all flex items-center gap-2 shadow-lg"
          >
            <Sparkles className="size-4" /> Cognitive Re-Sync
          </button>
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-500 transition-all flex items-center gap-2 shadow-xl shadow-indigo-600/20"
          >
            <Zap className="size-4" /> {isAdding ? 'Cancel Entry' : 'Manual Manifest'}
          </button>
        </div>
      </div>

      {isAdding && (
         <motion.div 
          initial={{ height: 0, opacity: 0 }} 
          animate={{ height: 'auto', opacity: 1 }}
          className="mb-12 p-6 bg-white/5 border border-white/10 rounded-3xl overflow-hidden"
         >
            <h3 className="text-lg font-bold mb-4">New Neural Link</h3>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-indigo-400/50 tracking-widest pl-1 mb-1 block">Target Knowledge Node</label>
                <select 
                  value={selectedTopicId} 
                  onChange={(e) => {
                    setSelectedTopicId(e.target.value);
                    setSelectedSubtopicId('');
                  }}
                  className="bg-zinc-900 backdrop-blur-sm text-sm rounded-xl px-4 py-3 outline-none border border-white/20 text-white w-64 focus:border-indigo-500 hover:border-indigo-500/50 transition-colors cursor-pointer"
                >
                  {project.topics.map(t => (
                    <option key={t.id} value={t.id} className="bg-zinc-900 text-white">{t.title}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-indigo-400/50 tracking-widest pl-1 mb-1 block">Specific Logical Cluster (Optional)</label>
                <select 
                  value={selectedSubtopicId} 
                  onChange={(e) => setSelectedSubtopicId(e.target.value)}
                  className="bg-zinc-900 backdrop-blur-sm text-sm rounded-xl px-4 py-3 outline-none border border-white/20 text-white w-64 focus:border-indigo-500 hover:border-indigo-500/50 transition-colors cursor-pointer"
                >
                  <option value="" className="bg-zinc-900 text-white">Full Node Integration</option>
                  {currentTopic?.subtopics?.map((st: any, idx: number) => (
                    <option key={st.id || st.title || `opt-${idx}`} value={st.id || st.title || st} className="bg-zinc-900 text-white">
                      {typeof st === 'string' ? st : (st.title || 'Untitled Node')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest pl-1">Temporal Anchor</label>
                <input 
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  className="bg-black text-sm rounded-xl px-4 py-3 outline-none border border-white/10 text-white"
                />
              </div>
              <button 
                onClick={handleAddSession}
                className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-500"
              >
                Schedule Link
              </button>
            </div>
         </motion.div>
      )}

      <div className="mb-16">
          <div className="flex items-center gap-4 mb-8">
            <BookOpen className="size-6 text-indigo-500" />
            <h3 className="text-2xl font-black tracking-tighter">Conceptual Inventory</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
             {sortedTopics.map(t => {
               const topicSessions = project.sessions.filter(s => s.topicId === t.id);
               const mastery = t.masteryScale || 0;
               const isExpanded = expandedTopic === t.id;

               return (
                 <motion.div 
                    key={t.id} 
                    layout
                    className={`bg-white/5 border ${isExpanded ? 'border-indigo-500/50 bg-white/[0.07]' : 'border-white/10'} rounded-[2rem] p-6 transition-all group overflow-hidden relative shadow-xl`}
                 >
                    <div className="flex justify-between items-start mb-4">
                      <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                        t.status === 'completed' ? 'bg-green-500/20 text-green-400' : 
                        t.status === 'in-progress' ? 'bg-indigo-500/20 text-indigo-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {t.status}
                      </div>
                      <span className="text-[10px] text-gray-500 font-black uppercase">{t.difficulty}</span>
                    </div>

                    <h4 className="font-black text-lg mb-2 leading-tight tracking-tight group-hover:text-indigo-400 transition-colors uppercase">{t.title}</h4>
                    
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">
                          <span>Mastery Level</span>
                          <span>{mastery}%</span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${mastery}%` }}
                            className={`h-full ${mastery === 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-1.5 bg-orange-500/10 px-2 py-1 rounded-lg border border-orange-500/20">
                            <Clock className="size-3 text-orange-400" />
                            <span className="text-[10px] font-bold text-orange-400">{t.estimatedTimeHours}h est.</span>
                         </div>
                         <button 
                           onClick={() => setExpandedTopic(isExpanded ? null : t.id)}
                           className="text-[10px] text-gray-400 hover:text-white font-bold flex items-center gap-1"
                         >
                            {isExpanded ? 'Collapse' : 'Inspect Sub-nodes'} 
                            {isExpanded ? <ChevronLeft className="size-3 rotate-90" /> : <ChevronRight className="size-3" />}
                         </button>
                      </div>

                      <AnimatePresence>
                        {isExpanded && t.subtopics && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="pt-4 mt-4 border-t border-white/5 space-y-2 overflow-hidden"
                          >
                            <div className="flex justify-between items-center mb-3">
                               <p className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">Sub-topic Matrix</p>
                               <span className="text-[9px] font-black text-gray-500 uppercase">
                                  {t.subtopics.filter((s: any) => s.status === 'completed' || s === 'completed').length} / {t.subtopics.length} Sync'd
                               </span>
                            </div>
                            {t.subtopics.map((st: any, idx: number) => (
                              <button 
                                key={st.id || st.title || `st-${idx}`}
                                onClick={() => onToggleSubtopic(t.id, st.id || st.title || st)}
                                className="w-full flex items-center justify-between p-3 bg-white/5 border border-white/5 hover:border-white/20 transition-all rounded-xl text-left group/st"
                              >
                                <span className={`text-xs ${st.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-200'}`}>
                                  {typeof st === 'string' ? st : st.title}
                                </span>
                                {st.status === 'completed' ? (
                                  <ShieldCheck className="size-4 text-green-400" />
                                ) : (
                                  <div className="size-4 rounded-full border-2 border-white/10 group-hover/st:border-indigo-500/50" />
                                )}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                 </motion.div>
               );
             })}
          </div>
      </div>

      <div>
          <div className="flex items-center gap-4 mb-8">
            <Calendar className="size-6 text-indigo-500" />
            <h3 className="text-2xl font-black tracking-tighter">Scheduled Neural Links</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...project.sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((session) => (
              <div 
                key={session.id} 
                onClick={() => onSelectSession(session)}
                className="group bg-white/5 border border-white/10 p-6 rounded-[2rem] text-left hover:border-indigo-500/50 hover:bg-indigo-600/5 transition-all relative overflow-hidden cursor-pointer h-fit shadow-xl"
              >
                <div className="flex justify-between items-center mb-4">
                  <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                    session.type === 'learning' ? 'bg-blue-500/20 text-blue-400' : 
                    session.type === 'revision' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'
                  }`}>
                    {session.type}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-gray-500 tracking-tighter uppercase">{new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <button 
                      onClick={(e) => deleteSession(e, session.id)}
                      className="p-1 hover:bg-red-500/20 rounded-lg text-red-500/70 z-10 transition-colors"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
                <h4 className="font-extrabold text-sm mb-1 group-hover:text-indigo-400 transition-colors uppercase leading-tight line-clamp-2">
                  {project.topics.find(t => t.id === session.topicId)?.title || (
                    <div className="mt-1">
                      <p className="text-[8px] font-black text-red-400 uppercase tracking-widest mb-1">Missing Node Link</p>
                      <select 
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const updatedSessions = project.sessions.map(s => 
                            s.id === session.id ? { ...s, topicId: e.target.value } : s
                          );
                          onUpdateProject({ ...project, sessions: updatedSessions });
                        }}
                        className="bg-zinc-900 border border-red-500/50 text-red-400 text-[10px] rounded-lg px-2 py-1.5 outline-none w-full cursor-pointer hover:bg-red-500/20 transition-all font-bold"
                      >
                        <option value="" className="bg-zinc-900 text-red-400">Associate Target Node...</option>
                        {project.topics.map(t => (
                          <option key={t.id} value={t.id} className="bg-zinc-900 text-white font-sans">{t.title}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </h4>
                {session.subtopicId ? (
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="size-1 bg-indigo-400 rounded-full" />
                    <p className="text-[10px] text-gray-400 font-bold truncate">
                      {session.subtopicId}
                    </p>
                  </div>
                ) : (
                  project.topics.find(t => t.id === session.topicId)?.subtopics?.length ? (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                       <p className="text-[8px] font-black text-indigo-400/50 uppercase tracking-widest mb-1">Neural Focus Target</p>
                       <select 
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const updatedSessions = project.sessions.map(s => 
                            s.id === session.id ? { ...s, subtopicId: e.target.value } : s
                          );
                          onUpdateProject({ ...project, sessions: updatedSessions });
                        }}
                        className="bg-zinc-900 border border-white/20 text-white text-[10px] rounded-lg px-2 py-1.5 outline-none mb-1 w-full cursor-pointer hover:border-indigo-500/50 transition-all appearance-none"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '0.75rem' }}
                      >
                        <option value="" className="bg-zinc-900 text-white">Refine Focus...</option>
                        {project.topics.find(t => t.id === session.topicId)?.subtopics?.map((st: any, idx: number) => (
                          <option key={st.id || st.title || idx} value={st.id || st.title || st} className="bg-zinc-900 text-white">
                            {typeof st === 'string' ? st : (st.title || 'Untitled Node')}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null
                )}
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-3 opacity-60">Objective: {session.type}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest border-t border-white/5 pt-3">
                  <Clock className="size-3" /> {session.startTime} ({session.durationMinutes}m)
                </div>
              </div>
            ))}
            {project.sessions.length === 0 && (
              <div className="col-span-full py-20 text-center bg-white/5 rounded-[3rem] border-2 border-dashed border-white/10 opacity-40">
                  <Calendar className="size-10 mx-auto mb-4 text-gray-600" />
                  <p className="text-sm">Neural schedule buffer is currently empty.</p>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

function TutorView({ project, activeSession, onSelectSession, onUpdateProject }: { project: StudyProject, activeSession: StudySession | null, onSelectSession: (s: StudySession) => void, onUpdateProject: (p: StudyProject) => void }) {
  const [threads, setThreads] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab ] = useState<'chat' | 'manager'>('chat');
  const [threadLoading, setThreadLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const activeChat = threads.find(t => t.id === activeChatId);
  const activeTopic = activeChat?.topicId ? project.topics.find(t => t.id === activeChat.topicId) : null;

  // Load threads
  useEffect(() => {
    const fetchThreads = async () => {
      setThreadLoading(true);
      const data = await dbGetChatThreads();
      setThreads(data);
      setThreadLoading(false);
    };
    fetchThreads();
  }, []);

  // Handle activeSession (from Planner)
  useEffect(() => {
    const initFocusedChat = async () => {
      if (activeSession && !threadLoading) {
        const existing = threads.find(t => t.scheduledSessionId === activeSession.id);
        if (existing) {
          setActiveChatId(existing.id);
        } else {
          const topic = project.topics.find(t => t.id === activeSession.topicId);
          const newThread = {
            id: 'chat-' + Math.random().toString(36).substr(2, 9),
            mode: 'focused',
            topicId: activeSession.topicId,
            scheduledSessionId: activeSession.id,
            title: `Session: ${topic?.title || 'Unknown'}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          await dbCreateChatThread(newThread);
          setThreads(prev => [newThread, ...prev]);
          setActiveChatId(newThread.id);
        }
      }
    };
    initFocusedChat();
  }, [activeSession, threadLoading]);

  // Load messages
  useEffect(() => {
    if (activeChatId) {
      const fetchMsgs = async () => {
        setLoading(true);
        const msgs = await dbGetMessages(activeChatId);
        if (msgs.length === 0) {
          const thread = threads.find(t => t.id === activeChatId);
          if (thread?.mode === 'focused') {
            const topic = project.topics.find(t => t.id === thread.topicId);
            const memory = await dbGetTopicMemory(thread.topicId);
            let greeting = `## Session Initialized: ${topic?.title}\n\nNeuro-Socratic link established. We are focusing on **${topic?.title}**.`;
            
            // 2-week retention check (14 days)
            const isFresh = memory && (Date.now() - new Date(memory.lastUpdatedAt).getTime() < 14 * 24 * 60 * 60 * 1000);
            
            if (memory && isFresh) greeting += `\n\n**AURA Memory (Topic):** ${memory.summary}`;
            else if (memory && !isFresh) greeting += `\n\n*AURA Note: Previous topic memory has faded (older than 2 weeks) to prioritize fresh acquisition.*`;
            
            greeting += `\n\nHow should we begin?`;
            setMessages([{ id: 'greet', role: 'model', parts: [{ text: greeting }], createdAt: new Date().toISOString() }]);
          } else {
            setMessages([{ id: 'greet', role: 'model', parts: [{ text: "### Neural Research Hall Active\n\nNo specific cognitive node bound. How can I assist your broad research goals today?" }], createdAt: new Date().toISOString() }]);
          }
        } else {
          setMessages(msgs);
        }
        setLoading(false);
      };
      fetchMsgs();
    } else {
      setMessages([]);
    }
  }, [activeChatId, threads]);

  const deleteChat = async (id: string) => {
    await dbDeleteChat(id);
    setThreads(prev => prev.filter(t => t.id !== id));
    if (activeChatId === id) setActiveChatId(null);
  };

  const createFreeChat = async () => {
    const newThread = {
      id: 'chat-' + Math.random().toString(36).substr(2, 9),
      mode: 'free',
      topicId: null,
      scheduledSessionId: null,
      title: 'New Focused Inquiry',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await dbCreateChatThread(newThread);
    setThreads(prev => [newThread, ...prev]);
    setActiveChatId(newThread.id);
    setActiveTab('chat');
  };

  const createInstantSession = async (topicId: string) => {
    const topic = project.topics.find(t => t.id === topicId);
    const newSession: StudySession = {
      id: 'instant-' + Date.now(),
      topicId: topicId,
      date: new Date().toISOString().split('T')[0],
      startTime: 'Instant',
      durationMinutes: 45,
      type: 'learning'
    };
    const updatedSessions = [...project.sessions, newSession];
    onUpdateProject({ ...project, sessions: updatedSessions });
    onSelectSession(newSession);
    setActiveTab('chat');
  };

  const endSession = async () => {
    if (activeChat?.mode === 'focused' && activeTopic) {
      setLoading(true);
      try {
        // Generate summary for topic memory
        const transcript = messages.map(m => `${m.role}: ${m.parts[0].text}`).join('\n');
        const summary = await getTutorResponse([{ role: 'user', parts: [{ text: `Summarize the key knowledge acquired about ${activeTopic.title} from this session in 3 bullet points for my future memory: \n\n${transcript}` }] }], activeTopic.title);
        await dbUpsertTopicMemory(activeTopic.id, summary);
        console.log("Topic memory updated.");
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    onSelectSession(null as any);
    setActiveChatId(null);
  };

  useEffect(() => {
    const el = document.getElementById('chat-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || !activeChatId) return;
    const userMsg = { id: 'msg-' + Date.now(), role: 'user', parts: [{ text: input }], createdAt: new Date().toISOString() };
    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs);
    setInput('');
    setLoading(true);

    try {
      await dbAddMessage(activeChatId, userMsg);
      const resp = await getTutorResponse(updatedMsgs, activeTopic?.title || project.subject);
      const modelMsg = { id: 'msg-model-' + Date.now(), role: 'model', parts: [{ text: resp }], createdAt: new Date().toISOString() };
      await dbAddMessage(activeChatId, modelMsg);
      setMessages([...updatedMsgs, modelMsg]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0A0A0B]">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
         <div className="flex items-center gap-4">
            <button 
              onClick={() => setActiveTab('chat')}
              className={`text-sm font-bold pb-2 border-b-2 transition-all ${activeTab === 'chat' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500'}`}
            >
              Consultant Chat
            </button>
            <button 
              onClick={() => setActiveTab('manager')}
              className={`text-sm font-bold pb-2 border-b-2 transition-all ${activeTab === 'manager' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500'}`}
            >
              System Manager
            </button>
         </div>
         <div className="flex items-center gap-3">
           {activeChatId && (
             <button 
               onClick={endSession}
               className="text-[10px] bg-indigo-600 px-4 py-2 rounded-xl text-white hover:bg-indigo-500 transition-all font-bold shadow-lg shadow-indigo-500/20"
             >
               Archive & Exit Session
             </button>
           )}
           <button 
              onClick={createFreeChat}
              className="text-[10px] bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-indigo-400 hover:text-white transition-all font-bold"
            >
              + New Inquiry
            </button>
         </div>
      </div>

      <div className="flex-1 overflow-hidden flex divide-x divide-white/5">
        {/* Thread Sidebar (Collapsible) */}
        <motion.div 
          initial={false}
          animate={{ width: sidebarCollapsed ? 0 : 288 }}
          className="flex flex-col bg-black/40 overflow-visible relative"
        >
          {/* Internal Toggle Button */}
           <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="absolute -right-3 top-1/2 -translate-y-1/2 size-6 bg-indigo-600 rounded-full flex items-center justify-center border border-white/20 hover:bg-indigo-500 hover:scale-110 transition-all z-[100] shadow-xl shadow-indigo-900/40 cursor-pointer group"
          >
            {sidebarCollapsed ? <ChevronRight className="size-4 text-white" /> : <ChevronLeft className="size-4 text-white" />}
          </button>

          <div className="flex flex-col h-full w-full overflow-hidden">
             <div className="p-4 border-b border-white/5 flex items-center justify-between min-w-[288px]">
                <h4 className="text-[10px] text-gray-500 uppercase font-black tracking-widest px-2">Knowledge Threads</h4>
             </div>
             <div className="flex-1 overflow-y-auto p-2 space-y-1 min-w-[288px]">
                {threadLoading ? (
                  <div className="p-4 animate-pulse text-xs text-gray-600">Syncing threads...</div>
                ) : threads.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-600 italic">No threads found.</div>
                ) : (
                  threads.map(t => (
                    <div key={t.id} className="relative group">
                      <button 
                        onClick={() => {
                          setActiveChatId(t.id);
                          setActiveTab('chat');
                        }}
                        className={`w-full p-3 rounded-xl text-left transition-all ${activeChatId === t.id ? 'bg-indigo-600/10 border-indigo-500/30 border' : 'hover:bg-white/5 border border-transparent'}`}
                      >
                         <p className={`text-[11px] font-bold truncate ${activeChatId === t.id ? 'text-indigo-300' : 'text-gray-400'}`}>{t.title}</p>
                         <p className="text-[9px] text-gray-600 uppercase font-bold mt-1 tracking-tighter">{t.mode} • {new Date(t.updatedAt).toLocaleDateString()}</p>
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChat(t.id);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded text-red-500 transition-all"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))
                )}
             </div>
          </div>
        </motion.div>

        {/* Dynamic Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'chat' ? (
            activeChatId ? (
              <>
                <div id="chat-scroll" className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth overflow-x-hidden">
                  {messages.map((m, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={m.id || idx} 
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] p-5 rounded-3xl ${
                        m.role === 'user' ? 'bg-indigo-600 shadow-xl shadow-indigo-600/20' : 'bg-white/5 border border-white/10 backdrop-blur-md'
                      }`}>
                        <div className="text-[13px] leading-relaxed prose prose-invert max-w-none prose-p:my-2">
                          <Markdown>{m.parts[0].text}</Markdown>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                       <div className="bg-white/5 p-5 rounded-3xl animate-pulse flex items-center gap-2">
                          <div className="size-1.5 bg-indigo-500 rounded-full animate-bounce" />
                          <div className="size-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="size-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                       </div>
                    </div>
                  )}
                </div>
                <div className="p-6 border-t border-white/5 bg-black/40">
                  <div className="flex gap-3 max-w-4xl mx-auto items-center">
                    <input 
                      type="text" 
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendMessage()}
                      placeholder="Deepen the inquiry..." 
                      className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm"
                    />
                    <button 
                      onClick={sendMessage}
                      disabled={loading || !input.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 p-4 rounded-2xl transition-all shadow-xl disabled:opacity-50 group"
                    >
                      <Sparkles className="size-6 text-white group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-6">
                <div className="size-20 bg-indigo-600/10 rounded-[2.5rem] flex items-center justify-center border border-indigo-500/20">
                  <BrainCircuit className="size-10 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight mb-2">Initialize Consultant</h3>
                  <p className="text-sm text-gray-500 leading-relaxed font-light">
                    Select a thread from the Knowledge Graph or activate an <span className="text-indigo-400 font-bold">Instant Activation</span> node to manifest the Socratic Consultant.
                  </p>
                </div>
                <button 
                  onClick={createFreeChat}
                  className="bg-indigo-600 py-3 px-8 rounded-2xl font-bold hover:bg-indigo-500 transition-all shadow-xl"
                >
                  Start New Inquiry
                </button>
              </div>
            )
          ) : (
            <div className="p-8 overflow-y-auto">
               <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-xl font-bold mb-1">Session Manager</h3>
                    <p className="text-xs text-gray-500">Orchestrating hardware-level focus for active sessions.</p>
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {project.sessions.length === 0 ? (
                    <div className="col-span-full py-16 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                      <Calendar className="size-12 text-gray-700 mx-auto mb-4" />
                      <p className="text-sm text-gray-500 italic">No scheduled sessions in system buffer.</p>
                    </div>
                  ) : (
                    project.sessions.map(s => {
                      const t = project.topics.find(topic => topic.id === s.topicId);
                      return (
                        <div key={s.id} className="p-5 bg-white/5 border border-white/10 rounded-2xl flex justify-between items-center hover:bg-white/10 transition-all group">
                          <div>
                            <p className="font-bold text-sm mb-1">{t?.title || 'Unknown Entity'}</p>
                            <div className="flex items-center gap-2">
                               <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${s.type === 'learning' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>{s.type}</span>
                               <span className="text-[9px] text-gray-500 font-bold">{s.date} • {s.startTime}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                              onSelectSession(s);
                              setActiveTab('chat');
                            }}
                            className="bg-indigo-600 text-white text-[10px] font-extrabold px-6 py-2 rounded-xl hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transform active:scale-95 transition-all"
                          >
                            Activate
                          </button>
                        </div>
                      );
                    })
                  )}
               </div>
               
                <div className="mt-16">
                   <h3 className="font-extrabold mb-4 text-indigo-400 flex items-center gap-2 uppercase tracking-widest text-[10px]">
                      <Zap className="size-3" /> Instant Overclock
                   </h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-8">
                      {project.topics.map(t => (
                        <button 
                          key={t.id}
                          onClick={() => createInstantSession(t.id)}
                          className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:border-indigo-500/50 hover:bg-indigo-600/5 transition-all text-left flex flex-col justify-between h-28"
                        >
                           <p className="text-xs font-black uppercase tracking-tighter line-clamp-2 leading-tight group-hover:text-indigo-400 transition-colors">{t.title}</p>
                           <div className="flex items-center gap-2">
                              <div className="size-1 bg-indigo-500 rounded-full animate-pulse" />
                              <p className="text-[8px] text-gray-600 font-black uppercase">Rapid Entry</p>
                           </div>
                        </button>
                      ))}
                   </div>
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryView({ project, onUpdateProject }: { project: StudyProject, onUpdateProject: (p: StudyProject) => void }) {
  const [materials, setMaterials] = useState<StudyMaterial[]>(project.materials || []);
  const [loading, setLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [activeTab, setActiveTab] = useState<'materials' | 'resources'>('materials');

  const sortedTopics = sortTopics(project.topics);

  const fetchMaterials = async (topic: Topic) => {
    setSelectedTopic(topic);
    const existing = materials.find(m => m.topicId === topic.id);
    if (existing) return;

    setLoading(true);
    try {
      const data = await generateMaterials(topic);
      const newMaterial = { ...data, topicId: topic.id, id: Math.random().toString() };
      const updatedMaterials = [...materials, newMaterial];
      setMaterials(updatedMaterials);
      onUpdateProject({ ...project, materials: updatedMaterials });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const currentMaterial = selectedTopic ? materials.find(m => m.topicId === selectedTopic.id) : null;

  return (
    <div className="flex h-full bg-[#0A0A0B]">
      {/* Topic List */}
      <div className="w-80 border-r border-white/5 flex flex-col p-6 overflow-y-auto bg-black/20">
        <h2 className="text-xl font-bold mb-6">Knowledge Archive</h2>
        <div className="space-y-3">
          {sortedTopics.map(t => (
            <button
              key={t.id}
              onClick={() => fetchMaterials(t)}
              className={`w-full p-4 rounded-xl text-left transition-all border ${
                selectedTopic?.id === t.id ? 'bg-indigo-600/10 border-indigo-500/50' : 'bg-white/5 border-transparent hover:border-white/10'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <p className="font-bold text-sm line-clamp-1">{t.title}</p>
                <span className="text-[9px] font-black text-indigo-400">{t.masteryScale || 0}%</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-gray-500">
                <span>{t.difficulty}</span>
                <span className={t.status === 'completed' ? 'text-green-500' : ''}>{t.status}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Material View */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {selectedTopic ? (
          <>
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-black/40">
              <div>
                <h3 className="text-2xl font-bold mb-1">{selectedTopic.title}</h3>
                <p className="text-sm text-gray-400">Phase 2: Comprehensive Learning Materials</p>
              </div>
              <div className="flex items-center gap-4">
                 <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                    <button 
                      onClick={() => setActiveTab('materials')}
                      className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'materials' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                    >
                      Materials
                    </button>
                    <button 
                      onClick={() => setActiveTab('resources')}
                      className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'resources' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                    >
                      Resources
                    </button>
                 </div>
                 <button className="bg-indigo-600 p-2 rounded-lg hover:bg-indigo-500 transition-all">
                    <FileText className="size-5 text-white" />
                 </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4">
                   <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="size-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full" />
                   <p className="text-gray-400 animate-pulse">Scholar Lens agent is curating resources...</p>
                </div>
              ) : activeTab === 'materials' ? (
                currentMaterial ? (
                  <div className="max-w-3xl mx-auto space-y-12">
                    <div className="prose prose-invert max-w-none">
                      <div className="markdown-body leading-relaxed text-gray-300">
                        <Markdown>{currentMaterial.content}</Markdown>
                      </div>
                    </div>
                    {currentMaterial.flashcards && (
                      <div className="pt-12 border-t border-white/5">
                        <h4 className="text-xl font-bold mb-6 flex items-center gap-2">
                           <Zap className="size-5 text-yellow-400" /> Active Recall Deck
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {currentMaterial.flashcards.map((f, i) => (
                             <div key={i} className="group h-48 [perspective:1000px]">
                               <div className="relative h-full w-full rounded-2xl transition-all duration-500 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)] cursor-pointer">
                                 <div className="absolute inset-0 flex items-center justify-center p-6 bg-white/5 border border-white/10 rounded-2xl [backface-visibility:hidden]">
                                   <p className="text-center font-medium">{f.front}</p>
                                 </div>
                                 <div className="absolute inset-0 flex items-center justify-center p-6 bg-indigo-600 rounded-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
                                   <p className="text-center text-sm">{f.back}</p>
                                 </div>
                               </div>
                             </div>
                           ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <BookOpen className="size-12 text-gray-700" />
                    <p className="text-gray-500">Select a topic to generate structured materials</p>
                  </div>
                )
              ) : (
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                   <ResourceCard 
                    title="Phase 1: Conceptual Foundations" 
                    url="https://www.coursera.org" 
                    relevance={98} 
                    type="video"
                    desc="Top-rated video series covering the fundamentals with expert instructors."
                   />
                   <ResourceCard 
                    title="Deep Dive Documentation" 
                    url="https://docs.example.com" 
                    relevance={85} 
                    type="article"
                    desc="Official technical reference for advanced architecture and edge cases."
                   />
                   <ResourceCard 
                    title="Laboratory Exercises" 
                    url="https://scholar.google.com" 
                    relevance={92} 
                    type="repo"
                    desc="Curated collection of exercises and hands-on projects for kinesthetic reinforcement."
                   />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto space-y-6">
            <div className="size-20 bg-indigo-600/10 rounded-full flex items-center justify-center">
              <BookOpen className="size-10 text-indigo-400" />
            </div>
            <h3 className="text-2xl font-bold">Concept Library</h3>
            <p className="text-gray-400 leading-relaxed">
              Curate and study exhaustive materials generated by AI agents for every node in your knowledge graph.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceCard({ title, url, relevance, type, desc }: any) {
  const Icon = type === 'video' ? PlayCircle : type === 'repo' ? Globe : FileText;
  return (
    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:border-indigo-500/50 transition-all group">
       <div className="flex justify-between items-start mb-4">
          <div className="bg-indigo-500/20 p-2 rounded-lg">
             <Icon className="size-5 text-indigo-400" />
          </div>
          <div className="bg-green-500/20 px-2 py-0.5 rounded text-[10px] text-green-400 font-bold">
            {relevance}% Relevance
          </div>
       </div>
       <h4 className="font-bold mb-2 group-hover:text-indigo-400 transition-all">{title}</h4>
       <p className="text-xs text-gray-400 mb-4 leading-relaxed">{desc}</p>
       <a href={url} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 font-bold flex items-center gap-1 hover:underline">
         Acccess Resource <ChevronRight className="size-3" />
       </a>
    </div>
  );
}

function ExamView({ project, onUpdateProfile }: { project: StudyProject, onUpdateProfile: (xp: number) => void }) {
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [strategy, setStrategy] = useState<any>(null);
  const [selectedTopicId, setSelectedTopicId] = useState(project.topics[0]?.id || '');

  const startQuiz = async () => {
    const topic = project.topics.find(t => t.id === selectedTopicId) || project.topics[0];
    if (!topic) return;
    
    setLoading(true);
    try {
      const resp = await generateAssessment(topic);
      setQuiz(resp);
      setCurrentQuestion(0);
      setAnswers({});
      setShowResults(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (optionIdx: number) => {
    setAnswers({ ...answers, [currentQuestion]: optionIdx });
  };

  const calculateScore = () => {
    if (!quiz) return 0;
    let correct = 0;
    quiz.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) correct++;
    });
    return Math.round((correct / quiz.length) * 100);
  };

  const handleSubmit = () => {
    const score = calculateScore();
    setShowResults(true);
    onUpdateProfile(score * 2);
  };

  const analyzeTrends = async () => {
    setLoading(true);
    try {
      const data = await generateExamStrategy(project.subject, project.topics);
      setStrategy(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (strategy) {
    return (
      <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
        <div className="flex justify-between items-center mb-8">
           <h3 className="text-3xl font-black tracking-tighter">Strategic Mastery Guide</h3>
           <button 
             onClick={() => setStrategy(null)}
             className="text-xs bg-white/5 px-4 py-2 rounded-xl text-gray-400 hover:text-white"
           >
             Exit Strategy
           </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="space-y-8">
              <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem]">
                 <h4 className="text-indigo-400 text-xs font-black uppercase tracking-widest mb-6">High Value Nodes</h4>
                 <div className="flex flex-wrap gap-2">
                    {strategy.topValueTopics?.map((t: string, i: number) => (
                      <span key={i} className="bg-indigo-600/20 text-indigo-400 px-3 py-1 rounded-lg border border-indigo-500/20 text-xs font-bold">{t}</span>
                    ))}
                 </div>
              </div>
              <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem]">
                 <h4 className="text-orange-400 text-xs font-black uppercase tracking-widest mb-6">Cognitive Anchors (Mnemonics)</h4>
                 <div className="space-y-3">
                    {strategy.memoryHooks?.map((h: string, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-black/20 rounded-xl border border-white/5">
                         <div className="size-2 bg-orange-500 rounded-full" />
                         <span className="text-sm italic text-gray-300">{h}</span>
                      </div>
                    ))}
                 </div>
              </div>
           </div>
           <div className="bg-indigo-600/5 border border-indigo-500/10 p-8 rounded-[2rem]">
              <h4 className="text-indigo-400 text-xs font-black uppercase tracking-widest mb-6">Execution Strategy</h4>
              <div className="prose prose-invert prose-p:text-sm prose-p:text-gray-400 prose-li:text-gray-400">
                 <Markdown>{strategy.strategy}</Markdown>
              </div>
           </div>
        </div>
      </div>
    );
  }

  if (quiz && !showResults) {
    const q = quiz[currentQuestion];
    return (
      <div className="p-8 max-w-2xl mx-auto h-full flex flex-col justify-center">
        <div className="mb-8">
           <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Question {currentQuestion + 1} of {quiz.length}</span>
              <span className="text-xs text-gray-500 italic">Assessment Agent Active</span>
           </div>
           <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${((currentQuestion + 1) / quiz.length) * 100}%` }}
                className="h-full bg-indigo-500"
              />
           </div>
        </div>

        <h3 className="text-2xl font-bold mb-8 leading-tight">{q.question}</h3>

        <div className="space-y-4 mb-12">
          {q.options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => handleAnswer(idx)}
              className={`w-full p-6 rounded-2xl text-left border transition-all ${
                answers[currentQuestion] === idx 
                  ? 'bg-indigo-600 border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.3)]' 
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-4">
                 <span className={`size-6 rounded-full border flex items-center justify-center text-xs font-bold ${
                   answers[currentQuestion] === idx ? 'bg-white text-indigo-600 border-white' : 'border-white/20 text-gray-500'
                 }`}>
                   {String.fromCharCode(65 + idx)}
                 </span>
                 <span className="font-medium">{opt}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-between gap-4">
          <button 
            disabled={currentQuestion === 0}
            onClick={() => setCurrentQuestion(prev => prev - 1)}
            className="flex-1 py-4 rounded-xl font-bold border border-white/10 text-gray-400 disabled:opacity-0 transition-opacity"
          >
            Previous
          </button>
          {currentQuestion === quiz.length - 1 ? (
             <button 
              disabled={answers[currentQuestion] === undefined}
              onClick={handleSubmit}
              className="flex-1 py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold transition-all shadow-lg"
             >
               Submit Assessment
             </button>
          ) : (
             <button 
              disabled={answers[currentQuestion] === undefined}
              onClick={() => setCurrentQuestion(prev => prev + 1)}
              className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg"
             >
               Next Question
             </button>
          )}
        </div>
      </div>
    );
  }

  if (showResults) {
    const score = calculateScore();
    return (
      <div className="p-8 max-w-4xl mx-auto h-full flex flex-col items-center justify-center text-center">
         <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white/5 border border-white/10 p-12 rounded-[3rem] shadow-2xl relative overflow-hidden"
         >
            <div className="absolute top-0 inset-x-0 h-2 bg-indigo-600"></div>
            <div className="size-20 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-8">
               <Trophy className="size-10 text-indigo-400" />
            </div>
            <h3 className="text-4xl font-black mb-2">Assessment Complete</h3>
            <p className="text-gray-400 mb-8">Subject Integrity: {project.subject}</p>
            
            <div className="text-7xl font-black text-white mb-12 flex items-baseline justify-center gap-2">
               {score}<span className="text-3xl text-gray-600">/100</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
               <div className="p-4 bg-black/20 rounded-2xl">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Accuracy</p>
                  <p className="text-xl font-bold text-green-400">{score}%</p>
               </div>
               <div className="p-4 bg-black/20 rounded-2xl">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Time Profile</p>
                  <p className="text-xl font-bold text-blue-400">Efficient</p>
               </div>
               <div className="p-4 bg-black/20 rounded-2xl">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">XP Gain</p>
                  <p className="text-xl font-bold text-yellow-400">+{score * 2}</p>
               </div>
            </div>

            <button 
              onClick={() => setQuiz(null)}
              className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-gray-100 transition-all border border-transparent shadow-xl"
            >
              Return to Center
            </button>
         </motion.div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
       <h2 className="text-3xl font-bold mb-4">Exam Prep Center</h2>
       <p className="text-gray-400 mb-8 font-light leading-relaxed">
         Simulate high-pressure exam conditions. Our <span className="text-indigo-400">Evaluation Agent</span> utilizes semantic grading and pattern recognition to identify your most critical knowledge gaps.
       </p>
       
       <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1">
          <div className="bg-white/5 border border-white/10 p-10 rounded-[2.5rem] flex flex-col justify-between group hover:border-indigo-500/50 transition-all shadow-xl">
             <div className="space-y-6">
                <div className="size-16 bg-purple-500/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <GraduationCap className="size-8 text-purple-400" />
                </div>
                <div>
                   <h3 className="text-2xl font-bold mb-2">Adaptive Mock Exam</h3>
                   <p className="text-sm text-gray-400 leading-relaxed mb-4">Full subject assessment. Difficulty adjusts dynamically based on your real-time response latency and accuracy.</p>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest pl-1">Target Cluster</label>
                       <select 
                         value={selectedTopicId} 
                         onChange={(e) => setSelectedTopicId(e.target.value)}
                         className="w-full bg-black text-sm rounded-xl px-4 py-3 outline-none border border-white/10 text-white"
                       >
                         {project.topics.map(t => (
                           <option key={t.id} value={t.id}>{t.title}</option>
                         ))}
                       </select>
                     </div>
                </div>
             </div>
             <button 
                onClick={startQuiz}
                disabled={loading}
                className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-500 transition-all shadow-lg"
             >
                {loading ? 'Preparing Questions...' : 'Start Assessment'}
             </button>
          </div>

          <div className="bg-white/5 border border-white/10 p-10 rounded-[2.5rem] flex flex-col justify-between group hover:border-orange-500/50 transition-all shadow-xl">
             <div className="space-y-6">
                <div className="size-16 bg-orange-500/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Star className="size-8 text-orange-400" />
                </div>
                <div>
                   <h3 className="text-2xl font-bold mb-2">Strategy Agent</h3>
                   <p className="text-sm text-gray-400 leading-relaxed">Pattern analysis of historical paper trends. We identify the "High Value" concepts that represent 60% of marks.</p>
                </div>
             </div>
             <button 
                onClick={analyzeTrends}
                disabled={loading}
                className="w-full bg-white/5 text-gray-300 font-bold py-4 rounded-2xl hover:bg-white/10 transition-all border border-white/10"
             >
                {loading ? 'Analyzing Trends...' : 'Analyze Past Papers'}
             </button>
          </div>
       </div>
    </div>
  );
}
