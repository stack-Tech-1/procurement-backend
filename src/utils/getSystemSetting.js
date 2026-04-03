import prisma from '../config/prismaClient.js';

const settingsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const getSetting = async (key, defaultValue = null) => {
  const cached = settingsCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    const value = setting?.value ?? defaultValue;
    settingsCache.set(key, { value, timestamp: Date.now() });
    return value;
  } catch {
    return defaultValue;
  }
};

export const clearSettingsCache = () => settingsCache.clear();