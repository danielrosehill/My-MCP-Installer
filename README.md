# Daniel Rosehill's MCP Installer

A personal MCP server that manages installation of my MCP servers across machines. Perfect for quickly setting up all my MCPs on a new laptop or workstation.

## What This Does

This is an MCP server that:

1. **Fetches my MCP registry** from a GitHub repo (so I can update the list without republishing to npm)
2. **Installs MCPs** to Claude Code, Cursor, VS Code, and other MCP-compatible clients
3. **Prompts for secrets** when MCPs require API keys

## Quick Start

Add to your Claude Code config (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "my-mcps": {
      "command": "npx",
      "args": ["-y", "daniel-rosehill-mcps"]
    }
  }
}
```

Then in Claude Code, use the tools:

```
# See all available MCPs
list_mcps

# Install all essential MCPs
install_all essential_only=true

# Install a specific MCP
install_mcp mcp_id="gemini_transcription" secrets={"GOOGLE_API_KEY": "your-key"}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_mcps` | List all MCPs in the registry (filter by category, essential) |
| `list_installed` | Show installed MCPs for a client |
| `install_mcp` | Install one MCP to a client |
| `install_all` | Install all/essential MCPs to a client |
| `sync_registry` | Refresh registry from GitHub |
| `uninstall_mcp` | Remove an MCP from a client |
| `get_info` | Show installer info and supported clients |

## Supported Clients

- **Claude Code**: `~/.claude/settings.json`
- **Cursor**: `~/.cursor/mcp.json`
- **VS Code**: `~/.config/Code/mcp.json`

## Registry Format

The MCP registry is a JSON file hosted on GitHub. Example entry:

```json
{
  "id": "gemini_transcription",
  "name": "Gemini Transcription",
  "description": "Audio transcription via Gemini",
  "category": "Audio",
  "essential": true,
  "type": "npm",
  "config": {
    "package": "gemini-transcription-mcp"
  },
  "secrets": [
    { "key": "GOOGLE_API_KEY", "description": "Google AI API key", "required": true }
  ]
}
```

### MCP Types

- **npm**: Installed via `npx -y package-name`
- **streamable-http**: Modern HTTP streaming transport (recommended for remote servers)
- **sse**: Server-Sent Events endpoint (legacy)
- **http**: Standard HTTP endpoint
- **docker**: Docker container

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_REGISTRY_URL` | Override registry URL | GitHub raw URL |
| `MCP_CACHE_DIR` | Cache directory | `~/.cache/mcp-installer` |
| `MCP_CACHE_TTL` | Cache TTL in seconds | `3600` |

## License

MIT
