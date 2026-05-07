/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserProfile, Topic, StudySession, StudyMaterial, QuizQuestion } from "../types";

async function callAIProxy(payload: any) {
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "AI Proxy Error");
  }
  return await response.json();
}

export const AgentPersonas = {
  CURRICULUM_ANALYST: `You are the Curriculum Analyst Agent. Your task is to break down a complex subject into 12-18 highly specific structured topics. 
  Ensure the topics are chronologically ordered for optimal learning flow.
  Each topic must include: id (uuid), title, description, difficulty (Beginner, Intermediate, Advanced), estimatedTimeHours (number), prerequisites (list of IDs), and subtopics (list of objects with id, title, status='pending', completionPercentage=0).
  
  VALIDATION: If the subject provided is gibberish, nonsensical, strings of random characters, or explicitly inappropriate, you MUST respond with an empty JSON array []. Do NOT attempt to create a curriculum for meaningless input.
  Respond only in valid JSON format matching the Topic interface.`,
  
  MATERIAL_GENERATOR: `You are the Content Generation Agent. Generate EXHAUSTIVE study materials.
  Structure:
  - # [Topic Title]
  - ## Executive Summary (High-level overview)
  - ## Core Concepts (Deep dive into definitions and theoretical mechanics)
  - ## Practical Examples (Step-by-step applications)
  - ## Common Pitfalls (What to avoid)
  - ## Key Formulae/Commandments (Critical items)
  Use heavy markdown for formatting (bolding, lists, code blocks).
  Respond in valid JSON with 'content' and 'flashcards' fields.`,
  
  PLANNER: `You are the Study Planner Agent. Your task is to create a realistic day-by-day study schedule based on subject topics, user availability, and a deadline.
  Implement spaced repetition and revision cycles.
  IMPORTANT: You MUST use the exact 'id' values from the provided Topics list for the 'topicId' field in each session. Do NOT invent new IDs.
  Respond only in valid JSON format matching the StudySession interface: { id: string, topicId: string, date: string (YYYY-MM-DD), startTime: string (HH:mm), durationMinutes: number, type: string (learning, practice, revision, assessment) }.`,
  
  SOCRATIC_TUTOR: `You are the Socratic Tutor. Your goal is to guide students to understanding through questioning. 
  
  VALIDATION: If the user message is gibberish, nonsensical, or contains offensive/inappropriate content, politely decline to discuss it and redirect the user back to the learning objective of the current topic. Do not hallucinate helpful responses for meaningless text.

  MANDATORY FORMATTING:
  - Use bullet points for lists.
  - Use bold text ONLY for the absolute most critical terms (maximum 3-4 per response).
  - Use section headers (###) if the response is long.
  - Keep each point distinct.
  - Use whitespace to make the response readable.
  - Avoid using double asterisks (**) everywhere.`,
  
  ASSESSMENT_AGENT: `You are the Assessment & Evaluation Agent. Generate challenging quiz questions based on a topic's difficulty. 
  Include: question, options (array of 4 strings), correctAnswer (index 0-3), and explanation.
  Respond only in valid JSON format.`,
  
  EXAM_STRATEGIST: `You are the Exam Strategy Agent. Your task is to analyze the subject and its topics to provide strategic exam advice.
  Include: 
  - topValueTopics (list of titles)
  - strategy (string with bullet points)
  - memoryHooks (list of short mnemonics)
  Respond only in valid JSON format.`
};

export async function generateCurriculum(subject: string, profile: UserProfile): Promise<Topic[]> {
  const prompt = `${AgentPersonas.CURRICULUM_ANALYST}
  Subject: ${subject}
  Student Profile: ${JSON.stringify(profile)}
  Generate a list of 5-8 structured topics.`;

  try {
    const response = await callAIProxy({ prompt });
    const text = response.text || "";
    const jsonStr = text.match(/\[[\s\S]*\]/)?.[0] || text;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Error generating curriculum:", error);
    return [];
  }
}

export async function generateStudyPlan(subject: string, topics: Topic[], deadline: string, profile: UserProfile): Promise<StudySession[]> {
  const today = new Date().toISOString().split('T')[0];
  const prompt = `${AgentPersonas.PLANNER}
  Subject: ${subject}
  Today's Date: ${today}
  Topics: ${JSON.stringify(topics)}
  Deadline: ${deadline}
  User Availability: ${profile.availableHoursPerDay} hours/day
  Generate a list of StudySessions starting from tomorrow until the deadline. Use YYYY-MM-DD format.`;

  try {
    const response = await callAIProxy({ prompt });
    const text = response.text || "";
    const jsonStr = text.match(/\[[\s\S]*\]/)?.[0] || text;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Error generating study plan:", error);
    return [];
  }
}

export async function generateMaterials(topic: Topic): Promise<StudyMaterial> {
  const prompt = `${AgentPersonas.MATERIAL_GENERATOR}
  Generate a JSON object with: 
  - type: "summary"
  - content: "A detailed markdown summary of the topic: ${topic.title}. Include key concepts and examples."
  - flashcards: [ { front: "Question", back: "Answer" } ] // generate at least 5
  Topic Details: ${topic.description}`;

  try {
    const response = await callAIProxy({ prompt });
    const text = response.text || "";
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || text;
    const parsed = JSON.parse(jsonStr);
    return { id: Math.random().toString(36).substr(2, 9), topicId: topic.id, ...parsed };
  } catch (error) {
    console.error("Error generating materials:", error);
    throw error;
  }
}

export async function generateAssessment(topic: Topic): Promise<QuizQuestion[]> {
  const prompt = `${AgentPersonas.ASSESSMENT_AGENT}
  Topic: ${topic.title}
  Difficulty: ${topic.difficulty}
  Details: ${topic.description}
  Generate 5 multiple-choice questions. Return as a JSON array.`;

  try {
    const response = await callAIProxy({ prompt });
    const text = response.text || "";
    const jsonStr = text.match(/\[[\s\S]*\]/)?.[0] || text;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Error generating assessment:", error);
    return [];
  }
}

export async function getTutorResponse(conversation: any[], topic: string) {
  // The conversation history already contains the latest user message from the UI
  const systemPrompt = AgentPersonas.SOCRATIC_TUTOR + ` You are currently teaching the topic: ${topic}.`;

  try {
    const response = await callAIProxy({
      type: "chat",
      conversation,
      systemInstruction: systemPrompt
    });
    return response.text || "I'm having trouble connecting to the knowledge stream. Let's try again in a moment.";
  } catch (error) {
    console.error("Error in tutor chat:", error);
    return "I'm having trouble connecting to the knowledge stream. Let's try again in a moment.";
  }
}

export async function enrichTopic(title: string, subject: string): Promise<Topic> {
  const prompt = `${AgentPersonas.CURRICULUM_ANALYST}
  Subject Environment: ${subject}
  New Specific Topic to Integrate: ${title}
  
  Your task is to provide full details for this new topic so it can be added to the existing curriculum.
  Return a single JSON object (not an array) matching the Topic interface.
  
  VALIDATION: If the topic title "${title}" is gibberish, random text, or inappropriate, you MUST return a JSON object with: { "title": "INVALID_INPUT", "description": "The system could not parse this node title logically.", "difficulty": "Beginner", "subtopics": [] }.
  
  Include: title, description, difficulty, estimatedTimeHours, prerequisites (list of keywords), and subtopics (list of objects with id, title, status='pending', completionPercentage=0).`;

  try {
    const response = await callAIProxy({ prompt });
    const text = response.text || "";
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || text;
    const topic = JSON.parse(jsonStr);
    return {
      ...topic,
      id: topic.id || 't-' + Math.random().toString(36).substr(2, 6),
      status: 'pending'
    };
  } catch (error) {
    console.error("Error enriching topic:", error);
    throw error;
  }
}

export async function suggestNextTopic(subject: string, existingTopics: Topic[]): Promise<Topic> {
  const prompt = `${AgentPersonas.CURRICULUM_ANALYST}
  Subject: ${subject}
  Existing Knowledge Nodes: ${existingTopics.map(t => t.title).join(', ')}
  
  Your task is to identify ONE highly relevant topic that is missing from the curriculum but critical for mastery of ${subject}.
  The topic should logically FOLLOW the existing nodes.
  
  VALIDATION: If the subject "${subject}" is nonsensical, you MUST return a JSON object with: { "title": "INVALID_INPUT", "description": "Subject context lost.", "difficulty": "Beginner", "subtopics": [] }.

  Return a single JSON object matching the Topic interface.`;

  try {
    const response = await callAIProxy({ prompt });
    const text = response.text || "";
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || text;
    const topic = JSON.parse(jsonStr);
    return {
      ...topic,
      id: topic.id || 't-evolve-' + Math.random().toString(36).substr(2, 6),
      status: 'pending'
    };
  } catch (error) {
    console.error("Error suggesting next topic:", error);
    throw error;
  }
}

export async function generateExamStrategy(subject: string, topics: Topic[]): Promise<any> {
  const prompt = `${AgentPersonas.EXAM_STRATEGIST}
  Subject: ${subject}
  Topics: ${topics.map(t => t.title).join(', ')}
  Analyze the curriculum and provide a strategic mastery guide.`;

  try {
    const response = await callAIProxy({ prompt });
    const text = response.text || "";
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || text;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Error generating exam strategy:", error);
    return {
      topValueTopics: [],
      strategy: "Focus on the most complex topics first and ensure you bridge logical prerequisites.",
      memoryHooks: []
    };
  }
}
