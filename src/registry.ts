import type { Agent, Mastra, Workflow } from "@mastra/core";
import type { RequestContext } from "@mastra/core/request-context";
import type { Tool } from "@mastra/core/tools";

export type HandlerContext = {
	mastra: Mastra;
	requestContext: RequestContext;
	inputData: unknown;
	getStepResult: (stepId: string) => unknown;
	getInitData: () => unknown;
};

export type StepHandler = (
	ctx: HandlerContext,
	params?: Record<string, unknown>,
) => Promise<unknown>;

// Internal registry type used by the declarative compiler
export type HandlerRegistry = {
	handlers: Record<string, StepHandler>;
	agents?: Record<string, Agent>;
	tools?: Record<string, Tool>;
	workflows?: Record<string, Workflow>;
	networks?: Record<string, StepHandler>;
	voice?: Record<string, StepHandler>;
	document?: Record<string, StepHandler>;
	graphRag?: Record<string, StepHandler>;
	evals?: Record<string, StepHandler>;
	memory?: Record<string, StepHandler>;
	vectorStore?: Record<string, StepHandler>;
	rag?: Record<string, StepHandler>;
	http?: Record<string, StepHandler>;
	logger?: Record<string, StepHandler>;
	requestContext?: Record<string, StepHandler>;
	mcp?: Record<string, StepHandler>;
};

export function resolveHandler(
	registry: HandlerRegistry,
	handlerId: string,
): StepHandler {
	const [namespace, name] = handlerId.includes(".")
		? handlerId.split(".")
		: ["handlers", handlerId];

	if (namespace === "handlers") {
		const handler = registry.handlers[name];
		if (!handler) {
			throw new Error(`Missing handler: ${handlerId}`);
		}
		return handler;
	}

	// For agent namespace
	if (namespace === "agent") {
		const agent = registry.agents?.[name];
		if (!agent) {
			throw new Error(`Missing agent: ${handlerId}`);
		}
		return async (ctx: HandlerContext, params?: Record<string, unknown>) => {
			const resolvedInput = (params ?? ctx.inputData) as
				| { prompt?: string; options?: Record<string, unknown> }
				| undefined;
			const prompt = resolvedInput?.prompt;
			if (typeof prompt !== "string") {
				throw new Error(`Agent handler requires prompt for ${handlerId}`);
			}
			const options = resolvedInput?.options ?? {};
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			const response = await (agent as Agent).generate(prompt, options);
			return response;
		};
	}

	// For tool namespace
	if (namespace === "tool") {
		const tool = registry.tools?.[name];
		if (!tool) {
			throw new Error(`Missing tool: ${handlerId}`);
		}
		return async (ctx: HandlerContext, params?: Record<string, unknown>) => {
			const resolvedInput = params ?? ctx.inputData;
			if (!resolvedInput || typeof resolvedInput !== "object") {
				throw new Error(`Tool handler requires input object for ${handlerId}`);
			}
			// @ts-expect-error TypeScript doesn't narrow types across closure boundaries
			return tool.execute(resolvedInput as Record<string, unknown>, {
				requestContext: ctx.requestContext,
			});
		};
	}

	// For MCP namespace (mcp.server.tool format)
	if (namespace === "mcp") {
		// handlerId format: mcp.serverName.toolName
		const parts = handlerId.split(".");
		if (parts.length >= 3) {
			const serverName = parts[1];
			const toolName = parts.slice(2).join(".");
			const key = `${serverName}.${toolName}`;
			const mcpHandler = registry.mcp?.[key];
			if (!mcpHandler) {
				throw new Error(`Missing MCP handler: ${handlerId}`);
			}
			return mcpHandler;
		}
		throw new Error(`Invalid MCP handler ID format: ${handlerId}`);
	}

	// For network namespace
	if (namespace === "network") {
		const networkHandler = registry.networks?.[name];
		if (!networkHandler) {
			throw new Error(`Missing network handler: ${handlerId}`);
		}
		return networkHandler;
	}

	// For voice namespace (tts, listen)
	if (namespace === "tts" || namespace === "listen") {
		const voiceHandler = registry.voice?.[name];
		if (!voiceHandler) {
			throw new Error(`Missing voice handler: ${handlerId}`);
		}
		return voiceHandler;
	}

	// For document namespace
	if (
		namespace === "documentChunk" ||
		namespace === "documentMetadata" ||
		namespace === "documentTransform"
	) {
		const documentHandler = registry.document?.[name];
		if (!documentHandler) {
			throw new Error(`Missing document handler: ${handlerId}`);
		}
		return documentHandler;
	}

	// For GraphRAG namespace
	if (namespace === "graphRag" || namespace === "graphRagQuery") {
		const graphRagHandler = registry.graphRag?.[name];
		if (!graphRagHandler) {
			throw new Error(`Missing GraphRAG handler: ${handlerId}`);
		}
		return graphRagHandler;
	}

	// For evals namespace
	if (namespace === "evals") {
		const evalHandler = registry.evals?.[name];
		if (!evalHandler) {
			throw new Error(`Missing eval scorer: ${handlerId}`);
		}
		return evalHandler;
	}

	// For other namespaces (memory, vectorStore, etc.)
	const bucket = (registry as Record<string, unknown>)[namespace] as
		| Record<string, StepHandler>
		| undefined;
	if (!bucket || !bucket[name]) {
		throw new Error(`Missing handler: ${handlerId}`);
	}
	return bucket[name];
}
