import type { Tool } from "@mastra/core/tools";
import { z } from "zod";

export type BuiltInTool = {
	description: string;
	inputSchema: z.ZodType;
	handler: (input: unknown) => Promise<unknown>;
};

export const httpTool: BuiltInTool = {
	description: "Make HTTP requests to external APIs",
	inputSchema: z.object({
		url: z.string().url(),
		method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
		headers: z.record(z.string()).optional(),
		body: z.union([z.string(), z.record(z.unknown())]).optional(),
		timeout: z.number().min(1).max(300000).default(30000),
	}),
	handler: async (input) => {
		const { url, method, headers, body, timeout } = input as {
			url: string;
			method: string;
			headers?: Record<string, string>;
			body?: string | Record<string, unknown>;
			timeout: number;
		};

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const fetchInit: RequestInit = {
				method,
				headers: headers ?? {},
				signal: controller.signal,
			};

			if (body) {
				fetchInit.body = typeof body === "string" ? body : JSON.stringify(body);
				if (typeof body !== "string" && !headers?.["Content-Type"]) {
					fetchInit.headers = {
						...fetchInit.headers,
						"Content-Type": "application/json",
					};
				}
			}

			const response = await fetch(url, fetchInit);
			const responseData = await response.text();

			let parsedBody: unknown;
			try {
				parsedBody = JSON.parse(responseData);
			} catch {
				parsedBody = responseData;
			}

			return {
				status: response.status,
				statusText: response.statusText,
				headers: Object.fromEntries(response.headers.entries()),
				body: parsedBody,
			};
		} finally {
			clearTimeout(timeoutId);
		}
	},
};

export const calculatorTool: BuiltInTool = {
	description: "Perform mathematical calculations safely",
	inputSchema: z.object({
		expression: z
			.string()
			.describe(
				"Mathematical expression to evaluate (e.g., '2 + 2', '10 * 5')",
			),
	}),
	handler: async (input) => {
		const { expression } = input as { expression: string };

		// Whitelist allowed characters for safety
		const allowedPattern = /^[\d\s+\-*/().,%^]+$/;
		if (!allowedPattern.test(expression)) {
			throw new Error(
				"Expression contains invalid characters. Only numbers and basic operators are allowed.",
			);
		}

		// Replace ^ with ** for exponentiation
		const sanitizedExpression = expression.replace(/\^/g, "**");

		// Use Function constructor in a safe way
		try {
			// eslint-disable-next-line no-new-func
			const result = new Function(`return (${sanitizedExpression})`)();
			return { result };
		} catch (error) {
			throw new Error(`Failed to evaluate expression: ${error}`);
		}
	},
};

export const memoryTool: BuiltInTool = {
	description: "Store and retrieve data from memory",
	inputSchema: z.object({
		action: z.enum(["get", "set", "delete", "list"]),
		key: z.string().optional(),
		value: z.unknown().optional(),
		prefix: z.string().optional(),
	}),
	handler: async (input) => {
		const { action, key, value, prefix } = input as {
			action: "get" | "set" | "delete" | "list";
			key?: string;
			value?: unknown;
			prefix?: string;
		};

		// In-memory store (could be replaced with persistent storage)
		const store =
			(globalThis as unknown as { __maestroMemoryStore?: Map<string, unknown> })
				.__maestroMemoryStore ?? new Map();
		(
			globalThis as unknown as { __maestroMemoryStore?: Map<string, unknown> }
		).__maestroMemoryStore = store;

		switch (action) {
			case "get": {
				if (!key) throw new Error("Key is required for 'get' action");
				return { value: store.get(key), exists: store.has(key) };
			}
			case "set": {
				if (!key) throw new Error("Key is required for 'set' action");
				store.set(key, value);
				return { success: true, key };
			}
			case "delete": {
				if (!key) throw new Error("Key is required for 'delete' action");
				const existed = store.has(key);
				store.delete(key);
				return { success: true, existed };
			}
			case "list": {
				const entries: Array<{ key: string; value: unknown }> = [];
				for (const [k, v] of store.entries()) {
					if (!prefix || k.startsWith(prefix)) {
						entries.push({ key: k, value: v });
					}
				}
				return { entries, count: entries.length };
			}
			default:
				throw new Error(`Unknown action: ${action}`);
		}
	},
};

// Simple in-memory vector store for testing
const inMemoryVectorStore: Map<
	string,
	Array<{
		id: string;
		text: string;
		embedding: number[];
		metadata: Record<string, unknown>;
	}>
> = new Map();

// Simple embedding function using term frequency (fallback when no embedding model available)
function createSimpleEmbedding(text: string, dimensions = 384): number[] {
	const words = text.toLowerCase().split(/\s+/);
	const vector = new Array(dimensions).fill(0);

	// Hash-based encoding of words
	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		let hash = 0;
		for (let j = 0; j < word.length; j++) {
			const char = word.charCodeAt(j);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		const index = Math.abs(hash) % dimensions;
		vector[index] += 1;
	}

	// Normalize
	const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
	if (magnitude > 0) {
		return vector.map((val) => val / magnitude);
	}
	return vector;
}

// Cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const vectorStoreTool: BuiltInTool = {
	description: "Query a vector store for semantic search",
	inputSchema: z.object({
		action: z
			.enum(["upsert", "query", "delete", "list"])
			.default("query")
			.describe("Action to perform"),
		indexName: z
			.string()
			.default("default")
			.describe("Name of the vector index"),
		query: z.string().optional().describe("Query text for search"),
		topK: z
			.number()
			.min(1)
			.max(100)
			.default(5)
			.describe("Number of results to return"),
		filter: z
			.record(z.unknown())
			.optional()
			.describe("Optional metadata filters"),
		documents: z
			.array(
				z.object({
					id: z.string(),
					text: z.string(),
					metadata: z.record(z.unknown()).optional(),
				}),
			)
			.optional()
			.describe("Documents to insert/update"),
		ids: z.array(z.string()).optional().describe("Document IDs to delete"),
	}),
	handler: async (input) => {
		const { action, indexName, query, topK, filter, documents, ids } =
			input as {
				action: "upsert" | "query" | "delete" | "list";
				indexName: string;
				query?: string;
				topK: number;
				filter?: Record<string, unknown>;
				documents?: Array<{
					id: string;
					text: string;
					metadata?: Record<string, unknown>;
				}>;
				ids?: string[];
			};

		switch (action) {
			case "upsert": {
				if (!documents || documents.length === 0) {
					throw new Error("documents required for upsert action");
				}

				const index = inMemoryVectorStore.get(indexName) || [];

				for (const doc of documents) {
					const embedding = createSimpleEmbedding(doc.text);
					const existingIdx = index.findIndex((item) => item.id === doc.id);

					if (existingIdx >= 0) {
						index[existingIdx] = {
							id: doc.id,
							text: doc.text,
							embedding,
							metadata: doc.metadata || {},
						};
					} else {
						index.push({
							id: doc.id,
							text: doc.text,
							embedding,
							metadata: doc.metadata || {},
						});
					}
				}

				inMemoryVectorStore.set(indexName, index);

				return {
					success: true,
					action,
					indexName,
					upsertedCount: documents.length,
					totalCount: index.length,
				};
			}

			case "query": {
				if (!query) {
					throw new Error("query required for query action");
				}

				const index = inMemoryVectorStore.get(indexName) || [];
				const queryEmbedding = createSimpleEmbedding(query);

				// Calculate similarities
				let results = index.map((item) => ({
					id: item.id,
					text: item.text,
					score: cosineSimilarity(queryEmbedding, item.embedding),
					metadata: item.metadata,
				}));

				// Apply filters
				if (filter) {
					results = results.filter((item) => {
						for (const [key, value] of Object.entries(filter)) {
							if (item.metadata?.[key] !== value) {
								return false;
							}
						}
						return true;
					});
				}

				// Sort by score and take topK
				results = results.sort((a, b) => b.score - a.score).slice(0, topK);

				return {
					success: true,
					action,
					indexName,
					query,
					results,
					resultCount: results.length,
				};
			}

			case "delete": {
				if (!ids || ids.length === 0) {
					throw new Error("ids required for delete action");
				}

				const index = inMemoryVectorStore.get(indexName) || [];
				const newIndex = index.filter((item) => !ids.includes(item.id));
				inMemoryVectorStore.set(indexName, newIndex);

				return {
					success: true,
					action,
					indexName,
					deletedCount: index.length - newIndex.length,
				};
			}

			case "list": {
				const index = inMemoryVectorStore.get(indexName) || [];
				return {
					success: true,
					action,
					indexName,
					documentCount: index.length,
					documents: index.map((item) => ({
						id: item.id,
						text:
							item.text.slice(0, 200) + (item.text.length > 200 ? "..." : ""),
						metadata: item.metadata,
					})),
				};
			}

			default:
				throw new Error(`Unknown action: ${action}`);
		}
	},
};

export const ragTool: BuiltInTool = {
	description:
		"Retrieval-Augmented Generation pipeline - retrieves relevant context for LLM queries",
	inputSchema: z.object({
		query: z.string().describe("The user query to answer"),
		indexName: z.string().default("default").describe("Vector index to search"),
		maxChunks: z
			.number()
			.min(1)
			.max(50)
			.default(5)
			.describe("Maximum chunks to retrieve"),
		minScore: z
			.number()
			.min(0)
			.max(1)
			.default(0.3)
			.describe("Minimum similarity score (0-1)"),
		filter: z
			.record(z.unknown())
			.optional()
			.describe("Optional metadata filters"),
		format: z
			.enum(["text", "json", "context"])
			.default("context")
			.describe("Output format"),
	}),
	handler: async (input) => {
		const { query, indexName, maxChunks, minScore, filter, format } = input as {
			query: string;
			indexName: string;
			maxChunks: number;
			minScore: number;
			filter?: Record<string, unknown>;
			format: "text" | "json" | "context";
		};

		// Query the vector store
		const vectorResult = await vectorStoreTool.handler({
			action: "query",
			indexName,
			query,
			topK: maxChunks,
			filter,
		});

		const result = vectorResult as {
			success: boolean;
			results: Array<{
				id: string;
				text: string;
				score: number;
				metadata?: Record<string, unknown>;
			}>;
		};

		// Filter by minimum score
		const chunks = result.results.filter((item) => item.score >= minScore);

		// Format output
		switch (format) {
			case "text": {
				return {
					context: chunks.map((c) => c.text).join("\n\n"),
					chunkCount: chunks.length,
					query,
				};
			}

			case "json": {
				return {
					chunks: chunks.map((c) => ({
						id: c.id,
						text: c.text,
						score: c.score,
						metadata: c.metadata,
					})),
					chunkCount: chunks.length,
					query,
				};
			}

			case "context": {
				// Format for LLM context
				const contextText =
					chunks.length > 0
						? `Relevant context:\n${chunks
								.map(
									(c, i) =>
										`[${i + 1}] ${c.text.slice(0, 500)}${c.text.length > 500 ? "..." : ""} (relevance: ${(c.score * 100).toFixed(1)}%)`,
								)
								.join("\n\n")}`
						: "No relevant context found.";

				return {
					context: contextText,
					chunks: chunks.map((c) => ({
						id: c.id,
						text: c.text,
						score: c.score,
						metadata: c.metadata,
					})),
					chunkCount: chunks.length,
					query,
					sources: chunks.map((c) => c.id),
				};
			}
		}
	},
};

export const readFileTool: BuiltInTool = {
	description: "Read the contents of a file",
	inputSchema: z.object({
		path: z.string().describe("Path to the file to read"),
		encoding: z
			.enum(["utf8", "base64"])
			.default("utf8")
			.describe("File encoding"),
	}),
	handler: async (input) => {
		const { path: filePath, encoding } = input as {
			path: string;
			encoding: "utf8" | "base64";
		};

		const fs = await import("node:fs/promises");
		const content = await fs.readFile(filePath, { encoding });
		const stats = await fs.stat(filePath);

		return {
			content,
			path: filePath,
			size: stats.size,
			modified: stats.mtime.toISOString(),
		};
	},
};

export const readFileLinesTool: BuiltInTool = {
	description: "Read a specific range of lines from a file",
	inputSchema: z.object({
		path: z.string().describe("Path to the file to read"),
		start: z.number().min(1).describe("Starting line number (1-indexed)"),
		count: z.number().min(1).max(1000).describe("Number of lines to read"),
	}),
	handler: async (input) => {
		const {
			path: filePath,
			start,
			count,
		} = input as {
			path: string;
			start: number;
			count: number;
		};

		const fs = await import("node:fs");
		const content = fs.readFileSync(filePath, "utf8");
		const lines = content.split("\n");
		const startIndex = start - 1;
		const endIndex = Math.min(startIndex + count, lines.length);
		const selectedLines = lines.slice(startIndex, endIndex);

		return {
			lines: selectedLines,
			startLine: start,
			endLine: endIndex,
			totalLines: lines.length,
			path: filePath,
		};
	},
};

export const writeFileTool: BuiltInTool = {
	description: "Write or overwrite a file with content",
	inputSchema: z.object({
		path: z.string().describe("Path to the file to write"),
		content: z.string().describe("Content to write to the file"),
		encoding: z
			.enum(["utf8", "base64"])
			.default("utf8")
			.describe("File encoding"),
	}),
	handler: async (input) => {
		const {
			path: filePath,
			content,
			encoding,
		} = input as {
			path: string;
			content: string;
			encoding: "utf8" | "base64";
		};

		const fs = await import("node:fs/promises");
		const path = await import("node:path");

		// Ensure directory exists
		const dir = path.dirname(filePath);
		await fs.mkdir(dir, { recursive: true });

		await fs.writeFile(filePath, content, { encoding });
		const stats = await fs.stat(filePath);

		return {
			success: true,
			path: filePath,
			size: stats.size,
			modified: stats.mtime.toISOString(),
		};
	},
};

export const appendFileTool: BuiltInTool = {
	description: "Append content to a file, creating it if it doesn't exist",
	inputSchema: z.object({
		path: z.string().describe("Path to the file"),
		content: z.string().describe("Content to append"),
		encoding: z
			.enum(["utf8", "base64"])
			.default("utf8")
			.describe("File encoding"),
	}),
	handler: async (input) => {
		const {
			path: filePath,
			content,
			encoding,
		} = input as {
			path: string;
			content: string;
			encoding: "utf8" | "base64";
		};

		const fs = await import("node:fs/promises");
		const path = await import("node:path");

		// Ensure directory exists
		const dir = path.dirname(filePath);
		await fs.mkdir(dir, { recursive: true });

		const existed = await fs
			.access(filePath)
			.then(() => true)
			.catch(() => false);

		await fs.appendFile(filePath, content, { encoding });
		const stats = await fs.stat(filePath);

		return {
			success: true,
			path: filePath,
			created: !existed,
			size: stats.size,
			modified: stats.mtime.toISOString(),
		};
	},
};

export const listFilesTool: BuiltInTool = {
	description: "List files and directories at a given path",
	inputSchema: z.object({
		path: z.string().describe("Directory path to list"),
		recursive: z
			.boolean()
			.default(false)
			.describe("Whether to list recursively"),
	}),
	handler: async (input) => {
		const { path: dirPath, recursive } = input as {
			path: string;
			recursive: boolean;
		};

		const fs = await import("node:fs/promises");
		const path = await import("node:path");

		async function listDir(
			currentPath: string,
			isRecursive: boolean,
		): Promise<
			Array<{
				name: string;
				path: string;
				type: "file" | "directory";
				size?: number;
			}>
		> {
			const entries = await fs.readdir(currentPath, { withFileTypes: true });
			const results: Array<{
				name: string;
				path: string;
				type: "file" | "directory";
				size?: number;
			}> = [];

			for (const entry of entries) {
				const fullPath = path.join(currentPath, entry.name);
				if (entry.isDirectory()) {
					results.push({ name: entry.name, path: fullPath, type: "directory" });
					if (isRecursive) {
						const subEntries = await listDir(fullPath, true);
						results.push(...subEntries);
					}
				} else if (entry.isFile()) {
					const stats = await fs.stat(fullPath);
					results.push({
						name: entry.name,
						path: fullPath,
						type: "file",
						size: stats.size,
					});
				}
			}

			return results;
		}

		const files = await listDir(dirPath, recursive);
		return {
			path: dirPath,
			files,
			count: files.length,
		};
	},
};

export const searchFilesTool: BuiltInTool = {
	description: "Search for files by glob pattern",
	inputSchema: z.object({
		pattern: z
			.string()
			.describe("Glob pattern to match (e.g., '*.ts', 'src/**/*.js')"),
		dir: z.string().default(".").describe("Base directory to search from"),
	}),
	handler: async (input) => {
		const { pattern, dir } = input as { pattern: string; dir: string };

		const glob = await import("fast-glob");
		const matches = await glob.default(pattern, {
			cwd: dir,
			dot: true,
		});

		return {
			pattern,
			dir,
			matches,
			count: matches.length,
		};
	},
};

export const searchContentTool: BuiltInTool = {
	description: "Search for string or regex pattern within file contents",
	inputSchema: z.object({
		query: z.string().describe("Search string or regex pattern"),
		dir: z.string().default(".").describe("Base directory to search"),
		pattern: z
			.string()
			.optional()
			.describe("File glob pattern to filter (e.g., '*.ts')"),
		isRegex: z
			.boolean()
			.default(false)
			.describe("Whether query is a regex pattern"),
	}),
	handler: async (input) => {
		const { query, dir, pattern, isRegex } = input as {
			query: string;
			dir: string;
			pattern?: string;
			isRegex: boolean;
		};

		const fs = await import("node:fs/promises");
		const path = await import("node:path");
		const glob = await import("fast-glob");

		const searchPattern = pattern || "**/*";
		const files = await glob.default(searchPattern, {
			cwd: dir,
			dot: true,
			absolute: true,
		});

		const searchRegex = isRegex
			? new RegExp(query, "g")
			: new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
		const results: Array<{
			file: string;
			line: number;
			content: string;
			matches: string[];
		}> = [];

		for (const filePath of files) {
			try {
				const content = await fs.readFile(filePath, "utf8");
				const lines = content.split("\n");

				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					const matches_found = line.match(searchRegex);
					if (matches_found) {
						results.push({
							file: filePath,
							line: i + 1,
							content: line.trim(),
							matches: matches_found,
						});
					}
				}
			} catch {
				// Skip files that can't be read as text
			}
		}

		return {
			query,
			dir,
			pattern,
			isRegex,
			results,
			count: results.length,
		};
	},
};

export const runCommandTool: BuiltInTool = {
	description: "Execute a shell command safely",
	inputSchema: z.object({
		command: z.string().describe("The shell command to execute"),
		cwd: z.string().optional().describe("Working directory for the command"),
		timeout: z
			.number()
			.min(1)
			.max(300000)
			.default(30000)
			.describe("Timeout in milliseconds"),
	}),
	handler: async (input) => {
		const { command, cwd, timeout } = input as {
			command: string;
			cwd?: string;
			timeout: number;
		};

		const { exec } = await import("node:child_process");
		const util = await import("node:util");
		const execPromise = util.promisify(exec);

		try {
			const { stdout, stderr } = await execPromise(command, {
				cwd,
				timeout,
				maxBuffer: 10 * 1024 * 1024, // 10MB buffer
			});

			return {
				success: true,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				command,
			};
		} catch (error) {
			const execError = error as {
				stdout?: string;
				stderr?: string;
				code?: number;
				signal?: string;
			};
			return {
				success: false,
				stdout: execError.stdout?.trim() || "",
				stderr: execError.stderr?.trim() || "",
				exitCode: execError.code,
				signal: execError.signal,
				command,
				error: "Command failed",
			};
		}
	},
};

export const fetchTool: BuiltInTool = {
	description: "Fetch content from a URL via GET request (simple HTTP fetch)",
	inputSchema: z.object({
		url: z.string().url().describe("The URL to fetch"),
		headers: z.record(z.string()).optional().describe("Optional HTTP headers"),
	}),
	handler: async (input) => {
		// Reuse httpTool for GET requests
		const { url, headers } = input as {
			url: string;
			headers?: Record<string, string>;
		};

		const result = await httpTool.handler({
			url,
			method: "GET",
			headers,
			timeout: 30000,
		});

		const httpResult = result as {
			status: number;
			statusText: string;
			body: unknown;
			headers: Record<string, string>;
		};

		// Format response for simpler fetch API
		const contentType = httpResult.headers["content-type"] || "";
		const content =
			typeof httpResult.body === "string"
				? httpResult.body
				: JSON.stringify(httpResult.body);

		return {
			success: httpResult.status >= 200 && httpResult.status < 300,
			status: httpResult.status,
			statusText: httpResult.statusText,
			content,
			contentType,
			url,
		};
	},
};

export const gitTool: BuiltInTool = {
	description:
		"Execute git operations (clone, status, commit, push, pull, checkout)",
	inputSchema: z.object({
		op: z
			.enum(["clone", "status", "commit", "push", "pull", "checkout"])
			.describe("Git operation to perform"),
		url: z.string().optional().describe("Repository URL (for clone)"),
		path: z
			.string()
			.default(".")
			.describe("Path to repository or clone destination"),
		branch: z.string().optional().describe("Branch name"),
		create: z
			.boolean()
			.default(false)
			.describe("Create branch if it doesn't exist"),
		message: z.string().optional().describe("Commit message"),
		all: z.boolean().default(false).describe("Stage all changes before commit"),
		remote: z.string().default("origin").describe("Remote name"),
		force: z.boolean().default(false).describe("Force push"),
		rebase: z.boolean().default(false).describe("Rebase instead of merge"),
		depth: z
			.number()
			.min(1)
			.optional()
			.describe("Clone depth for shallow clones"),
	}),
	handler: async (input) => {
		const {
			op,
			url,
			path: repoPath,
			branch,
			create,
			message,
			all,
			remote,
			force,
			rebase,
			depth,
		} = input as {
			op: "clone" | "status" | "commit" | "push" | "pull" | "checkout";
			url?: string;
			path: string;
			branch?: string;
			create?: boolean;
			message?: string;
			all?: boolean;
			remote?: string;
			force?: boolean;
			rebase?: boolean;
			depth?: number;
		};

		const { exec } = await import("node:child_process");
		const util = await import("node:util");
		const execPromise = util.promisify(exec);

		switch (op) {
			case "clone": {
				if (!url) throw new Error("url is required for clone operation");
				let command = "git clone";
				if (branch) command += ` -b ${branch}`;
				if (depth) command += ` --depth ${depth}`;
				command += ` ${url}`;
				if (repoPath && repoPath !== ".") command += ` ${repoPath}`;

				const { stdout, stderr } = await execPromise(command);
				return {
					success: true,
					op,
					url,
					path:
						repoPath ||
						url
							.split("/")
							.pop()
							?.replace(/\.git$/, ""),
					branch,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
				};
			}

			case "status": {
				const { stdout } = await execPromise("git status --porcelain", {
					cwd: repoPath,
				});
				const { stdout: branchOutput } = await execPromise(
					"git branch --show-current",
					{ cwd: repoPath },
				);

				const files = stdout
					.trim()
					.split("\n")
					.filter(Boolean)
					.map((line) => ({
						status: line.substring(0, 2).trim(),
						path: line.substring(3),
					}));

				const staged = files.filter(
					(f) =>
						f.status.startsWith("A") ||
						f.status.startsWith("M") ||
						f.status.startsWith("D"),
				);
				const unstaged = files.filter(
					(f) =>
						f.status.endsWith("M") ||
						f.status.endsWith("D") ||
						f.status.endsWith("?"),
				);

				return {
					success: true,
					op,
					branch: branchOutput.trim(),
					clean: files.length === 0,
					files,
					staged: staged.length,
					unstaged: unstaged.length,
					path: repoPath,
				};
			}

			case "commit": {
				if (!message)
					throw new Error("message is required for commit operation");
				if (all) {
					await execPromise("git add -A", { cwd: repoPath });
				}

				const { stdout, stderr } = await execPromise(
					`git commit -m "${message.replace(/"/g, '\\"')}"`,
					{ cwd: repoPath },
				);

				const { stdout: hashOutput } = await execPromise("git rev-parse HEAD", {
					cwd: repoPath,
				});

				return {
					success: true,
					op,
					commitHash: hashOutput.trim(),
					message,
					path: repoPath,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
				};
			}

			case "push": {
				let command = `git push ${remote || "origin"}`;
				if (branch) command += ` ${branch}`;
				if (force) command += " --force";

				const { stdout, stderr } = await execPromise(command, {
					cwd: repoPath,
				});
				return {
					success: true,
					op,
					remote: remote || "origin",
					branch,
					path: repoPath,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
				};
			}

			case "pull": {
				let command = `git pull ${remote || "origin"}`;
				if (branch) command += ` ${branch}`;
				if (rebase) command += " --rebase";

				const { stdout, stderr } = await execPromise(command, {
					cwd: repoPath,
				});
				return {
					success: true,
					op,
					remote: remote || "origin",
					branch,
					path: repoPath,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
				};
			}

			case "checkout": {
				if (!branch)
					throw new Error("branch is required for checkout operation");
				let command = "git checkout";
				if (create) command += " -b";
				command += ` ${branch}`;

				const { stdout, stderr } = await execPromise(command, {
					cwd: repoPath,
				});
				return {
					success: true,
					op,
					branch,
					created: create,
					path: repoPath,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
				};
			}

			default:
				throw new Error(`Unknown git operation: ${op}`);
		}
	},
};

export const builtInTools: Record<string, BuiltInTool> = {
	http: httpTool,
	calculator: calculatorTool,
	memory: memoryTool,
	vectorStore: vectorStoreTool,
	rag: ragTool,
	readFile: readFileTool,
	readFileLines: readFileLinesTool,
	writeFile: writeFileTool,
	appendFile: appendFileTool,
	listFiles: listFilesTool,
	searchFiles: searchFilesTool,
	searchContent: searchContentTool,
	runCommand: runCommandTool,
	fetch: fetchTool,
	git: gitTool,
};

export function createToolFromBuiltIn(name: string, tool: BuiltInTool): Tool {
	return {
		id: name,
		description: tool.description,
		inputSchema: tool.inputSchema,
		execute: async (input: unknown) => tool.handler(input),
	} as unknown as Tool;
}

export function getBuiltInTool(name: string): Tool | undefined {
	const tool = builtInTools[name];
	if (!tool) return undefined;
	return createToolFromBuiltIn(name, tool);
}

export function listBuiltInTools(): string[] {
	return Object.keys(builtInTools);
}
