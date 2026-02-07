import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compileWorkflowDeclarative } from "../../compiler/declarative";
import type { WorkflowSpec } from "../../spec";

export interface TestWorkflowConfig {
	spec: WorkflowSpec;
	agents?: Array<{
		name: string;
		content: string;
	}>;
}

export async function createTestWorkflow(
	baseDir: string,
	config: TestWorkflowConfig,
): Promise<{ workflowPath: string; cleanup: () => Promise<void> }> {
	// Create directory structure
	const agentsDir = join(baseDir, "agents");
	await mkdir(agentsDir, { recursive: true });

	// Write agent files
	if (config.agents) {
		for (const agent of config.agents) {
			const agentPath = join(agentsDir, `${agent.name}.md`);
			await writeFile(agentPath, agent.content, "utf8");
		}
	}

	// Write workflow file
	const workflowPath = join(baseDir, "workflow.yaml");
	const yamlContent = specToYaml(config.spec);
	await writeFile(workflowPath, yamlContent, "utf8");

	// Cleanup function
	const cleanup = async () => {
		await rm(baseDir, { recursive: true, force: true });
	};

	return { workflowPath, cleanup };
}

export async function compileTestWorkflow(
	baseDir: string,
	config: TestWorkflowConfig,
) {
	const { workflowPath, cleanup } = await createTestWorkflow(baseDir, config);
	const result = await compileWorkflowDeclarative({ workflowPath });
	return { ...result, cleanup };
}

function specToYaml(spec: WorkflowSpec): string {
	// Simple YAML serialization - in production use a proper YAML library
	const lines: string[] = [];
	lines.push(`id: ${spec.id}`);

	if (spec.name) {
		lines.push(`name: ${spec.name}`);
	}

	lines.push("inputSchema:");
	lines.push(indent(jsonToYaml(spec.inputSchema)));

	lines.push("outputSchema:");
	lines.push(indent(jsonToYaml(spec.outputSchema)));

	lines.push("steps:");
	for (const step of spec.steps) {
		lines.push(indent(stepToYaml(step)));
	}

	return lines.join("\n");
}

function stepToYaml(step: unknown): string {
	const s = step as Record<string, unknown>;
	const lines: string[] = [];

	lines.push(`- type: ${s.type}`);
	if (s.id) lines.push(`  id: ${s.id}`);
	if (s.handler) lines.push(`  handler: ${s.handler}`);
	if (s.agent) lines.push(`  agent: ${s.agent}`);
	if (s.action) lines.push(`  action: ${s.action}`);

	if (s.inputSchema) {
		lines.push("  inputSchema:");
		lines.push(indent(jsonToYaml(s.inputSchema), 2));
	}

	if (s.outputSchema) {
		lines.push("  outputSchema:");
		lines.push(indent(jsonToYaml(s.outputSchema), 2));
	}

	if (s.params) {
		lines.push("  params:");
		lines.push(indent(jsonToYaml(s.params), 2));
	}

	if (s.input) {
		lines.push(`  input: ${s.input}`);
	}

	if (s.branches) {
		lines.push("  branches:");
		// Handle branches recursively if needed
	}

	if (s.steps && Array.isArray(s.steps)) {
		lines.push("  steps:");
		for (const subStep of s.steps) {
			lines.push(indent(stepToYaml(subStep), 2));
		}
	}

	return lines.join("\n");
}

function jsonToYaml(obj: unknown, depth = 0): string {
	if (obj === null) return "null";
	if (typeof obj === "string") return obj;
	if (typeof obj === "number") return String(obj);
	if (typeof obj === "boolean") return String(obj);

	if (Array.isArray(obj)) {
		if (obj.length === 0) return "[]";
		return obj.map((item) => `- ${jsonToYaml(item, depth + 1)}`).join("\n");
	}

	if (typeof obj === "object") {
		const entries = Object.entries(obj as Record<string, unknown>);
		if (entries.length === 0) return "{}";
		return entries
			.map(([key, value]) => {
				const val = jsonToYaml(value, depth + 1);
				if (val.includes("\n")) {
					return `${key}:\n${indent(val)}`;
				}
				return `${key}: ${val}`;
			})
			.join("\n");
	}

	return String(obj);
}

function indent(str: string, spaces = 2): string {
	const prefix = " ".repeat(spaces);
	return str
		.split("\n")
		.map((line) => (line.trim() ? prefix + line : line))
		.join("\n");
}
