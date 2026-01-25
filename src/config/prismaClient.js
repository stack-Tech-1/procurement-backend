// backend/src/config/prismaClient.js - FIXED VERSION
import { PrismaClient } from '@prisma/client'

// Create Prisma client with connection pool optimization for Supabase
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  errorFormat: 'minimal',
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // Supabase connection pool optimizations
  transactionOptions: {
    maxWait: 5000,
    timeout: 10000,
  }
})

// Initialize database connection status
let isDatabaseConnected = false

// Connection retry function
async function initializeDatabase() {
  const maxRetries = 2
  let delay = 2000

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`🔌 Database connection attempt ${i + 1}...`)
      await prisma.$connect()
      console.log('✅ Database connected successfully')
      
      // Add middleware ONLY after successful connection
      addMiddleware()
      
      // Test the connection with a simple query
      await prisma.$queryRaw`SELECT 1`
      console.log('✅ Database connection verified')
      return true
      
    } catch (error) {
      console.error(`❌ Connection attempt ${i + 1} failed:`, error.message)
      
      if (i < maxRetries - 1) {
        console.log(`🔄 Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        delay *= 1.5 // Exponential backoff
      } else {
        console.error('💥 All connection attempts failed')
        
        // Don't crash the app, just log the error
        console.log('🚨 Application will continue but database operations will fail')
        return false
      }
    }
  }
}

// Add middleware function (only call after successful connection)
function addMiddleware() {
  if (typeof prisma.$use === 'function') {
    prisma.$use(async (params, next) => {
      try {
        return await next(params)
      } catch (error) {
        // Handle connection errors
        if (error.code === 'P1001' || error.code === 'P1017') {
          console.log('🔄 Database connection lost, attempting to reconnect...')
          try {
            await prisma.$connect()
            // Retry the operation once
            return await next(params)
          } catch (retryError) {
            console.error('❌ Reconnection failed:', retryError.message)
            throw retryError
          }
        }
        throw error
      }
    })
    console.log('✅ Prisma middleware added successfully')
  } else {
    console.warn('⚠️ prisma.$use is not available - skipping middleware')
  }
}

// Initialize database connection (but don't block app startup)
initializeDatabase()
  .then(connected => {
    isDatabaseConnected = connected
    if (connected) {
      // Import and call setDatabaseReady if using the databaseReady utility
      import('./utils/databaseReady.js')
        .then(module => {
          module.setDatabaseReady()
        })
        .catch(() => {
          // Ignore if module not available yet
        })
    }
  })
  .catch(error => {
    console.error('🚨 Database initialization error:', error.message)
  })

// Health check function
export async function checkDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error('❌ Database health check failed:', error.message)
    return false
  }
}

// Get current database connection status
export function getDatabaseStatus() {
  return isDatabaseConnected
}

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('🛑 Shutting down gracefully...')
  try {
    await prisma.$disconnect()
    console.log('✅ Database disconnected')
  } catch (error) {
    console.error('❌ Error during disconnection:', error.message)
  }
  process.exit(0)
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)
process.on('beforeExit', gracefulShutdown)

export default prisma