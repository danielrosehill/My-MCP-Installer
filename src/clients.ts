/**
 * Client configuration management
 * Handles reading/writing MCP configs for different clients
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ClientType, ClientInfo, ClientSettings, McpServerConfig } from './types.js';

// Client configuration paths
const CLIENT_CONFIGS: Record<ClientType, { name: string; path: string; key: string }> = {
  'claude-code': {
    name: 'Claude Code',
    path: path.join(os.homedir(), '.claude', 'settings.json'),
    key: 'mcpServers'
  },
  'cursor': {
    name: 'Cursor',
    path: path.join(os.homedir(), '.cursor', 'mcp.json'),
    key: 'mcpServers'
  },
  'vscode': {
    name: 'VS Code',
    path: path.join(os.homedir(), '.config', 'Code', 'mcp.json'),
    key: 'mcpServers'
  }
};

/**
 * Get info about a client
 */
export function getClientInfo(client: ClientType): ClientInfo {
  const config = CLIENT_CONFIGS[client];
  return {
    name: config.name,
    path: config.path,
    key: config.key,
    exists: fs.existsSync(config.path)
  };
}

/**
 * Get info about all supported clients
 */
export function getAllClientInfo(): Record<ClientType, ClientInfo> {
  const result: Record<ClientType, ClientInfo> = {} as Record<ClientType, ClientInfo>;
  for (const client of Object.keys(CLIENT_CONFIGS) as ClientType[]) {
    result[client] = getClientInfo(client);
  }
  return result;
}

/**
 * Read client settings file
 */
export function readClientSettings(client: ClientType): ClientSettings {
  const info = getClientInfo(client);

  if (!info.exists) {
    return { mcpServers: {} };
  }

  try {
    const data = fs.readFileSync(info.path, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { mcpServers: {} };
  }
}

/**
 * Write client settings file
 */
export function writeClientSettings(client: ClientType, settings: ClientSettings): void {
  const info = getClientInfo(client);

  // Ensure directory exists
  const dir = path.dirname(info.path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create backup if file exists
  if (fs.existsSync(info.path)) {
    const backupPath = `${info.path}.backup`;
    fs.copyFileSync(info.path, backupPath);
  }

  // Write atomically (write to temp, then rename)
  const tempPath = `${info.path}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2));
  fs.renameSync(tempPath, info.path);
}

/**
 * Get installed MCP servers for a client
 */
export function getInstalledMcps(client: ClientType): Record<string, McpServerConfig> {
  const settings = readClientSettings(client);
  return settings.mcpServers || {};
}

/**
 * Check if an MCP is installed in a client
 */
export function isMcpInstalled(client: ClientType, mcpId: string): boolean {
  const installed = getInstalledMcps(client);
  return mcpId in installed;
}

/**
 * Add or update an MCP in a client's config
 */
export function setMcpConfig(
  client: ClientType,
  mcpId: string,
  config: McpServerConfig
): void {
  const settings = readClientSettings(client);

  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  settings.mcpServers[mcpId] = config;
  writeClientSettings(client, settings);
}

/**
 * Remove an MCP from a client's config
 */
export function removeMcpConfig(client: ClientType, mcpId: string): boolean {
  const settings = readClientSettings(client);

  if (!settings.mcpServers || !(mcpId in settings.mcpServers)) {
    return false;
  }

  delete settings.mcpServers[mcpId];
  writeClientSettings(client, settings);
  return true;
}

/**
 * List all installed MCPs across all clients
 */
export function listAllInstalled(): Record<ClientType, Record<string, McpServerConfig>> {
  const result: Record<ClientType, Record<string, McpServerConfig>> = {} as Record<ClientType, Record<string, McpServerConfig>>;

  for (const client of Object.keys(CLIENT_CONFIGS) as ClientType[]) {
    result[client] = getInstalledMcps(client);
  }

  return result;
}

/**
 * Get supported client types
 */
export function getSupportedClients(): ClientType[] {
  return Object.keys(CLIENT_CONFIGS) as ClientType[];
}
