/**
 * MCP Installation logic
 * Converts registry entries to client configurations
 */

import type {
  McpEntry,
  McpServerConfig,
  ClientType,
  InstallResult,
  BatchInstallResult,
  NpmConfig,
  EndpointConfig,
  DockerConfig,
  SecretRequirement
} from './types.js';
import { getMcpById, listMcps } from './registry.js';
import { setMcpConfig, isMcpInstalled, getClientInfo } from './clients.js';

/**
 * Build MCP server config for npm package type
 */
function buildNpmConfig(config: NpmConfig, secrets: Record<string, string>): McpServerConfig {
  const result: McpServerConfig = {
    command: 'npx',
    args: ['-y', config.package, ...(config.args || [])]
  };

  if (Object.keys(secrets).length > 0) {
    result.env = secrets;
  }

  return result;
}

/**
 * Build MCP server config for SSE endpoint type
 */
function buildSseConfig(config: EndpointConfig, secrets: Record<string, string>): McpServerConfig {
  const result: McpServerConfig = {
    type: 'sse',
    url: config.url
  };

  // Handle headers - may include auth tokens from secrets
  if (config.headers || Object.keys(secrets).length > 0) {
    result.headers = { ...config.headers };

    // If there's a token secret, add it as Bearer auth
    for (const [key, value] of Object.entries(secrets)) {
      if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
        result.headers['Authorization'] = `Bearer ${value}`;
      }
    }
  }

  return result;
}

/**
 * Build MCP server config for HTTP endpoint type
 */
function buildHttpConfig(config: EndpointConfig, secrets: Record<string, string>): McpServerConfig {
  const result: McpServerConfig = {
    type: 'http',
    url: config.url
  };

  if (config.headers || Object.keys(secrets).length > 0) {
    result.headers = { ...config.headers };

    for (const [key, value] of Object.entries(secrets)) {
      if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
        result.headers['Authorization'] = `Bearer ${value}`;
      }
    }
  }

  return result;
}

/**
 * Build MCP server config for Streamable HTTP endpoint type
 * This is the modern transport replacing SSE
 */
function buildStreamableHttpConfig(config: EndpointConfig, secrets: Record<string, string>): McpServerConfig {
  const result: McpServerConfig = {
    type: 'streamable-http',
    url: config.url
  };

  if (config.headers || Object.keys(secrets).length > 0) {
    result.headers = { ...config.headers };

    for (const [key, value] of Object.entries(secrets)) {
      if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
        result.headers['Authorization'] = `Bearer ${value}`;
      }
    }
  }

  return result;
}

/**
 * Build MCP server config for Docker type
 */
function buildDockerConfig(config: DockerConfig, secrets: Record<string, string>): McpServerConfig {
  const args = ['run', '-i', '--rm', ...(config.args || [])];

  // Add environment variables
  for (const [key, value] of Object.entries(secrets)) {
    args.push('-e', `${key}=${value}`);
  }

  // Add ports if specified
  if (config.ports) {
    for (const port of config.ports) {
      args.push('-p', port);
    }
  }

  // Add the image
  args.push(config.image);

  return {
    command: 'docker',
    args
  };
}

/**
 * Build client-specific MCP config from registry entry
 */
export function buildMcpConfig(
  entry: McpEntry,
  secrets: Record<string, string>,
  _client: ClientType
): McpServerConfig {
  switch (entry.type) {
    case 'npm':
      return buildNpmConfig(entry.config as NpmConfig, secrets);
    case 'sse':
      return buildSseConfig(entry.config as EndpointConfig, secrets);
    case 'http':
      return buildHttpConfig(entry.config as EndpointConfig, secrets);
    case 'streamable-http':
      return buildStreamableHttpConfig(entry.config as EndpointConfig, secrets);
    case 'docker':
      return buildDockerConfig(entry.config as DockerConfig, secrets);
    default:
      throw new Error(`Unsupported MCP type: ${entry.type}`);
  }
}

/**
 * Check which secrets are missing
 */
export function getMissingSecrets(
  entry: McpEntry,
  providedSecrets: Record<string, string>
): SecretRequirement[] {
  if (!entry.secrets) {
    return [];
  }

  const missing: SecretRequirement[] = [];

  for (const secret of entry.secrets) {
    // Check if provided in args
    if (providedSecrets[secret.key]) {
      continue;
    }

    // Check if available in environment
    if (process.env[secret.key]) {
      continue;
    }

    // Check if has default
    if (secret.default !== undefined) {
      continue;
    }

    // Only report if required (default to required if not specified)
    if (secret.required !== false) {
      missing.push(secret);
    }
  }

  return missing;
}

/**
 * Collect all available secrets (from args, env, defaults)
 */
export function collectSecrets(
  entry: McpEntry,
  providedSecrets: Record<string, string>
): Record<string, string> {
  const secrets: Record<string, string> = {};

  if (!entry.secrets) {
    return secrets;
  }

  for (const secret of entry.secrets) {
    // Priority: provided > env > default
    if (providedSecrets[secret.key]) {
      secrets[secret.key] = providedSecrets[secret.key];
    } else if (process.env[secret.key]) {
      secrets[secret.key] = process.env[secret.key]!;
    } else if (secret.default !== undefined) {
      secrets[secret.key] = secret.default;
    }
  }

  return secrets;
}

/**
 * Install a single MCP to a client
 */
export async function installMcp(
  mcpId: string,
  client: ClientType,
  providedSecrets: Record<string, string> = {},
  skipIfInstalled = true
): Promise<InstallResult> {
  // Get the MCP entry
  const entry = await getMcpById(mcpId);
  if (!entry) {
    return {
      status: 'error',
      mcp_id: mcpId,
      client,
      message: `MCP '${mcpId}' not found in registry`
    };
  }

  // Check if already installed
  if (skipIfInstalled && isMcpInstalled(client, mcpId)) {
    return {
      status: 'already_installed',
      mcp_id: mcpId,
      client,
      message: `MCP '${mcpId}' is already installed in ${client}`
    };
  }

  // Check for missing secrets
  const missingSecrets = getMissingSecrets(entry, providedSecrets);
  if (missingSecrets.length > 0) {
    return {
      status: 'secrets_required',
      mcp_id: mcpId,
      client,
      message: `Missing required secrets for '${mcpId}'`,
      missing_secrets: missingSecrets
    };
  }

  // Collect all secrets
  const secrets = collectSecrets(entry, providedSecrets);

  // Build the config
  try {
    const config = buildMcpConfig(entry, secrets, client);

    // Verify client path exists (create if needed)
    const clientInfo = getClientInfo(client);

    // Install
    setMcpConfig(client, mcpId, config);

    return {
      status: 'success',
      mcp_id: mcpId,
      client,
      message: `Successfully installed '${entry.name}' to ${clientInfo.name}`
    };
  } catch (error) {
    return {
      status: 'error',
      mcp_id: mcpId,
      client,
      message: `Failed to install '${mcpId}': ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Install all MCPs to a client
 */
export async function installAll(
  client: ClientType,
  options: {
    essentialOnly?: boolean;
    skipExisting?: boolean;
    providedSecrets?: Record<string, string>;
  } = {}
): Promise<BatchInstallResult> {
  const mcps = await listMcps({
    essentialOnly: options.essentialOnly,
    enabledOnly: true
  });

  const results: InstallResult[] = [];
  let installed = 0;
  let skipped = 0;
  let failed = 0;
  let secretsRequired = 0;

  for (const mcp of mcps) {
    const result = await installMcp(
      mcp.id,
      client,
      options.providedSecrets || {},
      options.skipExisting !== false
    );

    results.push(result);

    switch (result.status) {
      case 'success':
        installed++;
        break;
      case 'already_installed':
        skipped++;
        break;
      case 'secrets_required':
        secretsRequired++;
        break;
      case 'error':
        failed++;
        break;
    }
  }

  return {
    total: mcps.length,
    installed,
    skipped,
    failed,
    secrets_required: secretsRequired,
    results
  };
}
