import type { Plugin } from "@opencode-ai/plugin";
import { existsSync, readFileSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export const FigraniumPlugin: Plugin = async () => {
  const agentPath = path.join(currentDir, "agents/figranium.md");
  const instructionsPath = path.join(currentDir, "instructions/figranium-routing.md");
  const skillsPath = path.join(currentDir, "skills");

  if (!existsSync(agentPath) || !existsSync(instructionsPath) || !existsSync(skillsPath)) {
    throw new Error("Figranium OpenCode plugin assets are missing");
  }

  const agent = readFileSync(agentPath, "utf8");

  return {
    config: async (config) => {
      const cfg = config as typeof config & { skills?: { paths?: string[] } };

      cfg.mcp = {
        ...cfg.mcp,
        figranium: {
          type: "local",
          command: ["npx", "-y", "figranium-mcp"],
          enabled: true,
          environment: {
            FIGRANIUM_BASE_URL: "{env:FIGRANIUM_BASE_URL}",
            FIGRANIUM_API_KEY: "{env:FIGRANIUM_API_KEY}",
          },
        },
      };

      cfg.agent = {
        ...cfg.agent,
        figranium: {
          prompt: agent,
          mode: "all",
          tools: {
            "figranium_*": true,
          },
          description: "Use Figranium for browser automation, task creation, execution, scheduling, and browser interaction.",
        },
      };

      cfg.skills = {
        ...cfg.skills,
        paths: [...(cfg.skills?.paths ?? []), skillsPath],
      };

      cfg.tools = {
        ...cfg.tools,
        "figranium_*": true,
      };

      cfg.instructions = [...(cfg.instructions ?? []), instructionsPath];
    },
  };
};

export default FigraniumPlugin;
