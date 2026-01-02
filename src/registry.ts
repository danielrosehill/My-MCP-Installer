/**
 * Registry management - fetch and cache MCP registry from GitHub
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Registry, McpEntry } from './types.js';

// Default registry URL - points to GitHub repo
const DEFAULT_REGISTRY_URL = process.env.MCP_REGISTRY_URL ||
  'https://raw.githubusercontent.com/danielrosehill/My-MCP-Registry/main/mcps.json';

// Cache settings
const CACHE_DIR = process.env.MCP_CACHE_DIR || path.join(os.homedir(), '.cache', 'mcp-installer');
const CACHE_FILE = path.join(CACHE_DIR, 'registry.json');
const CACHE_TTL = parseInt(process.env.MCP_CACHE_TTL || '3600', 10) * 1000; // Convert to ms

// Local fallback registry (bundled with package for offline use)
const LOCAL_REGISTRY_PATH = path.join(import.meta.dirname, '..', 'registry', 'mcps.json');

interface CacheEntry {
  timestamp: number;
  registry: Registry;
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Read cached registry if valid
 */
function readCache(): Registry | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }

    const data = fs.readFileSync(CACHE_FILE, 'utf-8');
    const cache: CacheEntry = JSON.parse(data);

    // Check if cache is still valid
    if (Date.now() - cache.timestamp < CACHE_TTL) {
      return cache.registry;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Write registry to cache
 */
function writeCache(registry: Registry): void {
  try {
    ensureCacheDir();
    const cache: CacheEntry = {
      timestamp: Date.now(),
      registry
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('Failed to write cache:', error);
  }
}

/**
 * Fetch registry from GitHub
 */
async function fetchRemoteRegistry(): Promise<Registry> {
  const response = await fetch(DEFAULT_REGISTRY_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch registry: ${response.status} ${response.statusText}`);
  }

  const registry: Registry = await response.json();
  return registry;
}

/**
 * Load local fallback registry
 */
function loadLocalRegistry(): Registry | null {
  try {
    // Try the bundled registry first
    if (fs.existsSync(LOCAL_REGISTRY_PATH)) {
      const data = fs.readFileSync(LOCAL_REGISTRY_PATH, 'utf-8');
      return JSON.parse(data);
    }

    // Try relative to current working directory (for development)
    const devPath = path.join(process.cwd(), 'registry', 'mcps.json');
    if (fs.existsSync(devPath)) {
      const data = fs.readFileSync(devPath, 'utf-8');
      return JSON.parse(data);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get the MCP registry (with caching)
 */
export async function getRegistry(forceRefresh = false): Promise<Registry> {
  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = readCache();
    if (cached) {
      return cached;
    }
  }

  // Try to fetch from remote
  try {
    const registry = await fetchRemoteRegistry();
    writeCache(registry);
    return registry;
  } catch (error) {
    console.error('Failed to fetch remote registry:', error);

    // Fall back to cache (even if expired)
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = fs.readFileSync(CACHE_FILE, 'utf-8');
        const cache: CacheEntry = JSON.parse(data);
        console.error('Using expired cache as fallback');
        return cache.registry;
      }
    } catch {
      // Ignore cache read errors
    }

    // Fall back to local registry
    const local = loadLocalRegistry();
    if (local) {
      console.error('Using local registry as fallback');
      return local;
    }

    throw new Error('No registry available (remote fetch failed and no local fallback)');
  }
}

/**
 * Get a specific MCP entry by ID
 */
export async function getMcpById(id: string): Promise<McpEntry | null> {
  const registry = await getRegistry();
  return registry.mcps.find(mcp => mcp.id === id) || null;
}

/**
 * List MCPs with optional filters
 */
export async function listMcps(options?: {
  category?: string;
  essentialOnly?: boolean;
  enabledOnly?: boolean;
}): Promise<McpEntry[]> {
  const registry = await getRegistry();
  let mcps = registry.mcps;

  if (options?.category) {
    mcps = mcps.filter(mcp => mcp.category?.toLowerCase() === options.category?.toLowerCase());
  }

  if (options?.essentialOnly) {
    mcps = mcps.filter(mcp => mcp.essential === true);
  }

  if (options?.enabledOnly !== false) {
    mcps = mcps.filter(mcp => mcp.enabled !== false);
  }

  return mcps;
}

/**
 * Sync registry from GitHub (force refresh)
 */
export async function syncRegistry(): Promise<{ version: string; mcpCount: number; updated: string }> {
  const registry = await getRegistry(true);
  return {
    version: registry.version,
    mcpCount: registry.mcps.length,
    updated: registry.updated
  };
}

/**
 * Get registry info without fetching
 */
export function getRegistryInfo(): { cacheDir: string; cacheFile: string; registryUrl: string } {
  return {
    cacheDir: CACHE_DIR,
    cacheFile: CACHE_FILE,
    registryUrl: DEFAULT_REGISTRY_URL
  };
}
