import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const CF_API = "https://api.cloudflare.com/client/v4";

async function cf(env: any, path: string, init?: RequestInit) {
  const token = (env as any).CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN secret is not set on this Worker.");
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data: any = await res.json();
  if (!data.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

function createServer() {
  const server = new McpServer({
    name: "Cloudflare Manager",
    version: "1.0.0",
  });

  server.registerTool(
    "list_zones",
    { description: "List all Cloudflare zones (domains) on the account" },
    async () => {
      const env = (globalThis as any).__CF_ENV__;
      const zones = await cf(env, "/zones?per_page=50");
      return {
        content: [{
          type: "text",
          text: zones.map((z: any) => `${z.name} (id: ${z.id}, status: ${z.status})`).join("\n") || "No zones found.",
        }],
      };
    }
  );

  server.registerTool(
    "list_dns_records",
    {
      description: "List DNS records for a zone",
      inputSchema: { zone_id: z.string().describe("The Cloudflare zone ID") },
    },
    async ({ zone_id }) => {
      const env = (globalThis as any).__CF_ENV__;
      const records = await cf(env, `/zones/${zone_id}/dns_records?per_page=100`);
      return {
        content: [{
          type: "text",
          text: records.map((r: any) => `${r.type} ${r.name} -> ${r.content} (proxied: ${r.proxied}, id: ${r.id})`).join("\n") || "No DNS records found.",
        }],
      };
    }
  );

  server.registerTool(
    "list_workers",
    { description: "List all Workers scripts on the account" },
    async () => {
      const env = (globalThis as any).__CF_ENV__;
      const token = (env as any).CLOUDFLARE_API_TOKEN;
      const accountId = (env as any).CLOUDFLARE_ACCOUNT_ID;
      if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID secret is not set on this Worker.");
      const res = await fetch(`${CF_API}/accounts/${accountId}/workers/scripts`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data: any = await res.json();
      if (!data.success) throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
      return {
        content: [{
          type: "text",
          text: data.result.map((w: any) => `${w.id} (modified: ${w.modified_on})`).join("\n") || "No Workers found.",
        }],
      };
    }
  );

  server.registerTool(
    "list_d1_databases",
    { description: "List all D1 databases on the account" },
    async () => {
      const env = (globalThis as any).__CF_ENV__;
      const accountId = (env as any).CLOUDFLARE_ACCOUNT_ID;
      if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID secret is not set on this Worker.");
      const dbs = await cf(env, `/accounts/${accountId}/d1/database`);
      return {
        content: [{
          type: "text",
          text: dbs.map((d: any) => `${d.name} (id: ${d.uuid}, size: ${d.file_size} bytes)`).join("\n") || "No D1 databases found.",
        }],
      };
    }
  );

  server.registerTool(
    "list_pages_projects",
    { description: "List all Pages projects on the account" },
    async () => {
      const env = (globalThis as any).__CF_ENV__;
      const accountId = (env as any).CLOUDFLARE_ACCOUNT_ID;
      if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID secret is not set on this Worker.");
      const projects = await cf(env, `/accounts/${accountId}/pages/projects`);
      return {
        content: [{
          type: "text",
          text: projects.map((p: any) => `${p.name} (${p.subdomain}, created: ${p.created_on})`).join("\n") || "No Pages projects found.",
        }],
      };
    }
  );

  return server;
}

export default {
  fetch(request: Request, env: any, ctx: any) {
    (globalThis as any).__CF_ENV__ = env;
    return createMcpHandler(createServer)(request, env, ctx);
  },
} satisfies ExportedHandler;
