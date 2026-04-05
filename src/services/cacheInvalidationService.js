import { cache } from './cacheService.js';

// When a vendor changes: clear vendor cache for everyone
// (vendor lists are visible to all procurement staff)
export const invalidateVendorCache = (vendorId = null) => {
  cache.invalidatePrefix('route:');  // clears all route caches
};

// When a task changes: clear only the affected users' caches
export const invalidateTaskCache = (assignedToId, assignedById) => {
  if (assignedToId) cache.invalidatePrefix(`route:${assignedToId}:/api/tasks`);
  if (assignedById) {
    cache.invalidatePrefix(`route:${assignedById}:/api/tasks`);
    cache.invalidatePrefix(`route:${assignedById}:/api/dashboard`);
  }
};

// When a PO changes
export const invalidatePOCache = (userId) => {
  cache.invalidatePrefix(`route:${userId}:/api/purchase-orders`);
  cache.invalidatePrefix(`route:${userId}:/api/dashboard`);
  cache.invalidatePrefix(`route:${userId}:/api/budget`);
};

// When an IPC changes
export const invalidateIPCCache = (userId) => {
  cache.invalidatePrefix(`route:${userId}:/api/ipcs`);
  cache.invalidatePrefix(`route:${userId}:/api/dashboard`);
  cache.invalidatePrefix(`route:${userId}:/api/budget`);
};

// Nuclear option — flush everything
// Use after bulk imports or system-wide changes
export const invalidateAll = () => {
  cache.flush();
};
