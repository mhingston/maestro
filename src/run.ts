import type { RequestContext } from "@mastra/core/request-context";
import { compileWorkflow } from "./compiler";
import { compileWorkflowDeclarative } from "./compiler/declarative";
import { parseWorkflowYaml } from "./parser";
import type { HandlerRegistry } from "./registry";

// Declarative mode - file-based (preferred)
export async function runYamlWorkflow({
	workflowPath,
	inputData,
	requestContext,
	initialState,
	agentsDir,
	env,
}: {
	workflowPath: string;
	inputData: unknown;
	requestContext?: RequestContext;
	initialState?: Record<string, unknown>;
	agentsDir?: string;
	env?: Record<string, string>;
}) {
	const { workflow } = await compileWorkflowDeclarative({
		workflowPath,
		agentsDir,
		env,
	});
	const run = await workflow.createRun();
	return run.start({ inputData, requestContext, initialState });
}

// Programmatic mode - for testing with inline YAML
// This is intentionally undocumented and for internal/testing use only
export async function runWorkflowFromString({
	yaml,
	registry,
	inputData,
	requestContext,
	initialState,
}: {
	yaml: string;
	registry: HandlerRegistry;
	inputData: unknown;
	requestContext?: RequestContext;
	initialState?: Record<string, unknown>;
}) {
	const spec = parseWorkflowYaml(yaml);
	const { workflow } = compileWorkflow(spec, registry);
	const run = await workflow.createRun();
	return run.start({ inputData, requestContext, initialState });
}
