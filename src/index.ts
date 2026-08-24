#!/usr/bin/env node
import { startServer } from './server/createServer.js';
import { getLogger } from './utils/logger.js';

async function main(): Promise<void> {
  try {
    await startServer();
  } catch (error) {
    getLogger('cli').error('Failed to start MCP server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

void main();
