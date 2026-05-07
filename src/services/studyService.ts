import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  onSnapshot,
  getDocFromServer
} from 'firebase/firestore';
import { db, auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  if (!auth.currentUser) return;
  try {
    // Attempt to read the dedicated test path
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("AURA: Neural Link Verified.");
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      console.warn("AURA: Neural Link active but restricted (expected for connection test).");
      return;
    }
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("AURA: Environment isolated. Check network/config.");
    }
  }
}

// User Profile
export async function saveProfile(profile: any) {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}`;
  try {
    await setDoc(doc(db, path), {
      id: auth.currentUser.uid,
      email: auth.currentUser.email,
      name: auth.currentUser.displayName,
      profile: profile,
      createdAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Project Metadata
export async function saveProject(project: any) {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}/projects/main`;
  try {
    // Only save metadata here, items are in subcollections
    const { topics, sessions, materials, ...metadata } = project;
    await setDoc(doc(db, path), {
      ...metadata,
      updatedAt: new Date().toISOString(),
      ownerId: auth.currentUser.uid
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Topics
export async function dbAddTopic(topic: any) {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}/topics/${topic.id}`;
  try {
    await setDoc(doc(db, path), { ...topic, ownerId: auth.currentUser.uid });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function dbGetTopics() {
  if (!auth.currentUser) return [];
  const path = `users/${auth.currentUser.uid}/topics`;
  try {
    const q = query(collection(db, path));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// Sessions
export async function dbAddSession(session: any) {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}/sessions/${session.id}`;
  try {
    await setDoc(doc(db, path), { ...session, ownerId: auth.currentUser.uid });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function dbDeleteSession(sessionId: string) {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}/sessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Chats
export async function dbCreateChatThread(thread: any) {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}/chats/${thread.id}`;
  try {
    await setDoc(doc(db, path), { ...thread, ownerId: auth.currentUser.uid });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function dbAddMessage(chatId: string, message: any) {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}/chats/${chatId}/messages/${message.id}`;
  try {
    await setDoc(doc(db, path), { ...message, chatId, ownerId: auth.currentUser.uid });
    // Update thread timestamp
    await updateDoc(doc(db, `users/${auth.currentUser.uid}/chats/${chatId}`), {
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function dbDeleteChat(chatId: string) {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}/chats/${chatId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function dbGetChatThreads() {
  if (!auth.currentUser) return [];
  const path = `users/${auth.currentUser.uid}/chats`;
  try {
    const q = query(collection(db, path), orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function dbGetMessages(chatId: string) {
  if (!auth.currentUser) return [];
  const path = `users/${auth.currentUser.uid}/chats/${chatId}/messages`;
  try {
    const q = query(collection(db, path), orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// Topic Memory
export async function dbUpsertTopicMemory(topicId: string, summary: string) {
  if (!auth.currentUser) return;
  const path = `users/${auth.currentUser.uid}/topicMemories/${topicId}`;
  try {
    await setDoc(doc(db, path), {
      topicId,
      summary,
      lastUpdatedAt: new Date().toISOString(),
      ownerId: auth.currentUser.uid
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function dbGetTopicMemory(topicId: string) {
  if (!auth.currentUser) return null;
  const path = `users/${auth.currentUser.uid}/topicMemories/${topicId}`;
  try {
    const docSnap = await getDoc(doc(db, path));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
