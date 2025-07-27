/**
 * Mock continuation store for testing
 */

import { vi } from 'vitest';

export function createMockContinuationStore(initialData = new Map()) {
  const store = new Map(initialData);
  
  return {
    get: vi.fn().mockImplementation((id) => {
      return store.get(id) || null;
    }),
    
    set: vi.fn().mockImplementation((id, data) => {
      store.set(id, {
        ...data,
        lastAccessed: Date.now()
      });
    }),
    
    delete: vi.fn().mockImplementation((id) => {
      return store.delete(id);
    }),
    
    exists: vi.fn().mockImplementation((id) => {
      return store.has(id);
    }),
    
    getStats: vi.fn().mockReturnValue({
      totalConversations: store.size,
      memoryUsage: store.size * 1000 // Mock memory usage
    }),
    
    clear: vi.fn().mockImplementation(() => {
      store.clear();
    }),
    
    // Expose the internal store for testing
    _store: store
  };
}

export function createMockConversation(id, overrides = {}) {
  return {
    id,
    model: 'gpt-4',
    messages: [],
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    metadata: {},
    ...overrides
  };
}