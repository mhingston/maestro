import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const JsonSchema = z.union([
	z.record(z.unknown()),
	z.array(z.unknown()),
]);

export const WorkflowOptionsSchema = z.object({
	validateInputs: z.boolean().optional(),
	schemaCompatibility: z.enum(["strict", "warn"]).optional(),
	retryConfig: z
		.object({
			attempts: z.number(),
			delay: z.number(),
		})
		.optional(),
});

const StepBase = z.object({
	id: z.string(),
	inputSchema: JsonSchema,
	outputSchema: JsonSchema,
	description: z.string().optional(),
});

export const GenericStep = StepBase.extend({
	type: z.literal("step"),
	action: z.string().describe("Built-in action name to execute"),
	input: z
		.union([z.string(), z.record(z.unknown())])
		.optional()
		.describe("Input to the action"),
	output: z
		.string()
		.optional()
		.describe("Output variable name to store result"),
	outputMapping: z
		.record(z.string())
		.optional()
		.describe("Map action output fields to step output"),
	params: z.record(z.unknown()).optional(),
	retries: z.number().optional(),
});

export const AgentStep = StepBase.extend({
	type: z.literal("agent"),
	agent: z
		.string()
		.describe("Name of the agent to use (loads from agents/{name}.md)"),
	input: z
		.union([z.string(), z.record(z.unknown())])
		.optional()
		.describe(
			"Input to the agent (supports template expressions like ${input.message})",
		),
	output: z
		.string()
		.optional()
		.describe("Output variable name to store result"),
	outputMapping: z
		.record(z.string())
		.optional()
		.describe("Map agent output fields to step output"),
	params: z.record(z.unknown()).optional(),
});

export const ToolStep = StepBase.extend({
	type: z.literal("tool"),
	tool: z.string().describe("Name of the built-in tool to use"),
	input: z
		.union([z.string(), z.record(z.unknown())])
		.optional()
		.describe("Input to the tool"),
	output: z
		.string()
		.optional()
		.describe("Output variable name to store result"),
	outputMapping: z
		.record(z.string())
		.optional()
		.describe("Map tool output fields to step output"),
	params: z.record(z.unknown()).optional(),
});

export const MemoryStep = StepBase.extend({
	type: z.literal("memory"),
	handler: z.string(),
	params: z.record(z.unknown()).optional(),
});

export const VectorStoreStep = StepBase.extend({
	type: z.literal("vectorStore"),
	handler: z.string(),
	params: z.record(z.unknown()).optional(),
});

export const RagStep = StepBase.extend({
	type: z.literal("rag"),
	handler: z.string(),
	params: z.record(z.unknown()).optional(),
});

export const HttpStep = StepBase.extend({
	type: z.literal("http"),
	handler: z.string(),
	params: z.record(z.unknown()).optional(),
});

export const LoggerStep = StepBase.extend({
	type: z.literal("logger"),
	handler: z.string(),
	params: z.record(z.unknown()).optional(),
});

export const RequestContextStep = StepBase.extend({
	type: z.literal("requestContext"),
	handler: z.string(),
	params: z.record(z.unknown()).optional(),
});

export const SleepStep = z.object({
	type: z.literal("sleep"),
	ms: z.number(),
	id: z.string().optional(),
});

export const SleepUntilStep = z.object({
	type: z.literal("sleepUntil"),
	date: z.string(),
	id: z.string().optional(),
});

export const HumanInputStep = z.object({
	type: z.literal("humanInput"),
	prompt: z.string().describe("The question or prompt to show to the human"),
	inputType: z
		.enum(["text", "confirm", "select", "multiselect"])
		.default("text")
		.describe("Type of input requested"),
	options: z
		.array(z.string())
		.optional()
		.describe("Options for select/multiselect types"),
	timeout: z
		.number()
		.min(1000)
		.max(86400000)
		.optional()
		.describe("Timeout in milliseconds"),
	id: z.string().optional(),
});

export const BailStep = z.object({
	type: z.literal("bail"),
	when: z
		.string()
		.optional()
		.describe(
			"Optional condition expression (e.g., ${steps.review.output.approved == false})",
		),
	payload: z
		.record(z.unknown())
		.describe("Data to include when bailing (e.g., reason, status)"),
	id: z.string().optional(),
});

const MappingSourceSchema = z.union([
	z.object({
		from: z.literal("step"),
		stepId: z.string(),
		path: z.string(),
	}),
	z.object({
		from: z.literal("init"),
		path: z.string(),
	}),
	z.object({
		from: z.literal("requestContext"),
		path: z.string(),
	}),
	z.object({
		value: z.unknown(),
	}),
]);

export const MapStep = z.object({
	type: z.literal("map"),
	mappings: z.record(MappingSourceSchema),
	id: z.string().optional(),
});

export const ForeachStep: z.ZodTypeAny = z.object({
	type: z.literal("foreach"),
	concurrency: z.number().optional(),
	step: z.lazy(() => StepNode),
});

export const BranchStep: z.ZodTypeAny = z.object({
	type: z.literal("branch"),
	branches: z
		.array(
			z.object({
				when: z.object({
					handler: z.string(),
					inputSchema: JsonSchema,
					outputSchema: JsonSchema,
					params: z.record(z.unknown()).optional(),
				}),
				steps: z.array(z.lazy(() => StepNode)),
			}),
		)
		.min(1),
});

export const ParallelStep: z.ZodTypeAny = z.object({
	type: z.literal("parallel"),
	steps: z.array(z.lazy(() => StepNode)).min(1),
});

export const DoWhileStep: z.ZodTypeAny = z.object({
	type: z.literal("dowhile"),
	step: z.lazy(() => StepNode),
	condition: z.object({
		handler: z.string(),
		inputSchema: JsonSchema,
		outputSchema: JsonSchema,
		params: z.record(z.unknown()).optional(),
	}),
});

export const DoUntilStep: z.ZodTypeAny = z.object({
	type: z.literal("dountil"),
	step: z.lazy(() => StepNode),
	condition: z.object({
		handler: z.string(),
		inputSchema: JsonSchema,
		outputSchema: JsonSchema,
		params: z.record(z.unknown()).optional(),
	}),
});

export const WorkflowStep: z.ZodTypeAny = z.object({
	type: z.literal("workflow"),
	workflowId: z.string(),
	inputMapping: z.record(MappingSourceSchema).optional(),
});

// MCP Server Configuration
export const MCPServerConfigSchema = z.object({
	url: z.string().optional().describe("URL for HTTP/SSE transport"),
	command: z.string().optional().describe("Command for stdio transport"),
	args: z
		.array(z.string())
		.optional()
		.describe("Arguments for stdio transport"),
	env: z.record(z.string()).optional().describe("Environment variables"),
});

// MCP Step
export const McpStep = StepBase.extend({
	type: z.literal("mcp"),
	server: z.string().describe("Reference to MCP server in config"),
	tool: z.string().describe("Tool name to execute on MCP server"),
	input: z
		.union([z.string(), z.record(z.unknown())])
		.optional()
		.describe("Input to the MCP tool"),
	output: z
		.string()
		.optional()
		.describe("Output variable name to store result"),
});

// Memory Configuration
export const SemanticRecallConfigSchema = z.object({
	vectorStore: z.enum(["pgvector", "pinecone", "chroma", "qdrant"]).optional(),
	embedder: z.string().optional(),
	topK: z.number().optional(),
});

export const WorkingMemoryConfigSchema = z.object({
	enabled: z.boolean().default(false),
	template: z.string().optional(),
});

export const MemoryConfigSchema = z.object({
	storage: z.enum(["postgresql", "libsql", "mongodb", "upstash"]).optional(),
	connection: z.string().optional(),
	semanticRecall: SemanticRecallConfigSchema.optional(),
	workingMemory: WorkingMemoryConfigSchema.optional(),
	lastMessages: z.number().optional(),
	generateTitle: z.boolean().optional(),
});

// Storage Configuration
export const StorageConfigSchema = z.object({
	backend: z
		.enum(["postgresql", "libsql", "mongodb", "upstash", "redis"])
		.optional(),
	connection: z.string().optional(),
});

// Eval Configuration
export const EvalConfigSchema = z.object({
	scorer: z.string(),
	threshold: z.number().optional(),
});

// Eval Step - Run evaluation scorer
export const EvalStep = StepBase.extend({
	type: z.literal("evals"),
	scorer: z.string().describe("Name of the scorer to run"),
	outputText: z.string().describe("Output text to evaluate"),
	context: z.string().optional().describe("Context/reference text"),
	expected: z.string().optional().describe("Expected output for comparison"),
	threshold: z.number().optional().describe("Pass/fail threshold (0-1)"),
});

// Custom Tool Definition
export const CustomToolSchema = z.object({
	id: z.string(),
	description: z.string(),
	inputSchema: JsonSchema,
	handler: z.object({
		file: z.string().optional(),
		export: z.string().optional(),
		inline: z.string().optional(),
	}),
});

// Network Configuration
export const NetworkAgentSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	agent: z.string().describe("Name of the agent to use"),
});

export const NetworkConfigSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	description: z.string().optional(),
	agents: z.array(NetworkAgentSchema).min(1),
	router: z.enum(["auto", "round-robin", "manual"]).default("auto"),
	maxIterations: z.number().optional().default(10),
	instructions: z.string().optional(),
});

// Agent Step Enhancement - Add memory and evals support
export const EnhancedAgentStep = AgentStep.extend({
	memory: z.boolean().optional().describe("Enable conversation history"),
	threadId: z
		.string()
		.optional()
		.describe("Thread ID for conversation continuity"),
	evals: z.array(z.string()).optional().describe("Eval scorers to run"),
	stream: z.boolean().optional().describe("Enable streaming output"),
});

// Network Step - Multi-agent routing
export const NetworkStep = StepBase.extend({
	type: z.literal("network"),
	network: z.string().describe("Name of the network to invoke"),
	input: z
		.union([z.string(), z.record(z.unknown())])
		.optional()
		.describe("Input to the network"),
	output: z
		.string()
		.optional()
		.describe("Output variable name to store result"),
	maxIterations: z
		.number()
		.optional()
		.describe("Maximum number of routing iterations"),
});

// Voice Steps
export const TtsStep = StepBase.extend({
	type: z.literal("tts"),
	text: z.string().describe("Text to synthesize to speech"),
	voice: z.string().optional().describe("Voice ID to use"),
	provider: z
		.enum(["openai", "elevenlabs", "azure"])
		.optional()
		.describe("TTS provider"),
	output: z
		.string()
		.optional()
		.describe("Output variable name to store audio data"),
});

export const ListenStep = StepBase.extend({
	type: z.literal("listen"),
	audio: z.string().describe("Audio data or path to transcribe"),
	provider: z
		.enum(["openai", "deepgram", "assemblyai"])
		.optional()
		.describe("STT provider"),
	language: z.string().optional().describe("Language code (e.g., 'en-US')"),
	output: z
		.string()
		.optional()
		.describe("Output variable name to store transcription"),
});

// Document Processing Steps
export const DocumentChunkStep = StepBase.extend({
	type: z.literal("documentChunk"),
	document: z.string().describe("Document content or path to process"),
	strategy: z
		.enum(["character", "sentence", "token", "markdown", "json"])
		.default("sentence"),
	chunkSize: z.number().optional().describe("Maximum chunk size"),
	chunkOverlap: z.number().optional().describe("Overlap between chunks"),
	output: z
		.string()
		.optional()
		.describe("Output variable name to store chunks"),
});

export const DocumentMetadataStep = StepBase.extend({
	type: z.literal("documentMetadata"),
	document: z.string().describe("Document content to extract metadata from"),
	extractors: z
		.array(z.enum(["title", "summary", "keywords", "questions", "schema"]))
		.default(["title", "summary"]),
	output: z
		.string()
		.optional()
		.describe("Output variable name to store metadata"),
});

export const DocumentTransformStep = StepBase.extend({
	type: z.literal("documentTransform"),
	document: z.string().describe("Document content to transform"),
	transformations: z
		.array(
			z.enum([
				"htmlToText",
				"latexToText",
				"removeExtraWhitespace",
				"normalizeNewlines",
			]),
		)
		.default(["removeExtraWhitespace"]),
	output: z
		.string()
		.optional()
		.describe("Output variable name to store transformed document"),
});

// Enhanced Suspend/Resume Step
export const SuspendStep = z.object({
	type: z.literal("suspend"),
	id: z.string().optional(),
	prompt: z.string().describe("Prompt to show when suspending"),
	waitFor: z.enum(["input", "approval", "event"]).default("input"),
	timeout: z.number().optional().describe("Timeout in milliseconds"),
	resumeSchema: JsonSchema.optional().describe("Schema for resumed data"),
});

export const ResumeStep = z.object({
	type: z.literal("resume"),
	id: z.string().optional(),
	data: z.record(z.unknown()).describe("Data to resume with"),
});

// GraphRAG Steps
export const GraphRagStep = StepBase.extend({
	type: z.literal("graphRag"),
	query: z.string().describe("Query to search for"),
	chunks: z
		.union([z.array(z.string()), z.string()])
		.describe("Document chunks to build graph from (or template expression)"),
	embeddings: z
		.union([z.array(z.array(z.number())), z.string(), z.array(z.unknown())])
		.describe("Embeddings for chunks (or template expression)"),
	topK: z.number().optional().default(10).describe("Number of top results"),
	threshold: z
		.number()
		.optional()
		.default(0.7)
		.describe("Similarity threshold for edges"),
	randomWalkSteps: z
		.number()
		.optional()
		.default(100)
		.describe("Random walk steps for reranking"),
	restartProb: z
		.number()
		.optional()
		.default(0.15)
		.describe("Restart probability"),
	output: z.string().optional().describe("Output variable name"),
});

export const GraphRagQueryStep = StepBase.extend({
	type: z.literal("graphRagQuery"),
	graphId: z.string().describe("Reference to stored graph"),
	query: z.string().describe("Query text"),
	queryEmbedding: z.array(z.number()).describe("Query embedding vector"),
	topK: z.number().optional().default(10),
	output: z.string().optional().describe("Output variable name"),
});

export const StepNode: z.ZodTypeAny = z.union([
	GenericStep,
	EnhancedAgentStep,
	ToolStep,
	McpStep,
	NetworkStep,
	TtsStep,
	ListenStep,
	DocumentChunkStep,
	DocumentMetadataStep,
	DocumentTransformStep,
	GraphRagStep,
	GraphRagQueryStep,
	EvalStep,
	SuspendStep,
	ResumeStep,
	MemoryStep,
	VectorStoreStep,
	RagStep,
	HttpStep,
	LoggerStep,
	RequestContextStep,
	SleepStep,
	SleepUntilStep,
	HumanInputStep,
	BailStep,
	MapStep,
	ForeachStep,
	BranchStep,
	ParallelStep,
	DoWhileStep,
	DoUntilStep,
	WorkflowStep,
]);

// Cache Configuration
export const CacheConfigSchema = z.object({
	enabled: z.boolean().default(false),
	backend: z.enum(["memory", "redis", "filesystem"]).default("memory"),
	connection: z.string().optional(),
	ttl: z.number().optional().describe("Default TTL in seconds"),
	maxSize: z.number().optional().describe("Maximum cache size in bytes"),
});

// GraphRAG Configuration
export const GraphRagConfigSchema = z.object({
	id: z.string(),
	dimension: z.number().default(1536),
	threshold: z.number().default(0.7),
	description: z.string().optional(),
});

// Observability Configuration
export const ObservabilityConfigSchema = z.object({
	provider: z.enum([
		"langfuse",
		"langsmith",
		"braintrust",
		"arize",
		"datadog",
		"posthog",
		"sentry",
		"laminar",
		"otel",
	]),
	apiKey: z.string().optional(),
	endpoint: z.string().optional(),
	projectId: z.string().optional(),
	enabled: z.boolean().default(true),
});

export const WorkflowSpecSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	version: z.number().optional(),
	inputSchema: JsonSchema,
	outputSchema: JsonSchema,
	stateSchema: JsonSchema.optional(),
	requestContextSchema: JsonSchema.optional(),
	options: WorkflowOptionsSchema.optional(),
	steps: z.array(StepNode).min(1),
	// Global evals configuration
	evals: z.array(EvalConfigSchema).optional(),
	// Custom tools registry
	tools: z.array(CustomToolSchema).optional(),
	// Agent networks
	networks: z.array(NetworkConfigSchema).optional(),
	// GraphRAG configurations
	graphRags: z.array(GraphRagConfigSchema).optional(),
	config: z
		.object({
			agentsDir: z.string().optional(),
			enabledTools: z.array(z.string()).optional(),
			// MCP servers configuration
			mcpServers: z.record(MCPServerConfigSchema).optional(),
			// Memory system configuration
			memory: MemoryConfigSchema.optional(),
			// Storage configuration for persistence
			storage: StorageConfigSchema.optional(),
			// Persist workflow state
			persistState: z.boolean().optional(),
			// Cache configuration
			cache: CacheConfigSchema.optional(),
			// Observability configuration
			observability: ObservabilityConfigSchema.optional(),
		})
		.optional(),
});

export type WorkflowSpec = z.infer<typeof WorkflowSpecSchema>;
export type StepSpec = z.infer<typeof StepNode>;

export function getWorkflowSpecJsonSchema() {
	return zodToJsonSchema(WorkflowSpecSchema, { name: "WorkflowSpec" });
}
