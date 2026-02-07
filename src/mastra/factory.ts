import { type Agent, Mastra } from "@mastra/core";
import type { Tool } from "@mastra/core/tools";
import type { MastraMemory } from "@mastra/core/memory";
import type { MastraVector } from "@mastra/core/vector";
import type { MastraStorage } from "@mastra/core/storage";
import type { MastraScorer } from "@mastra/core/evals";
import type { MCPServerBase } from "@mastra/core/mcp";
import type { AgentConfig, EvalConfig } from "../agents/loader";
import type {
	MemoryConfigSchema,
	StorageConfigSchema,
	MCPServerConfigSchema,
	CustomToolSchema,
} from "../spec";
import type { z } from "zod";
import {
	builtInTools,
	createToolFromBuiltIn,
	getBuiltInTool,
} from "../tools/builtins";

export interface MastraConfig {
	agents: AgentConfig[];
	env: Record<string, string>;
	enabledTools?: string[];
	// Advanced configuration
	memory?: z.infer<typeof MemoryConfigSchema>;
	storage?: z.infer<typeof StorageConfigSchema>;
	mcpServers?: Record<string, z.infer<typeof MCPServerConfigSchema>>;
	customTools?: z.infer<typeof CustomToolSchema>[];
	persistState?: boolean;
	globalEvals?: EvalConfig[];
}

export async function createMastraInstance(
	config: MastraConfig,
): Promise<Mastra> {
	const {
		agents,
		env,
		enabledTools,
		memory,
		storage,
		mcpServers,
		customTools,
		persistState,
		globalEvals,
	} = config;

	// Create memory instance if configured
	const memoryInstance = await createMemoryInstance(memory, env);

	// Create storage instance if configured
	const storageInstance = await createStorageInstance(storage, env);

	// Create MCP server instances if configured
	const mcpInstances = await createMCPServers(mcpServers, env);

	// Create custom tools
	const customToolInstances = await createCustomTools(customTools);

	// Create agents from configs
	const mastraAgents: Record<string, Agent> = {};

	for (const agentConfig of agents) {
		const agentTools: Tool[] = [];

		// Add tools specified in agent config
		if (agentConfig.tools) {
			for (const toolName of agentConfig.tools) {
				const tool = getBuiltInTool(toolName);
				if (tool) {
					agentTools.push(tool);
				}
			}
		}

		// Add custom tools
		for (const tool of Object.values(customToolInstances)) {
			agentTools.push(tool);
		}

		// Create agent with full configuration
		const agent = createAgent({
			name: agentConfig.name,
			model: agentConfig.model,
			instructions: agentConfig.system ?? agentConfig.instructions,
			tools: agentTools,
			temperature: agentConfig.temperature,
			maxTokens: agentConfig.maxTokens,
			description: agentConfig.description,
			// Advanced features
			fallbacks: agentConfig.fallbacks,
			voice: agentConfig.voice,
			memory: memoryInstance,
			scorers: resolveEvals(agentConfig.evals, globalEvals),
			inputProcessors: agentConfig.processors?.input,
			outputProcessors: agentConfig.processors?.output,
		});

		mastraAgents[agentConfig.name] = agent;
	}

	// Create tools map from enabled built-in tools
	const mastraTools: Record<string, Tool> = {};
	const toolsToEnable = enabledTools ?? Object.keys(builtInTools);

	for (const toolName of toolsToEnable) {
		const tool = builtInTools[toolName];
		if (tool) {
			mastraTools[toolName] = createToolFromBuiltIn(toolName, tool);
		}
	}

	// Add custom tools
	for (const [name, tool] of Object.entries(customToolInstances)) {
		mastraTools[name] = tool;
	}

	// Create Mastra instance with all configurations
	const mastraConfig: Record<string, unknown> = {
		agents: mastraAgents,
		tools: mastraTools,
	};

	if (memoryInstance) {
		mastraConfig.memory = memoryInstance;
	}

	if (storageInstance) {
		mastraConfig.storage = storageInstance;
	}

	if (mcpInstances.length > 0) {
		mastraConfig.mcpServers = mcpInstances;
	}

	return new Mastra(mastraConfig);
}

// Create memory instance from configuration
async function createMemoryInstance(
	config: z.infer<typeof MemoryConfigSchema> | undefined,
	env: Record<string, string>,
): Promise<MastraMemory | undefined> {
	if (!config) return undefined;

	// Memory creation would require actual Mastra Memory implementations
	// This is a stub showing the structure
	console.log("[Memory] Creating memory instance with config:", config);

	// Import would be: import { Memory } from "@mastra/memory";
	// const memory = new Memory({
	//   storage: createStorage(config.storage, config.connection),
	//   vector: createVector(config.semanticRecall?.vectorStore),
	//   embedder: createEmbedder(config.semanticRecall?.embedder),
	//   options: {
	//     lastMessages: config.lastMessages,
	//     semanticRecall: !!config.semanticRecall,
	//     workingMemory: config.workingMemory,
	//     generateTitle: config.generateTitle,
	//   },
	// });

	return undefined;
}

// Create storage instance from configuration
async function createStorageInstance(
	config: z.infer<typeof StorageConfigSchema> | undefined,
	env: Record<string, string>,
): Promise<MastraStorage | undefined> {
	if (!config) return undefined;

	console.log("[Storage] Creating storage instance with config:", config);

	// Storage creation would require actual Mastra Storage implementations
	// This is a stub showing the structure

	return undefined;
}

// Create MCP server instances
async function createMCPServers(
	servers: Record<string, z.infer<typeof MCPServerConfigSchema>> | undefined,
	env: Record<string, string>,
): Promise<MCPServerBase[]> {
	if (!servers) return [];

	const instances: MCPServerBase[] = [];

	for (const [name, config] of Object.entries(servers)) {
		console.log(`[MCP] Creating MCP server: ${name}`, config);

		// MCP server creation would require actual Mastra MCP implementations
		// This is a stub showing the structure
		// import { MCPClient } from "@mastra/core/mcp";
		// const mcpClient = new MCPClient({
		//   name,
		//   ...config,
		// });
		// instances.push(mcpClient);
	}

	return instances;
}

// Create custom tools from YAML definitions
async function createCustomTools(
	tools: z.infer<typeof CustomToolSchema>[] | undefined,
): Promise<Record<string, Tool>> {
	if (!tools) return {};

	const instances: Record<string, Tool> = {};

	for (const toolDef of tools) {
		console.log(`[Tools] Creating custom tool: ${toolDef.id}`);

		let handler: (input: unknown) => Promise<unknown>;

		if (toolDef.handler.inline) {
			// For inline handlers, we'd need to safely evaluate
			// This is a security concern in production
			handler = new Function("input", toolDef.handler.inline) as (
				input: unknown,
			) => Promise<unknown>;
		} else if (toolDef.handler.file) {
			// Load from file
			const module = await import(toolDef.handler.file);
			handler = module[toolDef.handler.export || "default"] || module.default;
		} else {
			throw new Error(
				`Tool ${toolDef.id} must have either inline or file handler`,
			);
		}

		// Create tool using Mastra's createTool
		// import { createTool } from "@mastra/core/tools";
		// const tool = createTool({
		//   id: toolDef.id,
		//   description: toolDef.description,
		//   inputSchema: toolDef.inputSchema,
		//   execute: handler,
		// });

		// instances[toolDef.id] = tool;
	}

	return instances;
}

// Resolve evals configuration
function resolveEvals(
	agentEvals: EvalConfig[] | undefined,
	globalEvals: EvalConfig[] | undefined,
): MastraScorer[] {
	const allEvals = [...(globalEvals || []), ...(agentEvals || [])];
	const scorers: MastraScorer[] = [];

	for (const evalConfig of allEvals) {
		console.log(`[Evals] Adding scorer: ${evalConfig.scorer}`);

		// Scorer resolution would require actual Mastra Eval implementations
		// import { createScorer } from "@mastra/evals";
		// const scorer = createScorer(evalConfig.scorer, {
		//   threshold: evalConfig.threshold,
		// });
		// scorers.push(scorer);
	}

	return scorers;
}

// Helper to create an agent with full configuration
function createAgent(config: {
	name: string;
	model: string;
	instructions?: string;
	tools?: Tool[];
	temperature?: number;
	maxTokens?: number;
	description?: string;
	fallbacks?: Array<{
		model: string;
		maxRetries?: number;
		enabled?: boolean;
	}>;
	voice?: { provider: string; model?: string; voice?: string };
	memory?: MastraMemory;
	scorers?: MastraScorer[];
	inputProcessors?: string[];
	outputProcessors?: string[];
}): Agent {
	// This is a simplified agent creation
	// In a real implementation, this would use Mastra's actual Agent class

	const agentConfig: Record<string, unknown> = {
		name: config.name,
		model: config.model,
		instructions: config.instructions ?? "",
		tools: config.tools ?? [],
		temperature: config.temperature,
		maxTokens: config.maxTokens,
	};

	if (config.description) {
		agentConfig.description = config.description;
	}

	if (config.fallbacks) {
		agentConfig.modelFallbacks = config.fallbacks;
	}

	if (config.memory) {
		agentConfig.memory = config.memory;
	}

	if (config.scorers && config.scorers.length > 0) {
		agentConfig.scorers = config.scorers;
	}

	console.log(
		`[Agent] Creating agent: ${config.name}`,
		config.fallbacks ? `with ${config.fallbacks.length} fallbacks` : "",
		config.memory ? "with memory" : "",
		config.scorers?.length ? `with ${config.scorers.length} evals` : "",
	);

	return agentConfig as unknown as Agent;
}

export function loadEnv(workflowDir: string): Record<string, string> {
	// Load .env file if it exists
	const env: Record<string, string> = { ...process.env } as Record<
		string,
		string
	>;

	// In a real implementation, we would parse .env file
	// For now, just return process.env
	return env;
}
