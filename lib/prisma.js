// lib/prisma.js

const { PrismaClient } = require('@prisma/client');

/**
 * Singleton PrismaClient.
 *
 * In development, nodemon re-imports modules on every reload which can
 * exhaust the DB connection pool if we create a new PrismaClient each
 * time. We attach the instance to `global` to survive hot reloads.
 */
const globalForPrisma = global;

if (!globalForPrisma.__prisma) {
  globalForPrisma.__prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });
}

function getPrisma() {
  return globalForPrisma.__prisma;
}

module.exports = { getPrisma };
