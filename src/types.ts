/**
 * Types for the MCP Installer
 */

// MCP Server types
export type McpType = 'npm' | 'sse' | 'http' | 'streamable-http' | 'docker';

// Secret requirement
export interface SecretRequirement {
  key: string;
  description: string;
  required?: boolean;
  default?: string;
}

// npm package configuration
export interface NpmConfig {
  package: string;
  args?: string[];
}

// SSE/HTTP endpoint configuration
export interface EndpointConfig {
  url: string;
  headers?: Record<string, string>;
}

// Docker configuration
export interface DockerConfig {
  image: string;
  args?: string[];
  ports?: string[];
}

// MCP configuration (union of all types)
export type McpConfig = NpmConfig | EndpointConfig | DockerConfig;

// Registry MCP entry
export interface McpEntry {
  id: string;
  name: string;
  description?: string;
  category?: string;
  essential?: boolean;
  enabled?: boolean;
  type: McpType;
  config: McpConfig;
  secrets?: SecretRequirement[];
  clientOverrides?: Record<string, Partial<McpConfig>>;
}

// Full registry structure
export interface Registry {
  version: string;
  updated: string;
  mcps: McpEntry[];
}

// Supported clients
export type ClientType = 'claude-code' | 'cursor' | 'vscode';

// Client configuration info
export interface ClientInfo {
  name: string;
  path: string;
  key: string;
  exists: boolean;
}

// Installation result
export interface InstallResult {
  status: 'success' | 'secrets_required' | 'error' | 'already_installed';
  mcp_id: string;
  client: ClientType;
  message?: string;
  missing_secrets?: SecretRequirement[];
}

// Batch installation result
export interface BatchInstallResult {
  total: number;
  installed: number;
  skipped: number;
  failed: number;
  secrets_required: number;
  results: InstallResult[];
}

// Client MCP server configuration (what goes in settings.json)
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: 'sse' | 'http' | 'streamable-http';
  url?: string;
  headers?: Record<string, string>;
}

// Client settings file structure
export interface ClientSettings {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}
