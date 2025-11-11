// src/utils/databaseReady.js
import { checkDatabaseHealth } from '../config/prismaClient.js'

let isReady = false
const waiters = []

export function setDatabaseReady() {
  isReady = true
  waiters.forEach(resolve => resolve())
  waiters.length = 0
}

export function waitForDatabase(timeout = 30000) {
  if (isReady) return Promise.resolve(true)
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Database connection timeout'))
    }, timeout)
    
    waiters.push(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

// Periodically check database health
setInterval(async () => {
  try {
    const healthy = await checkDatabaseHealth()
    if (healthy && !isReady) {
      console.log('✅ Database is now ready')
      setDatabaseReady()
    }
  } catch (error) {
    // Ignore health check errors
  }
}, 5000)