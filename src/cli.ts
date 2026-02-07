#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { getBuiltInActionSchema, listBuiltInActions } from "./actions/builtins";
import { compileWorkflowDeclarative } from "./compiler/declarative";
import { parseWorkflowYaml } from "./parser";
import { getWorkflowSpecJsonSchema } from "./spec";
import type { WorkflowSpec } from "./spec";
import { listBuiltInTools } from "./tools/builtins";
import { validateWorkflowSchemas } from "./validation";

export type LoadResult = {
	spec: WorkflowSpec;
	yamlText: string;
};

export function printHelp() {
	console.log(`maestro - declarative YAML workflow orchestrator

Usage:
  maestro run --file <path> [--input <json>] [--agentsDir <path>]
  maestro compile --file <path> [--agentsDir <path>]
  maestro tools list
  maestro actions list
  maestro schema [--pretty]

Options:
  --file       Path to YAML workflow
  --input      JSON string passed as inputData (run only)
  --agentsDir  Directory containing agent markdown files (default: ./agents)
  --pretty     Pretty-print JSON output
  --help       Show help

Quick Start:
  1. Create agents/ directory with .md agent definitions
  2. Create workflow.yaml defining your workflow
  3. Run: maestro run --file workflow.yaml --input '{"message":"hello"}'

Examples:
  maestro run --file workflow.yaml
  maestro compile --file workflow.yaml
  maestro tools list
`);
}

export async function loadWorkflow(filePath: string): Promise<LoadResult> {
	const yamlText = await readFile(filePath, "utf-8");
	const spec = parseWorkflowYaml(yamlText);
	return { spec, yamlText };
}

export function parseJsonInput(input: string | undefined): unknown {
	if (!input) return undefined;
	try {
		return JSON.parse(input);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid JSON for --input: ${message}`);
	}
}

export async function commandCompile(
	filePath: string | undefined,
	agentsDir?: string,
) {
	if (!filePath) {
		throw new Error("Missing --file path");
	}

	const { workflow, warnings } = await compileWorkflowDeclarative({
		workflowPath: filePath,
		agentsDir,
	});

	if (warnings.length > 0) {
		const message = warnings
			.map((issue) => `${issue.path}: ${issue.message}`)
			.join("\n");
		console.warn(`Schema validation warnings:\n${message}`);
	}
	console.log("Workflow compiled successfully.");
}

export async function commandRun(
	filePath: string | undefined,
	inputText: string | undefined,
	agentsDir?: string,
) {
	if (!filePath) {
		throw new Error("Missing --file path");
	}

	const { workflow, warnings } = await compileWorkflowDeclarative({
		workflowPath: filePath,
		agentsDir,
	});

	if (warnings.length > 0) {
		const message = warnings
			.map((issue) => `${issue.path}: ${issue.message}`)
			.join("\n");
		console.warn(`Schema validation warnings:\n${message}`);
	}

	const run = await workflow.createRun();
	const inputData = parseJsonInput(inputText) ?? {};
	const result = await run.start({ inputData });
	console.log(JSON.stringify(result, null, 2));
}

export function commandToolsList() {
	const tools = listBuiltInTools();
	console.log("Built-in Tools:");
	console.log("===============");
	for (const tool of tools) {
		console.log(`  - ${tool}`);
	}
	console.log(`\nTotal: ${tools.length} tools`);
}

export function commandActionsList() {
	const actions = listBuiltInActions();
	console.log("Built-in Actions:");
	console.log("=================");
	for (const action of actions) {
		const schema = getBuiltInActionSchema(action);
		console.log(`  - ${action}`);
		if (schema) {
			console.log(
				`    Input schema: ${JSON.stringify((schema as { _def?: { description?: string } })._def?.description ?? "object")}`,
			);
		}
	}
	console.log(`\nTotal: ${actions.length} actions`);
}

export function commandSchema(pretty: boolean | undefined) {
	const schema = getWorkflowSpecJsonSchema();
	const output = JSON.stringify(schema, null, pretty ? 2 : 0);
	console.log(output);
}

export async function main() {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			file: { type: "string" },
			input: { type: "string" },
			agentsDir: { type: "string" },
			help: { type: "boolean" },
			pretty: { type: "boolean" },
		},
	});

	if (values.help || positionals.length === 0) {
		printHelp();
		return;
	}

	const command = positionals[0];
	const subcommand = positionals[1];

	if (command === "compile") {
		await commandCompile(values.file, values.agentsDir);
		return;
	}

	if (command === "run") {
		await commandRun(values.file, values.input, values.agentsDir);
		return;
	}

	if (command === "tools" && subcommand === "list") {
		commandToolsList();
		return;
	}

	if (command === "actions" && subcommand === "list") {
		commandActionsList();
		return;
	}

	if (command === "schema") {
		commandSchema(values.pretty);
		return;
	}

	throw new Error(
		`Unknown command: ${command}${subcommand ? ` ${subcommand}` : ""}`,
	);
}

const invokedPath = process.argv[1];
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
	main().catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`maestro error: ${message}`);
		process.exitCode = 1;
	});
}
