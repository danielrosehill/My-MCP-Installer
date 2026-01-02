#!/usr/bin/env node

/**
 * Daniel Rosehill's Personal MCP Installer
 *
 * An MCP server that manages installation of MCP servers from a personal registry.
 * Supports Claude Code, Cursor, VS Code, and other MCP-compatible clients.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

import { getRegistry, listMcps, syncRegistry, getRegistryInfo } from './registry.js';
import { getInstalledMcps, getAllClientInfo, getSupportedClients, removeMcpConfig } from './clients.js';
import { installMcp, installAll } from './installer.js';
import type { ClientType } from './types.js';

// Initialize the MCP server
const server = new Server(
  {
    name: 'daniel-rosehill-mcps',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Define available tools
const tools: Tool[] = [
  {
    name: 'list_mcps',
    description: 'List all available MCPs in the registry. Can filter by category or show only essential MCPs.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category (e.g., "Audio", "Development", "MCP Management")'
        },
        essential_only: {
          type: 'boolean',
          description: 'Only show MCPs marked as essential',
          default: false
        }
      }
    }
  },
  {
    name: 'list_installed',
    description: 'Show what MCPs are already installed in a specific client or all clients.',
    inputSchema: {
      type: 'object',
      properties: {
        client: {
          type: 'string',
          enum: ['claude-code', 'cursor', 'vscode', 'all'],
          description: 'Client to check',
          default: 'all'
        }
      }
    }
  },
  {
    name: 'install_mcp',
    description: 'Install a single MCP to a client. If secrets are required, they must be provided.',
    inputSchema: {
      type: 'object',
      properties: {
        mcp_id: {
          type: 'string',
          description: 'MCP identifier from registry (use list_mcps to see available IDs)'
        },
        client: {
          type: 'string',
          enum: ['claude-code', 'cursor', 'vscode'],
          description: 'Target client to install to',
          default: 'claude-code'
        },
        secrets: {
          type: 'object',
          description: 'Key-value pairs of secrets/API keys required by this MCP',
          additionalProperties: { type: 'string' }
        },
        force: {
          type: 'boolean',
          description: 'Install even if already installed (will overwrite)',
          default: false
        }
      },
      required: ['mcp_id']
    }
  },
  {
    name: 'install_all',
    description: 'Install all MCPs (or just essential ones) to a client. Skips MCPs that need secrets unless provided.',
    inputSchema: {
      type: 'object',
      properties: {
        client: {
          type: 'string',
          enum: ['claude-code', 'cursor', 'vscode'],
          description: 'Target client to install to',
          default: 'claude-code'
        },
        essential_only: {
          type: 'boolean',
          description: 'Only install MCPs marked as essential',
          default: false
        },
        skip_existing: {
          type: 'boolean',
          description: 'Skip MCPs that are already installed',
          default: true
        },
        secrets: {
          type: 'object',
          description: 'Key-value pairs of secrets for all MCPs (keys should match what each MCP needs)',
          additionalProperties: { type: 'string' }
        }
      }
    }
  },
  {
    name: 'sync_registry',
    description: 'Update the local registry cache from GitHub. Use this to get the latest MCP list.',
    inputSchema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description: 'Force refresh even if cache is fresh',
          default: true
        }
      }
    }
  },
  {
    name: 'uninstall_mcp',
    description: 'Remove an MCP from a client configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        mcp_id: {
          type: 'string',
          description: 'MCP identifier to remove'
        },
        client: {
          type: 'string',
          enum: ['claude-code', 'cursor', 'vscode'],
          description: 'Client to remove from',
          default: 'claude-code'
        }
      },
      required: ['mcp_id']
    }
  },
  {
    name: 'get_info',
    description: 'Get information about the installer, registry URL, cache location, and supported clients.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Register tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_mcps': {
        const mcps = await listMcps({
          category: args?.category as string | undefined,
          essentialOnly: args?.essential_only as boolean | undefined
        });

        const formatted = mcps.map(mcp => ({
          id: mcp.id,
          name: mcp.name,
          description: mcp.description,
          category: mcp.category,
          type: mcp.type,
          essential: mcp.essential || false,
          requires_secrets: (mcp.secrets?.length || 0) > 0,
          secret_keys: mcp.secrets?.map(s => s.key) || []
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: formatted.length,
              mcps: formatted
            }, null, 2)
          }]
        };
      }

      case 'list_installed': {
        const clientArg = (args?.client as string) || 'all';

        if (clientArg === 'all') {
          const clientInfo = getAllClientInfo();
          const result: Record<string, { path: string; exists: boolean; mcps: string[] }> = {};

          for (const [client, info] of Object.entries(clientInfo)) {
            const installed = getInstalledMcps(client as ClientType);
            result[client] = {
              path: info.path,
              exists: info.exists,
              mcps: Object.keys(installed)
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } else {
          const installed = getInstalledMcps(clientArg as ClientType);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                client: clientArg,
                count: Object.keys(installed).length,
                mcps: Object.keys(installed)
              }, null, 2)
            }]
          };
        }
      }

      case 'install_mcp': {
        const mcpId = args?.mcp_id as string;
        const client = (args?.client as ClientType) || 'claude-code';
        const secrets = (args?.secrets as Record<string, string>) || {};
        const force = args?.force as boolean || false;

        const result = await installMcp(mcpId, client, secrets, !force);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }

      case 'install_all': {
        const client = (args?.client as ClientType) || 'claude-code';
        const essentialOnly = args?.essential_only as boolean || false;
        const skipExisting = args?.skip_existing as boolean !== false;
        const secrets = (args?.secrets as Record<string, string>) || {};

        const result = await installAll(client, {
          essentialOnly,
          skipExisting,
          providedSecrets: secrets
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }

      case 'sync_registry': {
        const result = await syncRegistry();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: 'Registry synced from GitHub',
              ...result
            }, null, 2)
          }]
        };
      }

      case 'uninstall_mcp': {
        const mcpId = args?.mcp_id as string;
        const client = (args?.client as ClientType) || 'claude-code';

        const removed = removeMcpConfig(client, mcpId);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: removed ? 'success' : 'not_found',
              mcp_id: mcpId,
              client,
              message: removed
                ? `Removed '${mcpId}' from ${client}`
                : `MCP '${mcpId}' was not installed in ${client}`
            }, null, 2)
          }]
        };
      }

      case 'get_info': {
        const registryInfo = getRegistryInfo();
        const clientInfo = getAllClientInfo();
        let registry;
        try {
          registry = await getRegistry();
        } catch {
          registry = null;
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              name: 'daniel-rosehill-mcps',
              version: '1.0.0',
              description: "Daniel Rosehill's personal MCP installer",
              registry: {
                url: registryInfo.registryUrl,
                cache_dir: registryInfo.cacheDir,
                version: registry?.version || 'unavailable',
                mcp_count: registry?.mcps.length || 0,
                last_updated: registry?.updated || 'unavailable'
              },
              supported_clients: getSupportedClients(),
              clients: clientInfo
            }, null, 2)
          }]
        };
      }

      default:
        return {
          content: [{
            type: 'text',
            text: `Unknown tool: ${name}`
          }],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Daniel Rosehill MCP Installer running');
}

main().catch(console.error);
