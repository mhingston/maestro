import type { Agent, Mastra, Workflow } from "@mastra/core";
import type { Tool } from "@mastra/core/tools";
import type { MCPServerBase } from "@mastra/core/mcp";
import { resolveBuiltInAction } from "../actions/builtins";
import type { HandlerContext, HandlerRegistry, StepHandler } from "../registry";
import { createScorerHandlers } from "../evals/scorers";

export function createInternalRegistry(
	mastra: Mastra,
	options?: {
		workflows?: Record<string, Workflow>;
		networks?: Record<string, StepHandler>;
	},
): HandlerRegistry {
	const registry: HandlerRegistry = {
		handlers: {},
		agents: {},
		tools: {},
		workflows: options?.workflows ?? {},
		networks: options?.networks ?? {},
		voice: {},
		document: {},
		memory: {},
		vectorStore: {},
		rag: {},
		http: {},
		logger: {},
		requestContext: {},
		mcp: {},
	};

	// Register voice handlers
	registry.voice = createVoiceHandlers();

	// Register document processing handlers
	registry.document = createDocumentHandlers();

	// Register GraphRAG handlers
	registry.graphRag = createGraphRagHandlers();

	// Register eval scorers
	registry.evals = createScorerHandlers();

	// Register built-in actions as handlers (accessible via actions.* namespace)
	const actionNames = [
		"escalate",
		"saveResponse",
		"sendNotification",
		"delay",
		"condition",
	];
	for (const actionName of actionNames) {
		const handler = resolveBuiltInAction(actionName);
		if (handler) {
			registry.handlers[actionName] = handler;
		}
	}

	// Extract and register agents from Mastra
	const allAgents = (mastra as unknown as { agents?: Record<string, Agent> })
		.agents;
	if (allAgents && registry.agents) {
		for (const [name, agent] of Object.entries(allAgents)) {
			registry.agents[name] = agent;
		}
	}

	// Extract and register tools from Mastra
	const allTools = (mastra as unknown as { tools?: Record<string, Tool> })
		.tools;
	if (allTools && registry.tools) {
		for (const [name, tool] of Object.entries(allTools)) {
			registry.tools[name] = tool;
		}
	}

	// Extract and register MCP servers from Mastra
	const allMcpServers = (mastra as unknown as { mcpServers?: MCPServerBase[] })
		.mcpServers;
	if (allMcpServers && registry.mcp) {
		for (const server of allMcpServers) {
			// Register each MCP server's tools
			const tools = server.tools();
			for (const [toolName, tool] of Object.entries(tools)) {
				const key = `${server.id}.${toolName}`;
				registry.mcp[key] = createMCPHandler(server, toolName, tool);
			}
		}
	}

	return registry;
}

export function createAgentHandler(agent: Agent): StepHandler {
	return async (ctx: HandlerContext, params?: Record<string, unknown>) => {
		const resolvedInput = params ?? ctx.inputData;
		const prompt = (resolvedInput as { prompt?: string } | undefined)?.prompt;

		if (typeof prompt !== "string") {
			throw new Error("Agent handler requires prompt parameter");
		}

		const options =
			(resolvedInput as { options?: Record<string, unknown> } | undefined)
				?.options ?? {};
		const response = await agent.generate(prompt, options);
		return response;
	};
}

export function createToolHandler(tool: Tool): StepHandler {
	return async (ctx: HandlerContext, params?: Record<string, unknown>) => {
		const resolvedInput = params ?? ctx.inputData;

		if (!resolvedInput || typeof resolvedInput !== "object") {
			throw new Error("Tool handler requires input object");
		}

		const execute = (
			tool as unknown as {
				execute?: (
					input: unknown,
					options: { requestContext: unknown },
				) => Promise<unknown>;
			}
		).execute;
		if (!execute) {
			throw new Error(`Tool ${tool.id} does not have an execute method`);
		}

		return execute(resolvedInput, { requestContext: ctx.requestContext });
	};
}

export function augmentRegistryWithMastra(
	baseRegistry: HandlerRegistry,
	mastra: Mastra,
): HandlerRegistry {
	const enhanced = { ...baseRegistry };

	// Add agents
	const allAgents = (mastra as unknown as { agents?: Record<string, Agent> })
		.agents;
	if (allAgents) {
		for (const [name, agent] of Object.entries(allAgents)) {
			if (!enhanced.agents) enhanced.agents = {};
			enhanced.agents[name] = agent;
		}
	}

	// Add tools
	const allTools = (mastra as unknown as { tools?: Record<string, Tool> })
		.tools;
	if (allTools) {
		for (const [name, tool] of Object.entries(allTools)) {
			if (!enhanced.tools) enhanced.tools = {};
			enhanced.tools[name] = tool;
		}
	}

	// Add MCP servers
	const allMcpServers = (mastra as unknown as { mcpServers?: MCPServerBase[] })
		.mcpServers;
	if (allMcpServers) {
		for (const server of allMcpServers) {
			const tools = server.tools();
			for (const [toolName, tool] of Object.entries(tools)) {
				if (!enhanced.mcp) enhanced.mcp = {};
				const key = `${server.id}.${toolName}`;
				enhanced.mcp[key] = createMCPHandler(server, toolName, tool);
			}
		}
	}

	return enhanced;
}

// Create a handler for an MCP tool
function createMCPHandler(
	server: MCPServerBase,
	toolName: string,
	tool: unknown,
): StepHandler {
	return async (ctx: HandlerContext, params?: Record<string, unknown>) => {
		console.log(`[MCP] Executing ${server.id}.${toolName}`);

		// Execute the tool through the MCP server
		const result = await server.executeTool(toolName, params ?? {});
		return result;
	};
}

// Create voice handlers (TTS and Listen)
function createVoiceHandlers(): Record<string, StepHandler> {
	return {
		// Text-to-Speech handler
		tts: async (ctx: HandlerContext, params?: Record<string, unknown>) => {
			const { text, voice, provider } = params ?? {};
			console.log(
				`[TTS] Synthesizing speech: ${text?.toString().substring(0, 50)}...`,
			);
			console.log(`[TTS] Provider: ${provider}, Voice: ${voice}`);

			// In a real implementation, this would call Mastra's voice API
			// For now, return a mock audio reference
			return {
				audioUrl: `data:audio/mp3;base64,${Buffer.from(text as string).toString("base64")}`,
				duration: (text as string)?.length * 0.1 || 0,
				format: "mp3",
			};
		},
		// Speech-to-Text handler
		listen: async (ctx: HandlerContext, params?: Record<string, unknown>) => {
			const { audio, provider, language } = params ?? {};
			console.log(`[STT] Transcribing audio from ${provider || "default"}`);
			console.log(`[STT] Language: ${language || "auto"}`);

			// In a real implementation, this would call Mastra's voice API
			return {
				text: "[Transcribed text would appear here]",
				confidence: 0.95,
				language: language || "en-US",
			};
		},
	};
}

// Create document processing handlers
function createDocumentHandlers(): Record<string, StepHandler> {
	return {
		// Document chunking handler
		documentChunk: async (
			ctx: HandlerContext,
			params?: Record<string, unknown>,
		) => {
			const { document, strategy, chunkSize, chunkOverlap } = params ?? {};
			console.log(
				`[Document] Chunking with strategy: ${strategy || "sentence"}`,
			);

			const doc = document as string;
			const size = (chunkSize as number) || 500;
			const overlap = (chunkOverlap as number) || 50;

			// Simple chunking implementation
			const chunks: string[] = [];
			if (strategy === "character") {
				for (let i = 0; i < doc.length; i += size - overlap) {
					chunks.push(doc.slice(i, i + size));
				}
			} else {
				// Sentence-based chunking (simplified)
				const sentences = doc.split(/(?<=[.!?])\s+/);
				let currentChunk = "";
				for (const sentence of sentences) {
					if (currentChunk.length + sentence.length > size) {
						if (currentChunk) chunks.push(currentChunk.trim());
						currentChunk = sentence;
					} else {
						currentChunk = `${currentChunk} ${sentence}`;
					}
				}
				if (currentChunk) chunks.push(currentChunk.trim());
			}

			return {
				chunks,
				chunkCount: chunks.length,
				strategy: strategy || "sentence",
				metadata: {
					totalLength: doc.length,
					averageChunkSize: Math.floor(doc.length / chunks.length),
				},
			};
		},
		// Metadata extraction handler
		documentMetadata: async (
			ctx: HandlerContext,
			params?: Record<string, unknown>,
		) => {
			const { document, extractors } = params ?? {};
			console.log(
				`[Document] Extracting metadata: ${(extractors as string[])?.join(", ")}`,
			);

			const doc = document as string;
			const extractions = (extractors as string[]) || ["title", "summary"];
			const metadata: Record<string, unknown> = {};

			if (extractions.includes("title")) {
				// Extract first line or first sentence as title
				metadata.title =
					doc.split(/[.!?\n]/)[0]?.substring(0, 100) || "Untitled";
			}

			if (extractions.includes("summary")) {
				// First paragraph or first 200 chars as summary
				metadata.summary =
					doc.split("\n\n")[0]?.substring(0, 200) || doc.substring(0, 200);
			}

			if (extractions.includes("keywords")) {
				// Simple keyword extraction (words that appear multiple times)
				const words = doc.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
				const wordCount: Record<string, number> = {};
				for (const word of words) {
					wordCount[word] = (wordCount[word] || 0) + 1;
				}
				metadata.keywords = Object.entries(wordCount)
					.filter(([_, count]) => count > 2)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 10)
					.map(([word]) => word);
			}

			return metadata;
		},
		// Document transformation handler
		documentTransform: async (
			ctx: HandlerContext,
			params?: Record<string, unknown>,
		) => {
			const { document, transformations } = params ?? {};
			console.log(
				`[Document] Applying transformations: ${(transformations as string[])?.join(", ")}`,
			);

			let doc = document as string;
			const transforms = (transformations as string[]) || [];

			for (const transform of transforms) {
				switch (transform) {
					case "htmlToText":
						doc = doc.replace(/<[^>]*>/g, "");
						break;
					case "latexToText":
						doc = doc.replace(/\\[a-zA-Z]+\*?\{[^}]*\}/g, "");
						break;
					case "removeExtraWhitespace":
						doc = doc.replace(/\s+/g, " ").trim();
						break;
					case "normalizeNewlines":
						doc = doc.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
						break;
				}
			}

			return {
				document: doc,
				transformationsApplied: transforms,
			};
		},
	};
}

// Create GraphRAG handlers
function createGraphRagHandlers(): Record<string, StepHandler> {
	// Store graphs in memory (in production, this would be persistent)
	const graphs = new Map<string, GraphRagInstance>();

	return {
		// Build and query graph in one step
		graphRag: async (ctx: HandlerContext, params?: Record<string, unknown>) => {
			const {
				query,
				chunks,
				embeddings,
				topK,
				threshold,
				randomWalkSteps,
				restartProb,
			} = params ?? {};

			console.log(
				`[GraphRAG] Building graph with ${(chunks as string[])?.length} chunks`,
			);
			console.log(
				`[GraphRAG] Query: ${(query as string)?.substring(0, 50)}...`,
			);

			// In a real implementation, this would use Mastra's GraphRAG class
			// For now, return a simplified result
			const chunksList = chunks as string[];
			const embeddingsList = embeddings as number[][];

			// Simple similarity search (placeholder for actual GraphRAG)
			const results = chunksList
				.map((chunk, i) => ({
					chunk,
					index: i,
					score: embeddingsList[i] ? 0.8 + Math.random() * 0.2 : 0,
				}))
				.sort((a, b) => b.score - a.score)
				.slice(0, (topK as number) || 10);

			return {
				results,
				query: query as string,
				graphInfo: {
					nodes: chunksList.length,
					edges: Math.floor(chunksList.length * 1.5),
					threshold: (threshold as number) || 0.7,
				},
			};
		},
		// Query an existing graph
		graphRagQuery: async (
			ctx: HandlerContext,
			params?: Record<string, unknown>,
		) => {
			const { graphId, query, queryEmbedding, topK } = params ?? {};

			console.log(`[GraphRAG] Querying graph ${graphId as string}`);
			console.log(
				`[GraphRAG] Query: ${(query as string)?.substring(0, 50)}...`,
			);

			const graph = graphs.get(graphId as string);
			if (!graph) {
				throw new Error(`Graph ${graphId} not found`);
			}

			// Query the graph (placeholder)
			return {
				results: graph.nodes.slice(0, (topK as number) || 10),
				graphId: graphId as string,
			};
		},
	};
}

// Type for GraphRAG instance (simplified)
interface GraphRagInstance {
	nodes: Array<{ id: string; content: string; score: number }>;
	edges: Array<{ source: string; target: string; weight: number }>;
}
