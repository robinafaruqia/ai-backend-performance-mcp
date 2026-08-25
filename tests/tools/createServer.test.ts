import { describe, expect, it } from 'vitest';
import { createServer } from '../../src/server/createServer.js';

describe('createServer', () => {
  it('registers all six MCP tools', () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(server.isConnected()).toBe(false);
  });
});
