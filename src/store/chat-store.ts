import { create } from "zustand";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatStore {
  messages: ChatMessage[];
  loading: boolean;
  currentUserId: string | null;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  updateLastAssistantMessage: (content: string) => void;
  clearMessages: () => void;
  setCurrentUserId: (userId: string | null) => void;
  loadMessages: () => void;
}

const STORAGE_KEY = "opsmind-chat-messages";

// Helper functions for localStorage
const saveMessages = (userId: string | null, messages: ChatMessage[]) => {
  if (typeof window === "undefined") return;
  const key = `${STORAGE_KEY}-${userId || "anonymous"}`;
  try {
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (e) {
    console.error("Failed to save messages:", e);
  }
};

const loadMessages = (userId: string | null): ChatMessage[] => {
  if (typeof window === "undefined" || !userId) return [];
  const key = `${STORAGE_KEY}-${userId}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load saved messages:", e);
  }
  return [];
};

const clearSavedMessages = (userId: string | null) => {
  if (typeof window === "undefined") return;
  const key = `${STORAGE_KEY}-${userId || "anonymous"}`;
  localStorage.removeItem(key);
};

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  loading: false,
  currentUserId: null,
  setMessages: (messages) => {
    set({ messages });
    saveMessages(get().currentUserId, messages);
  },
  addMessage: (message) => {
    set((state) => {
      const newMessages = [...state.messages, message];
      saveMessages(state.currentUserId, newMessages);
      return { messages: newMessages };
    });
  },
  setLoading: (loading) => set({ loading }),
  updateLastAssistantMessage: (content) => {
    set((state) => {
      if (state.messages.length === 0) return state;
      const next = [...state.messages];
      const lastIdx = next.length - 1;
      if (next[lastIdx]?.role === "assistant") {
        next[lastIdx] = { ...next[lastIdx], content };
      }
      saveMessages(state.currentUserId, next);
      return { messages: next };
    });
  },
  clearMessages: () => {
    const userId = get().currentUserId;
    set({ messages: [], loading: false });
    clearSavedMessages(userId);
  },
  setCurrentUserId: (userId: string | null) => {
    const current = get().currentUserId;
    if (current !== null && current !== userId) {
      // User changed - clear old messages
      clearSavedMessages(current);
      set({ messages: [], loading: false, currentUserId: userId });
    } else {
      set({ currentUserId: userId });
      // Load messages for this user
      if (userId) {
        const savedMessages = loadMessages(userId);
        if (savedMessages.length > 0) {
          set({ messages: savedMessages });
        }
      }
    }
  },
  loadMessages: () => {
    const userId = get().currentUserId;
    if (userId) {
      const savedMessages = loadMessages(userId);
      if (savedMessages.length > 0) {
        set({ messages: savedMessages });
      }
    }
  },
}));
