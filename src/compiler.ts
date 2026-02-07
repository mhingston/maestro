import {
	cloneWorkflow,
	createStep,
	createWorkflow,
} from "@mastra/core/workflows";
import type { ConditionFunctionParams, Workflow } from "@mastra/core/workflows";
import type { Step } from "@mastra/core/workflows";
import { convertSchemaToZod } from "@mastra/schema-compat";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { resolveHandler } from "./registry";
import type { HandlerRegistry } from "./registry";
import type { StepSpec, WorkflowSpec } from "./spec";
import { resolveTemplates } from "./templating";
import { validateWorkflowSchemas } from "./validation";

type ConditionContext = ConditionFunctionParams<
	unknown,
	unknown,
	unknown,
	unknown,
	unknown,
	unknown,
	unknown
>;

import type { MappingSource } from "./mappings";
import type { HandlerContext } from "./registry";

type MapConfig = Parameters<Workflow["map"]>[0];

function buildMapping(mappings: Record<string, MappingSource>): MapConfig {
	const result: Record<string, unknown> = {};
	for (const [key, mapping] of Object.entries(mappings)) {
		if ("value" in mapping) {
			result[key] = { value: mapping.value };
			continue;
		}

		if (mapping.from === "requestContext") {
			result[key] = {
				requestContextPath: mapping.path,
				schema: toZod({}),
			};
			continue;
		}

		if (mapping.from === "init") {
			result[key] = { initData: true, path: mapping.path };
			continue;
		}

		result[key] = {
			step: mapping.stepId,
			path: mapping.path,
		};
	}
	return result as MapConfig;
}

function toZod(schema: Record<string, unknown> | unknown[]): ZodTypeAny {
	return convertSchemaToZod(
		schema as Record<string, unknown> | unknown[],
	) as ZodTypeAny;
}

function buildStep(spec: StepSpec, registry: HandlerRegistry): Step {
	if (
		spec.type === "sleep" ||
		spec.type === "sleepUntil" ||
		spec.type === "map" ||
		spec.type === "humanInput" ||
		spec.type === "bail"
	) {
		throw new Error(`buildStep cannot handle control step type: ${spec.type}`);
	}

	if (spec.type === "workflow") {
		const nested = registry.workflows?.[spec.workflowId];
		if (!nested) {
			throw new Error(`Missing nested workflow: ${spec.workflowId}`);
		}
		return nested as Step;
	}

	// Derive handler from declarative agent/action/tool fields
	let handlerId: string;

	if (spec.type === "agent") {
		// Declarative: type: agent, agent: "support" -> handler: "agent.support"
		handlerId = `agent.${spec.agent}`;
	} else if (spec.type === "step") {
		// Declarative: type: step, action: "sendNotification" -> handler: "handlers.sendNotification"
		if (!spec.action) {
			throw new Error("Missing handler/agent/action/tool for step");
		}
		handlerId = `handlers.${spec.action}`;
	} else if (spec.type === "tool") {
		// Declarative: type: tool, tool: "calculator" -> handler: "tool.calculator"
		handlerId = `tool.${spec.tool}`;
	} else if (spec.type === "memory") {
		handlerId = `memory.${spec.handler}`;
	} else if (spec.type === "vectorStore") {
		handlerId = `vectorStore.${spec.handler}`;
	} else if (spec.type === "rag") {
		handlerId = `rag.${spec.handler}`;
	} else if (spec.type === "http") {
		handlerId = `http.${spec.handler}`;
	} else if (spec.type === "logger") {
		handlerId = `logger.${spec.handler}`;
	} else if (spec.type === "requestContext") {
		handlerId = `requestContext.${spec.handler}`;
	} else if (spec.type === "mcp") {
		// MCP steps need special handling
		handlerId = `mcp.${spec.server}.${spec.tool}`;
	} else if (spec.type === "network") {
		// Network steps use the network handler
		handlerId = `network.${spec.network}`;
	} else if (
		spec.type === "tts" ||
		spec.type === "listen" ||
		spec.type === "documentChunk" ||
		spec.type === "documentMetadata" ||
		spec.type === "documentTransform"
	) {
		// These steps use handlers from the registry based on type
		handlerId = `${spec.type}.${spec.id}`;
	} else if (spec.type === "graphRag" || spec.type === "graphRagQuery") {
		// GraphRAG steps
		handlerId = `${spec.type}.${spec.id}`;
	} else if (spec.type === "evals") {
		// Evals steps
		handlerId = `evals.${spec.scorer}`;
	} else if (spec.type === "suspend" || spec.type === "resume") {
		// Suspend/resume steps are control flow - handled in applySteps
		throw new Error(`buildStep cannot handle control step type: ${spec.type}`);
	} else {
		throw new Error(`Unknown step type: ${(spec as { type?: string }).type}`);
	}

	const handler = resolveHandler(registry, handlerId);

	return createStep({
		id: spec.id,
		description: "description" in spec ? spec.description : undefined,
		inputSchema: toZod(spec.inputSchema),
		outputSchema: toZod(spec.outputSchema),
		retries: "retries" in spec ? spec.retries : undefined,
		execute: async (ctx: HandlerContext) => {
			const stepResults = new Proxy(
				{},
				{
					get: (_target, prop: string) => {
						const result = ctx.getStepResult(prop) as
							| Record<string, unknown>
							| undefined;
						if (!result || typeof result !== "object") return result;
						if ("output" in result) {
							return (result as Record<string, unknown>).output;
						}
						return result;
					},
				},
			) as Record<string, unknown>;
			const stepResultsWithMeta = new Proxy(stepResults, {
				get: (target, prop: string) => {
					if (prop === "_raw") {
						return new Proxy(
							{},
							{
								get: (_rawTarget, rawProp: string) =>
									ctx.getStepResult(rawProp),
							},
						);
					}
					return (target as Record<string, unknown>)[prop];
				},
			}) as Record<string, unknown>;

			const resolvedParams = resolveTemplates(spec.params ?? {}, {
				inputData: ctx.inputData,
				steps: stepResultsWithMeta,
				initData: ctx.getInitData(),
				requestContext: (ctx.requestContext?.all ?? {}) as Record<
					string,
					unknown
				>,
			});

			return handler(
				{
					mastra: ctx.mastra,
					requestContext: ctx.requestContext,
					inputData: ctx.inputData,
					getInitData: () => ctx.getInitData(),
					getStepResult: (stepId: string) => ctx.getStepResult(stepId),
				},
				resolvedParams as Record<string, unknown> | undefined,
			);
		},
	});
}

function isSchemaStep(step: StepSpec): step is Extract<
	StepSpec,
	{
		inputSchema: Record<string, unknown> | unknown[];
		outputSchema: Record<string, unknown> | unknown[];
	}
> {
	return "inputSchema" in step && "outputSchema" in step;
}

function deriveWorkflowSchemas(steps: StepSpec[]) {
	const inputStep = steps.find(isSchemaStep);
	const outputStep = [...steps].reverse().find(isSchemaStep);

	return {
		inputSchema: inputStep?.inputSchema ?? {},
		outputSchema: outputStep?.outputSchema ?? {},
	} as {
		inputSchema: Record<string, unknown> | unknown[];
		outputSchema: Record<string, unknown> | unknown[];
	};
}

function buildBranchWorkflow(
	parentId: string,
	branchIndex: number,
	steps: StepSpec[],
	registry: HandlerRegistry,
) {
	const schemas = deriveWorkflowSchemas(steps);
	const workflow = createWorkflow({
		id: `${parentId}.branch.${branchIndex}`,
		inputSchema: toZod(schemas.inputSchema),
		outputSchema: toZod(schemas.outputSchema),
	});

	const built = applySteps(workflow as Workflow, steps, registry);
	return built.commit();
}

function applySteps(
	workflow: Workflow,
	steps: StepSpec[],
	registry: HandlerRegistry,
): Workflow {
	let current = workflow;

	for (const step of steps) {
		if (
			step.type === "step" ||
			step.type === "agent" ||
			step.type === "tool" ||
			step.type === "network" ||
			step.type === "tts" ||
			step.type === "listen" ||
			step.type === "documentChunk" ||
			step.type === "documentMetadata" ||
			step.type === "documentTransform" ||
			step.type === "graphRag" ||
			step.type === "graphRagQuery" ||
			step.type === "evals" ||
			step.type === "memory" ||
			step.type === "vectorStore" ||
			step.type === "rag" ||
			step.type === "http" ||
			step.type === "logger" ||
			step.type === "requestContext"
		) {
			const built = buildStep(step, registry);
			current = current.then(built) as Workflow;
			continue;
		}

		if (step.type === "workflow") {
			const nested = registry.workflows?.[step.workflowId];
			if (!nested) {
				throw new Error(`Missing nested workflow: ${step.workflowId}`);
			}
			const nestedWorkflow = cloneWorkflow(nested, {
				id: `${workflow.id}.${nested.id}`,
			});
			let nestedStep = nestedWorkflow as Step;
			if (step.inputMapping) {
				const mappingWorkflow = createWorkflow({
					id: `${workflow.id}.${nested.id}.mapping`,
					inputSchema: workflow.inputSchema,
					outputSchema: workflow.inputSchema,
				});
				const mappingConfig = buildMapping(
					step.inputMapping as Record<string, MappingSource>,
				);
				const mapped = mappingWorkflow
					.map(mappingConfig)
					.then(nestedStep)
					.commit();
				nestedStep = mapped as Step;
			}
			current = current.then(nestedStep) as Workflow;
			continue;
		}

		if (step.type === "map") {
			const mappingConfig = buildMapping(
				step.mappings as Record<string, MappingSource>,
			);
			current = current.map(mappingConfig, { id: step.id }) as Workflow;
			continue;
		}

		if (step.type === "sleep") {
			current = current.sleep(step.ms) as Workflow;
			continue;
		}

		if (step.type === "sleepUntil") {
			current = current.sleepUntil(new Date(step.date)) as Workflow;
			continue;
		}

		if (step.type === "humanInput") {
			// Create a step that suspends for human input
			const humanInputStep = createStep({
				id: step.id || `humanInput.${Date.now()}`,
				inputSchema: z.any(),
				outputSchema: z.object({
					answer: z.any(),
					requestId: z.string(),
				}),
				execute: async ({ suspend, resumeData }) => {
					const crypto = await import("node:crypto");
					const requestId = crypto.randomUUID();

					// If we have resume data, the human has already responded
					if (resumeData) {
						return {
							answer: resumeData,
							requestId:
								(resumeData as { requestId?: string })?.requestId || requestId,
						};
					}

					// Suspend the workflow with the prompt metadata
					await suspend({
						requestId,
						prompt: step.prompt,
						inputType: step.inputType,
						options: step.options,
						timeout: step.timeout,
						status: "waiting_for_human_input",
					});

					// This will be populated when the workflow is resumed
					return { answer: undefined, requestId };
				},
			});

			current = current.then(humanInputStep as Step) as Workflow;
			continue;
		}

		if (step.type === "bail") {
			// Create a step that can bail (gracefully terminate) the workflow
			const bailStep = createStep({
				id: step.id || `bail.${Date.now()}`,
				inputSchema: z.any(),
				outputSchema: z.object({
					bailed: z.boolean(),
					payload: z.record(z.unknown()).nullable(),
				}),
				execute: async ({ inputData, bail }) => {
					// Get the bail step properties from closure
					const bailWhen = (step as { when?: string }).when;
					const bailPayload = (step as { payload: Record<string, unknown> })
						.payload;

					// Evaluate the condition if provided
					let shouldBail = true;
					if (bailWhen) {
						const conditionResult = resolveTemplates(
							{ condition: bailWhen },
							{
								inputData,
								steps: {},
								initData: {},
								requestContext: {},
							},
						);
						shouldBail = (conditionResult as { condition: boolean }).condition;
					}

					if (shouldBail) {
						// Resolve template expressions in the payload
						const resolvedPayload = resolveTemplates(bailPayload, {
							inputData: inputData as Record<string, unknown>,
							steps: {},
							initData: {},
							requestContext: {},
						});

						// Bail with the payload
						return bail(resolvedPayload);
					}

					// Continue execution (condition not met)
					return { bailed: false, payload: null };
				},
			});

			current = current.then(bailStep as Step) as Workflow;
			continue;
		}

		if (step.type === "suspend") {
			// Create a step that suspends the workflow for external input/approval
			const suspendStep = createStep({
				id: step.id || `suspend.${Date.now()}`,
				inputSchema: z.any(),
				outputSchema: z.object({
					resumed: z.boolean(),
					data: z.record(z.unknown()).optional(),
					suspendId: z.string(),
				}),
				execute: async ({ suspend, resumeData }) => {
					const crypto = await import("node:crypto");
					const suspendId = crypto.randomUUID();

					// If we have resume data, the workflow has been resumed
					if (resumeData) {
						return {
							resumed: true,
							data: resumeData as Record<string, unknown>,
							suspendId,
						};
					}

					// Suspend the workflow with metadata
					await suspend({
						suspendId,
						prompt: step.prompt,
						waitFor: step.waitFor,
						timeout: step.timeout,
						resumeSchema: step.resumeSchema,
						status: "suspended",
						timestamp: new Date().toISOString(),
					});

					return { resumed: false, suspendId };
				},
			});

			current = current.then(suspendStep as Step) as Workflow;
			continue;
		}

		if (step.type === "resume") {
			// Resume steps are typically handled externally
			// This step validates the resume data
			const resumeStep = createStep({
				id: step.id || `resume.${Date.now()}`,
				inputSchema: z.any(),
				outputSchema: z.object({
					resumed: z.boolean(),
					data: z.record(z.unknown()),
				}),
				execute: async ({ inputData }) => {
					const resumeData =
						(inputData as { data?: Record<string, unknown> })?.data ||
						step.data;
					return {
						resumed: true,
						data: resumeData,
					};
				},
			});

			current = current.then(resumeStep as Step) as Workflow;
			continue;
		}

		if (step.type === "parallel") {
			const builtSteps = step.steps.map((s: StepSpec) =>
				buildStep(s, registry),
			);
			current = current.parallel(builtSteps as Step[]) as Workflow;
			continue;
		}

		if (step.type === "branch") {
			type BranchEntry = [(ctx: ConditionContext) => Promise<boolean>, Step];
			const branches: BranchEntry[] = step.branches.map(
				(branch: (typeof step.branches)[number], index: number) => {
					const condHandler = resolveHandler(registry, branch.when.handler);
					const condFn = async (ctx: ConditionContext) => {
						const resolvedParams = resolveTemplates(branch.when.params, {
							inputData: ctx.inputData,
							steps: new Proxy(
								{},
								{
									get: (_target, prop: string) => ctx.getStepResult(prop),
								},
							) as Record<string, unknown>,
							initData: ctx.getInitData(),
							requestContext: (ctx.requestContext?.all ?? {}) as Record<
								string,
								unknown
							>,
						});
						const result = await condHandler(
							{
								mastra: ctx.mastra,
								requestContext: ctx.requestContext,
								inputData: ctx.inputData,
								getInitData: () => ctx.getInitData(),
								getStepResult: (stepId: string) => ctx.getStepResult(stepId),
							},
							resolvedParams as Record<string, unknown> | undefined,
						);
						return Boolean(result);
					};

					const branchWorkflow = buildBranchWorkflow(
						workflow.id,
						index,
						branch.steps,
						registry,
					);
					const branchStep = branchWorkflow as Step;
					return [condFn, branchStep];
				},
			);
			current = current.branch(branches) as Workflow;
			continue;
		}

		if (step.type === "foreach") {
			const built = buildStep(step.step, registry);
			const foreachWorkflow = current as Workflow & {
				foreach: (step: Step, opts?: { concurrency?: number }) => Workflow;
			};
			current = foreachWorkflow.foreach(built as Step, {
				concurrency: step.concurrency ?? 1,
			}) as Workflow;
			continue;
		}

		if (step.type === "dowhile") {
			const built = buildStep(step.step, registry);
			const condHandler = resolveHandler(registry, step.condition.handler);
			const condFn = async (ctx: ConditionContext) => {
				const resolvedParams = resolveTemplates(step.condition.params, {
					inputData: ctx.inputData,
					steps: new Proxy(
						{},
						{
							get: (_target, prop: string) => ctx.getStepResult(prop),
						},
					) as Record<string, unknown>,
					initData: ctx.getInitData(),
					requestContext: ctx.requestContext.all ?? {},
				});
				const result = await condHandler(
					{
						mastra: ctx.mastra,
						requestContext: ctx.requestContext,
						inputData: ctx.inputData,
						getInitData: () => ctx.getInitData(),
						getStepResult: (stepId: string) => ctx.getStepResult(stepId),
					},
					resolvedParams as Record<string, unknown> | undefined,
				);
				return Boolean(result);
			};
			const loop = current as Workflow & {
				dowhile: (
					step: Step,
					cond: (ctx: ConditionContext) => Promise<boolean>,
				) => Workflow;
			};
			current = loop.dowhile(built as Step, condFn) as Workflow;
			continue;
		}

		if (step.type === "dountil") {
			const built = buildStep(step.step, registry);
			const condHandler = resolveHandler(registry, step.condition.handler);
			const condFn = async (ctx: ConditionContext) => {
				const resolvedParams = resolveTemplates(step.condition.params, {
					inputData: ctx.inputData,
					steps: new Proxy(
						{},
						{
							get: (_target, prop: string) => ctx.getStepResult(prop),
						},
					) as Record<string, unknown>,
					initData: ctx.getInitData(),
					requestContext: (ctx.requestContext?.all ?? {}) as Record<
						string,
						unknown
					>,
				});
				const result = await condHandler(
					{
						mastra: ctx.mastra,
						requestContext: ctx.requestContext,
						inputData: ctx.inputData,
						getInitData: () => ctx.getInitData(),
						getStepResult: (stepId: string) => ctx.getStepResult(stepId),
					},
					resolvedParams as Record<string, unknown> | undefined,
				);
				return Boolean(result);
			};
			const loop = current as Workflow & {
				dountil: (
					step: Step,
					cond: (ctx: ConditionContext) => Promise<boolean>,
				) => Workflow;
			};
			current = loop.dountil(built as Step, condFn) as Workflow;
			continue;
		}

		const stepType = "type" in step ? step.type : "unknown";
		throw new Error(`Unsupported step type: ${stepType}`);
	}

	return current;
}

export function compileWorkflow(spec: WorkflowSpec, registry: HandlerRegistry) {
	const issues = validateWorkflowSchemas(spec, registry);
	const errors = issues.filter((issue) => issue.severity === "error");
	if (errors.length > 0) {
		const message = errors
			.map((issue) => `${issue.path}: ${issue.message}`)
			.join("\n");
		throw new Error(`Schema validation failed:\n${message}`);
	}
	const workflow = createWorkflow({
		id: spec.id,
		inputSchema: toZod(spec.inputSchema),
		outputSchema: toZod(spec.outputSchema),
		stateSchema: spec.stateSchema ? toZod(spec.stateSchema) : undefined,
		requestContextSchema: spec.requestContextSchema
			? toZod(spec.requestContextSchema)
			: undefined,
		options: spec.options,
	});

	const built = applySteps(workflow as Workflow, spec.steps, registry);
	return {
		workflow: built.commit(),
		warnings: issues.filter((issue) => issue.severity === "warning"),
	};
}
