import type { HandlerRegistry } from "./registry";
import type { StepSpec, WorkflowSpec } from "./spec";

export type SchemaIssue = {
	message: string;
	path: string;
	severity: "warning" | "error";
};

type JsonSchema = Record<string, unknown> | unknown[];

type SchemaType = string | string[] | undefined;

function getSchemaType(schema: JsonSchema): SchemaType {
	if (!schema || Array.isArray(schema)) {
		return undefined;
	}
	const typeValue = schema.type;
	if (typeof typeValue === "string") {
		return typeValue;
	}
	if (
		Array.isArray(typeValue) &&
		typeValue.every((t) => typeof t === "string")
	) {
		return typeValue as string[];
	}
	return undefined;
}

function getUnionSchemas(schema: JsonSchema): JsonSchema[] {
	if (!schema || Array.isArray(schema)) return [];
	const candidates = ["oneOf", "anyOf"] as const;
	for (const key of candidates) {
		const value = schema[key];
		if (Array.isArray(value)) {
			return value as JsonSchema[];
		}
	}
	return [];
}

function isNullable(schema: JsonSchema): boolean {
	const type = getSchemaType(schema);
	if (Array.isArray(type)) return type.includes("null");
	if (type === "null") return true;
	const unions = getUnionSchemas(schema);
	return unions.some((candidate) => getSchemaType(candidate) === "null");
}

function normalizeSchema(schema: JsonSchema): JsonSchema {
	if (!schema || Array.isArray(schema)) return schema;
	const unions = getUnionSchemas(schema);
	if (unions.length > 0) return schema;
	return schema;
}

function getScalarConstraints(schema: JsonSchema): Record<string, unknown> {
	if (!schema || Array.isArray(schema)) return {};
	const constraints: Record<string, unknown> = {};
	const keys = [
		"minLength",
		"maxLength",
		"pattern",
		"minimum",
		"maximum",
		"exclusiveMinimum",
		"exclusiveMaximum",
		"enum",
	];
	for (const key of keys) {
		if (key in schema)
			constraints[key] = (schema as Record<string, unknown>)[key];
	}
	return constraints;
}

function isEnumCompatible(
	outputSchema: JsonSchema,
	inputSchema: JsonSchema,
): boolean {
	if (
		!outputSchema ||
		Array.isArray(outputSchema) ||
		!inputSchema ||
		Array.isArray(inputSchema)
	)
		return true;
	const outputEnum = outputSchema.enum;
	const inputEnum = inputSchema.enum;
	if (!Array.isArray(outputEnum) || !Array.isArray(inputEnum)) return true;
	return inputEnum.every((value) => outputEnum.includes(value));
}

function typeIncludes(outputType: SchemaType, inputType: SchemaType): boolean {
	if (!inputType || !outputType) return true;
	const inputTypes = Array.isArray(inputType) ? inputType : [inputType];
	const outputTypes = Array.isArray(outputType) ? outputType : [outputType];
	return inputTypes.every((t) => outputTypes.includes(t));
}

function getObjectProps(
	schema: JsonSchema,
): Record<string, unknown> | undefined {
	if (!schema || Array.isArray(schema)) return undefined;
	if (schema.type !== "object") return undefined;
	const props = schema.properties;
	if (!props || typeof props !== "object") return undefined;
	return props as Record<string, unknown>;
}

function getRequired(schema: JsonSchema): string[] {
	if (!schema || Array.isArray(schema)) return [];
	const required = schema.required;
	if (!Array.isArray(required)) return [];
	return required.filter((item): item is string => typeof item === "string");
}

function getArrayItems(schema: JsonSchema): JsonSchema | undefined {
	if (!schema || Array.isArray(schema)) return undefined;
	if (schema.type !== "array") return undefined;
	const items = schema.items;
	if (!items || typeof items !== "object") return undefined;
	return items as JsonSchema;
}

function isArraySchema(schema: JsonSchema | undefined): boolean {
	if (!schema || Array.isArray(schema)) return false;
	const typeValue = schema.type;
	if (typeValue === "array") return true;
	if (Array.isArray(typeValue)) return typeValue.includes("array");
	return false;
}

function validateSchemaCompatibility(
	outputSchema: JsonSchema | undefined,
	inputSchema: JsonSchema | undefined,
	path: string,
	mode: "strict" | "warn",
): SchemaIssue[] {
	if (!outputSchema || !inputSchema) return [];
	const issues: SchemaIssue[] = [];

	const normalizedOutput = normalizeSchema(outputSchema);
	const normalizedInput = normalizeSchema(inputSchema);

	const outputType = getSchemaType(normalizedOutput);
	const inputType = getSchemaType(normalizedInput);

	if (!typeIncludes(outputType, inputType)) {
		issues.push({
			path,
			severity: mode === "strict" ? "error" : "warning",
			message: `Schema type mismatch. Output type ${JSON.stringify(outputType)} does not satisfy input type ${JSON.stringify(inputType)}.`,
		});
		return issues;
	}

	if (isNullable(normalizedInput) && !isNullable(normalizedOutput)) {
		issues.push({
			path,
			severity: "warning",
			message: "Input allows null but output does not appear to be nullable.",
		});
	}

	if (!isEnumCompatible(normalizedOutput, normalizedInput)) {
		issues.push({
			path,
			severity: mode === "strict" ? "error" : "warning",
			message: "Output enum does not cover all values required by input enum.",
		});
	}

	const outputConstraints = getScalarConstraints(normalizedOutput);
	const inputConstraints = getScalarConstraints(normalizedInput);
	if (
		Object.keys(inputConstraints).length > 0 &&
		Object.keys(outputConstraints).length === 0
	) {
		issues.push({
			path,
			severity: "warning",
			message:
				"Input schema has constraints that are not present in output schema.",
		});
	}

	if (inputType === "object" && outputType === "object") {
		const required = getRequired(normalizedInput);
		const outputProps = getObjectProps(normalizedOutput) ?? {};
		for (const key of required) {
			if (!(key in outputProps)) {
				issues.push({
					path,
					severity: "warning",
					message: `Output schema missing required key '${key}' expected by next step input.`,
				});
			}
		}
	}

	if (inputType === "array" && outputType === "array") {
		const outputItems = getArrayItems(normalizedOutput);
		const inputItems = getArrayItems(normalizedInput);
		if (outputItems && inputItems) {
			issues.push(
				...validateSchemaCompatibility(
					outputItems,
					inputItems,
					`${path}.items`,
					mode,
				),
			);
		}
	}

	return issues;
}

function validateMappings(
	mappings: Record<string, unknown>,
	availableSteps: Set<string>,
	path: string,
): SchemaIssue[] {
	const issues: SchemaIssue[] = [];

	for (const [key, mapping] of Object.entries(mappings)) {
		if (!mapping || typeof mapping !== "object") {
			issues.push({
				path: `${path}.${key}`,
				severity: "error",
				message: "Mapping entry must be an object.",
			});
			continue;
		}

		const record = mapping as Record<string, unknown>;
		if ("value" in record) {
			continue;
		}

		const from = record.from;
		if (from === "step") {
			const stepId = record.stepId;
			if (typeof stepId !== "string" || !availableSteps.has(stepId)) {
				issues.push({
					path: `${path}.${key}`,
					severity: "error",
					message: `Mapping references unknown step '${String(stepId)}'.`,
				});
			}
		}

		if (from !== "step" && from !== "init" && from !== "requestContext") {
			issues.push({
				path: `${path}.${key}`,
				severity: "error",
				message:
					"Mapping 'from' must be one of 'step', 'init', or 'requestContext'.",
			});
		}

		const pathValue = record.path;
		if (from !== "step" && typeof pathValue !== "string") {
			issues.push({
				path: `${path}.${key}`,
				severity: "warning",
				message: "Mapping path should be a string.",
			});
		}
	}

	return issues;
}

function schemaFromStep(step: StepSpec): JsonSchema | undefined {
	if ("outputSchema" in step) return step.outputSchema as JsonSchema;
	return undefined;
}

function inputSchemaFromStep(step: StepSpec): JsonSchema | undefined {
	if ("inputSchema" in step) return step.inputSchema as JsonSchema;
	return undefined;
}

function computeForeachOutput(step: StepSpec): JsonSchema | undefined {
	if (step.type !== "foreach") return schemaFromStep(step);
	const itemOutput = schemaFromStep(step.step);
	if (!itemOutput) return undefined;
	return { type: "array", items: itemOutput } as Record<string, unknown>;
}

function validateSequence(
	steps: StepSpec[],
	path: string,
	mode: "strict" | "warn",
	inputSchema?: JsonSchema,
): SchemaIssue[] {
	const issues: SchemaIssue[] = [];
	let prevOutput: JsonSchema | undefined = inputSchema;
	const availableSteps = new Set<string>();

	for (const step of steps) {
		if ("id" in step && typeof step.id === "string") {
			availableSteps.add(step.id);
		}
	}

	steps.forEach((step, index) => {
		if (step.type === "branch") {
			step.branches.forEach(
				(branch: (typeof step.branches)[number], branchIndex: number) => {
					const branchInput = branch.steps[0]
						? inputSchemaFromStep(branch.steps[0])
						: undefined;
					issues.push(
						...validateSchemaCompatibility(
							prevOutput,
							branchInput,
							`${path}.branch.${index}.branches.${branchIndex}`,
							mode,
						),
					);
					issues.push(
						...validateSequence(
							branch.steps,
							`${path}.branch.${index}.branches.${branchIndex}.steps`,
							mode,
							prevOutput,
						),
					);
				},
			);
			prevOutput = undefined;
			return;
		}

		if (step.type === "parallel") {
			step.steps.forEach((parallelStep: StepSpec, parallelIndex: number) => {
				const input = inputSchemaFromStep(parallelStep);
				issues.push(
					...validateSchemaCompatibility(
						prevOutput,
						input,
						`${path}.parallel.${index}.${parallelIndex}`,
						mode,
					),
				);
			});
			prevOutput = undefined;
			return;
		}

		if (step.type === "map") {
			issues.push(
				...validateMappings(
					step.mappings as Record<string, unknown>,
					availableSteps,
					`${path}.map.${index}`,
				),
			);
			prevOutput = { type: "object" };
			return;
		}

		if (step.type === "foreach") {
			if (prevOutput && !isArraySchema(prevOutput)) {
				issues.push({
					path: `${path}.steps.${index}`,
					severity: mode === "strict" ? "error" : "warning",
					message: "Foreach expects previous output to be an array schema.",
				});
			}
		}

		if (step.type === "workflow") {
			if (step.inputMapping) {
				issues.push(
					...validateMappings(
						step.inputMapping as Record<string, unknown>,
						availableSteps,
						`${path}.workflow.${index}`,
					),
				);
			}
			prevOutput = { type: "object" };
			return;
		}

		if (step.type === "sleep" || step.type === "sleepUntil") {
			return;
		}

		const input = inputSchemaFromStep(step);
		issues.push(
			...validateSchemaCompatibility(
				prevOutput,
				input,
				`${path}.steps.${index}`,
				mode,
			),
		);
		prevOutput =
			step.type === "foreach"
				? computeForeachOutput(step)
				: schemaFromStep(step);
	});

	return issues;
}

type StepVisitor = (step: StepSpec, path: string) => void;

function visitSteps(steps: StepSpec[], basePath: string, visit: StepVisitor) {
	steps.forEach((step, index) => {
		const stepPath = `${basePath}.${index}`;
		visit(step, stepPath);

		if (step.type === "branch") {
			step.branches.forEach(
				(branch: (typeof step.branches)[number], branchIndex: number) => {
					visitSteps(
						branch.steps,
						`${stepPath}.branches.${branchIndex}.steps`,
						visit,
					);
				},
			);
			return;
		}

		if (step.type === "parallel") {
			visitSteps(step.steps, `${stepPath}.steps`, visit);
			return;
		}

		if (step.type === "foreach") {
			visitSteps([step.step], `${stepPath}.step`, visit);
			return;
		}

		if (step.type === "dowhile" || step.type === "dountil") {
			visitSteps([step.step], `${stepPath}.step`, visit);
		}
	});
}

function validateUniqueStepIds(
	steps: StepSpec[],
	basePath: string,
): SchemaIssue[] {
	const issues: SchemaIssue[] = [];
	const seen = new Map<string, string>();

	visitSteps(steps, basePath, (step, path) => {
		if (!("id" in step) || typeof step.id !== "string") return;
		const existing = seen.get(step.id);
		if (existing) {
			issues.push({
				path: `${path}.id`,
				severity: "error",
				message: `Duplicate step id '${step.id}' previously defined at ${existing}.`,
			});
			return;
		}
		seen.set(step.id, `${path}.id`);
	});

	return issues;
}

function handlerExists(registry: HandlerRegistry, handlerId: string): boolean {
	const [namespace, name] = handlerId.includes(".")
		? handlerId.split(".")
		: ["handlers", handlerId];
	if (namespace === "handlers") return Boolean(registry.handlers?.[name]);
	if (namespace === "agent") return Boolean(registry.agents?.[name]);
	if (namespace === "tool") return Boolean(registry.tools?.[name]);
	const bucket = (registry as Record<string, unknown>)[namespace] as
		| Record<string, unknown>
		| undefined;
	return Boolean(bucket?.[name]);
}

function validateHandlers(
	steps: StepSpec[],
	basePath: string,
	registry: HandlerRegistry,
): SchemaIssue[] {
	const issues: SchemaIssue[] = [];

	visitSteps(steps, basePath, (step, path) => {
		// Check for declarative syntax: action, agent, or tool
		if ("action" in step && typeof step.action === "string") {
			if (!handlerExists(registry, `handlers.${step.action}`)) {
				issues.push({
					path: `${path}.action`,
					severity: "error",
					message: `Missing handler: ${step.action}.`,
				});
			}
		}
		if ("agent" in step && typeof step.agent === "string") {
			if (!handlerExists(registry, `agent.${step.agent}`)) {
				issues.push({
					path: `${path}.agent`,
					severity: "error",
					message: `Missing agent: ${step.agent}.`,
				});
			}
		}
		if ("tool" in step && typeof step.tool === "string") {
			if (!handlerExists(registry, `tool.${step.tool}`)) {
				issues.push({
					path: `${path}.tool`,
					severity: "error",
					message: `Missing tool: ${step.tool}.`,
				});
			}
		}
		if (step.type === "branch") {
			step.branches.forEach(
				(branch: (typeof step.branches)[number], branchIndex: number) => {
					if (!handlerExists(registry, branch.when.handler)) {
						issues.push({
							path: `${path}.branches.${branchIndex}.when.handler`,
							severity: "error",
							message: `Missing handler: ${branch.when.handler}.`,
						});
					}
				},
			);
		}

		if (step.type === "dowhile" || step.type === "dountil") {
			if (!handlerExists(registry, step.condition.handler)) {
				issues.push({
					path: `${path}.condition.handler`,
					severity: "error",
					message: `Missing handler: ${step.condition.handler}.`,
				});
			}
		}

		if (step.type === "workflow") {
			if (!registry.workflows?.[step.workflowId]) {
				issues.push({
					path: `${path}.workflowId`,
					severity: "error",
					message: `Missing workflow: ${step.workflowId}.`,
				});
			}
		}
	});

	return issues;
}

export function validateWorkflowSchemas(
	spec: WorkflowSpec,
	registry?: HandlerRegistry,
): SchemaIssue[] {
	const basePath = `${spec.id}.steps`;
	const mode = spec.options?.schemaCompatibility ?? "warn";
	const issues = [
		...validateSequence(
			spec.steps,
			spec.id,
			mode,
			spec.inputSchema as JsonSchema,
		),
		...validateUniqueStepIds(spec.steps, basePath),
	];

	if (registry) {
		issues.push(...validateHandlers(spec.steps, basePath, registry));
	}

	return issues;
}
