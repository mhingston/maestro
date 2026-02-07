import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import matter from "gray-matter";

export interface ModelFallback {
	model: string;
	maxRetries?: number;
	enabled?: boolean;
}

export interface VoiceConfig {
	provider: string;
	model?: string;
	voice?: string;
}

export interface ProcessorConfig {
	input?: string[];
	output?: string[];
}

export interface EvalConfig {
	scorer: string;
	threshold?: number;
}

export interface AgentConfig {
	name: string;
	model: string;
	tools?: string[];
	temperature?: number;
	maxTokens?: number;
	system?: string;
	instructions: string;
	// Advanced features
	fallbacks?: ModelFallback[];
	voice?: VoiceConfig;
	processors?: ProcessorConfig;
	evals?: EvalConfig[];
	description?: string;
}

const DEFAULT_AGENTS_DIR = "./agents";

export async function loadAgents(
	agentsDir: string = DEFAULT_AGENTS_DIR,
): Promise<AgentConfig[]> {
	const configs: AgentConfig[] = [];

	try {
		const entries = await readdir(agentsDir, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isFile()) continue;

			const ext = extname(entry.name);
			if (ext !== ".md" && ext !== ".yaml" && ext !== ".yml") continue;

			const filePath = join(agentsDir, entry.name);
			const content = await readFile(filePath, "utf-8");

			if (ext === ".md") {
				const config = parseMarkdownAgent(entry.name, content);
				if (config) configs.push(config);
			} else {
				const config = parseYamlAgent(entry.name, content);
				if (config) configs.push(config);
			}
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
		// Directory doesn't exist, return empty array
	}

	return configs;
}

function parseMarkdownAgent(
	filename: string,
	content: string,
): AgentConfig | null {
	const parsed = matter(content);

	if (!parsed.data || typeof parsed.data !== "object") {
		throw new Error(`Invalid YAML frontmatter in ${filename}`);
	}

	const data = parsed.data as Record<string, unknown>;

	if (!data.model) {
		throw new Error(`Missing required field 'model' in ${filename}`);
	}

	const name = data.name ?? basename(filename, extname(filename));

	return {
		name: String(name),
		model: String(data.model),
		tools: Array.isArray(data.tools) ? data.tools.map(String) : undefined,
		temperature:
			typeof data.temperature === "number" ? data.temperature : undefined,
		maxTokens: typeof data.maxTokens === "number" ? data.maxTokens : undefined,
		system: data.system ? String(data.system) : undefined,
		instructions: parsed.content.trim(),
		// Advanced features
		fallbacks: parseFallbacks(data.fallbacks),
		voice: parseVoiceConfig(data.voice),
		processors: parseProcessorConfig(data.processors),
		evals: parseEvalConfigs(data.evals),
		description: data.description ? String(data.description) : undefined,
	};
}

function parseFallbacks(data: unknown): ModelFallback[] | undefined {
	if (!Array.isArray(data)) return undefined;
	return data.map((item) => ({
		model: String(item.model),
		maxRetries:
			typeof item.maxRetries === "number" ? item.maxRetries : undefined,
		enabled: typeof item.enabled === "boolean" ? item.enabled : undefined,
	}));
}

function parseVoiceConfig(data: unknown): VoiceConfig | undefined {
	if (!data || typeof data !== "object") return undefined;
	const obj = data as Record<string, unknown>;
	if (!obj.provider) return undefined;
	return {
		provider: String(obj.provider),
		model: obj.model ? String(obj.model) : undefined,
		voice: obj.voice ? String(obj.voice) : undefined,
	};
}

function parseProcessorConfig(data: unknown): ProcessorConfig | undefined {
	if (!data || typeof data !== "object") return undefined;
	const obj = data as Record<string, unknown>;
	return {
		input: Array.isArray(obj.input) ? obj.input.map(String) : undefined,
		output: Array.isArray(obj.output) ? obj.output.map(String) : undefined,
	};
}

function parseEvalConfigs(data: unknown): EvalConfig[] | undefined {
	if (!Array.isArray(data)) return undefined;
	return data.map((item) => ({
		scorer: String(item.scorer),
		threshold: typeof item.threshold === "number" ? item.threshold : undefined,
	}));
}

function parseYamlAgent(filename: string, content: string): AgentConfig | null {
	// For YAML files, we expect the entire file to be YAML
	// with name, model, tools, temperature, maxTokens, system, instructions fields
	import("yaml").then(({ parse }) => {
		const data = parse(content) as Record<string, unknown>;

		if (!data.model) {
			throw new Error(`Missing required field 'model' in ${filename}`);
		}

		const name = data.name ?? basename(filename, extname(filename));

		return {
			name: String(name),
			model: String(data.model),
			tools: Array.isArray(data.tools) ? data.tools.map(String) : undefined,
			temperature:
				typeof data.temperature === "number" ? data.temperature : undefined,
			maxTokens:
				typeof data.maxTokens === "number" ? data.maxTokens : undefined,
			system: data.system ? String(data.system) : undefined,
			instructions: String(data.instructions ?? ""),
			// Advanced features
			fallbacks: parseFallbacks(data.fallbacks),
			voice: parseVoiceConfig(data.voice),
			processors: parseProcessorConfig(data.processors),
			evals: parseEvalConfigs(data.evals),
			description: data.description ? String(data.description) : undefined,
		};
	});

	return null;
}

export function validateAgentConfig(config: AgentConfig): string[] {
	const errors: string[] = [];

	if (!config.name) errors.push("Agent name is required");
	if (!config.model) errors.push("Agent model is required");
	if (!config.instructions) errors.push("Agent instructions are required");

	return errors;
}
