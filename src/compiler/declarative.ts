import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Workflow } from "@mastra/core/workflows";
import { type AgentConfig, loadAgents } from "../agents/loader";
import { compileWorkflow as compileWorkflowInternal } from "../compiler";
import { createMastraInstance, loadEnv } from "../mastra/factory";
import { parseWorkflowYaml } from "../parser";
import { createInternalRegistry } from "../registry/internal";

export interface DeclarativeCompileOptions {
	workflowPath: string;
	agentsDir?: string;
	env?: Record<string, string>;
}

export interface CompiledWorkflowResult {
	workflow: Workflow;
	warnings: Array<{
		path: string;
		message: string;
		severity: "warning" | "error";
	}>;
	metadata: {
		compiledAt: string;
		workflowId: string;
		agents: AgentConfig[];
	};
}

export async function compileWorkflowDeclarative(
	options: DeclarativeCompileOptions,
): Promise<CompiledWorkflowResult> {
	const {
		workflowPath,
		agentsDir: explicitAgentsDir,
		env: explicitEnv,
	} = options;

	// 1. Load and parse workflow YAML
	const yaml = await readFile(workflowPath, "utf8");
	const spec = parseWorkflowYaml(yaml);

	// 2. Load environment variables
	const workflowDir = dirname(workflowPath);
	const env = explicitEnv ?? loadEnv(workflowDir);

	// 3. Determine agents directory
	const agentsDir =
		explicitAgentsDir ?? spec.config?.agentsDir ?? join(workflowDir, "agents");

	// 4. Load agents from markdown/YAML files
	const agents = await loadAgents(agentsDir);

	// 5. Create Mastra instance with loaded agents and full configuration
	const mastra = await createMastraInstance({
		agents,
		env,
		enabledTools: spec.config?.enabledTools,
		// Advanced configurations
		memory: spec.config?.memory,
		storage: spec.config?.storage,
		mcpServers: spec.config?.mcpServers,
		customTools: spec.tools,
		persistState: spec.config?.persistState,
		globalEvals: spec.evals,
	});

	// 6. Create internal registry from Mastra and built-ins
	const registry = createInternalRegistry(mastra);

	// 7. Compile to Mastra workflow
	const { workflow, warnings } = compileWorkflowInternal(spec, registry);

	return {
		workflow,
		warnings,
		metadata: {
			compiledAt: new Date().toISOString(),
			workflowId: spec.id,
			agents,
		},
	};
}
