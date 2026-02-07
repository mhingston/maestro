import { describe, expect, it } from "vitest";
import type { HandlerRegistry } from "../registry";
import type { WorkflowSpec } from "../spec";
import { validateWorkflowSchemas } from "../validation";

const baseSchema = { type: "object" } as const;

function makeBaseSpec(steps: WorkflowSpec["steps"]): WorkflowSpec {
	return {
		id: "test-workflow",
		inputSchema: baseSchema,
		outputSchema: baseSchema,
		steps,
	};
}

describe("validateWorkflowSchemas", () => {
	it("flags duplicate step ids", () => {
		const spec = makeBaseSpec([
			{
				type: "step",
				id: "dup",
				action: "one",
				inputSchema: baseSchema,
				outputSchema: baseSchema,
			},
			{
				type: "step",
				id: "dup",
				action: "two",
				inputSchema: baseSchema,
				outputSchema: baseSchema,
			},
		]);

		const issues = validateWorkflowSchemas(spec);
		expect(
			issues.some((issue) => issue.message.includes("Duplicate step id")),
		).toBe(true);
	});

	it("flags missing actions when registry provided", () => {
		const spec = makeBaseSpec([
			{
				type: "step",
				id: "missing",
				action: "missing",
				inputSchema: baseSchema,
				outputSchema: baseSchema,
			},
		]);

		const registry: HandlerRegistry = { handlers: {} };
		const issues = validateWorkflowSchemas(spec, registry);
		expect(
			issues.some((issue) =>
				issue.message.includes("Missing handler: missing"),
			),
		).toBe(true);
	});

	it("treats schema mismatch as warning in warn mode", () => {
		const spec = makeBaseSpec([
			{
				type: "step",
				id: "first",
				action: "first",
				inputSchema: { type: "object" },
				outputSchema: { type: "string" },
			},
			{
				type: "step",
				id: "second",
				action: "second",
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
			},
		]);

		spec.options = { schemaCompatibility: "warn" };
		const issues = validateWorkflowSchemas(spec);
		const mismatch = issues.find((issue) =>
			issue.message.includes("Schema type mismatch"),
		);
		expect(mismatch?.severity).toBe("warning");
	});

	it("treats schema mismatch as error in strict mode", () => {
		const spec = makeBaseSpec([
			{
				type: "step",
				id: "first",
				action: "first",
				inputSchema: { type: "object" },
				outputSchema: { type: "string" },
			},
			{
				type: "step",
				id: "second",
				action: "second",
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
			},
		]);

		spec.options = { schemaCompatibility: "strict" };
		const issues = validateWorkflowSchemas(spec);
		const mismatch = issues.find((issue) =>
			issue.message.includes("Schema type mismatch"),
		);
		expect(mismatch?.severity).toBe("error");
	});

	it("flags missing branch condition handler", () => {
		const spec = makeBaseSpec([
			{
				type: "branch",
				branches: [
					{
						when: {
							handler: "handlers.condition",
							inputSchema: baseSchema,
							outputSchema: { type: "boolean" },
						},
						steps: [
							{
								type: "step",
								id: "ok",
								action: "ok",
								inputSchema: baseSchema,
								outputSchema: baseSchema,
							},
						],
					},
				],
			},
		]);

		const registry: HandlerRegistry = {
			handlers: {
				ok: async () => ({ ok: true }),
			},
		};
		const issues = validateWorkflowSchemas(spec, registry);
		expect(
			issues.some((issue) =>
				issue.message.includes("Missing handler: handlers.condition"),
			),
		).toBe(true);
	});

	it("flags missing workflow references", () => {
		const spec = makeBaseSpec([
			{
				type: "workflow",
				workflowId: "child-workflow",
			},
		]);

		const registry: HandlerRegistry = { handlers: {} };
		const issues = validateWorkflowSchemas(spec, registry);
		expect(
			issues.some((issue) =>
				issue.message.includes("Missing workflow: child-workflow"),
			),
		).toBe(true);
	});

	it("warns when foreach follows non-array output in warn mode", () => {
		const spec = makeBaseSpec([
			{
				type: "step",
				id: "first",
				action: "first",
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
			},
			{
				type: "foreach",
				step: {
					type: "step",
					id: "process",
					action: "process",
					inputSchema: { type: "object" },
					outputSchema: { type: "object" },
				},
			},
		]);

		spec.options = { schemaCompatibility: "warn" };
		const issues = validateWorkflowSchemas(spec);
		const foreachIssue = issues.find((issue) =>
			issue.message.includes("Foreach expects previous output"),
		);
		expect(foreachIssue?.severity).toBe("warning");
	});

	it("errors when foreach follows non-array output in strict mode", () => {
		const spec = makeBaseSpec([
			{
				type: "step",
				id: "first",
				action: "first",
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
			},
			{
				type: "foreach",
				step: {
					type: "step",
					id: "process",
					action: "process",
					inputSchema: { type: "object" },
					outputSchema: { type: "object" },
				},
			},
		]);

		spec.options = { schemaCompatibility: "strict" };
		const issues = validateWorkflowSchemas(spec);
		const foreachIssue = issues.find((issue) =>
			issue.message.includes("Foreach expects previous output"),
		);
		expect(foreachIssue?.severity).toBe("error");
	});

	it("warns when mapping references unknown step", () => {
		const spec = makeBaseSpec([
			{
				type: "map",
				id: "mapStep",
				mappings: {
					value: {
						from: "step",
						stepId: "missing",
						path: "value",
					},
				},
			},
		]);

		const issues = validateWorkflowSchemas(spec);
		expect(
			issues.some((issue) =>
				issue.message.includes("Mapping references unknown step"),
			),
		).toBe(true);
	});

	it("warns when mapping path missing for requestContext", () => {
		const spec = makeBaseSpec([
			{
				type: "map",
				id: "mapStep",
				mappings: {
					value: {
						from: "requestContext",
						path: 123,
					} as unknown as WorkflowSpec["steps"][number]["mappings"][string],
				},
			},
		]);

		const issues = validateWorkflowSchemas(spec);
		expect(
			issues.some((issue) =>
				issue.message.includes("Mapping path should be a string"),
			),
		).toBe(true);
	});

	it("warns when mapping from is invalid", () => {
		const spec = makeBaseSpec([
			{
				type: "map",
				id: "mapStep",
				mappings: {
					value: {
						from: "unknown",
						path: "value",
					} as unknown as WorkflowSpec["steps"][number]["mappings"][string],
				},
			},
		]);

		const issues = validateWorkflowSchemas(spec);
		expect(
			issues.some((issue) =>
				issue.message.includes("Mapping 'from' must be one of"),
			),
		).toBe(true);
	});

	it("warns when required object key missing in output", () => {
		const spec = makeBaseSpec([
			{
				type: "step",
				id: "first",
				action: "first",
				inputSchema: { type: "object" },
				outputSchema: {
					type: "object",
					properties: { ok: { type: "string" } },
				},
			},
			{
				type: "step",
				id: "second",
				action: "second",
				inputSchema: {
					type: "object",
					required: ["missing"],
					properties: { missing: { type: "string" } },
				},
				outputSchema: { type: "object" },
			},
		]);

		const issues = validateWorkflowSchemas(spec);
		expect(
			issues.some((issue) =>
				issue.message.includes("Output schema missing required key"),
			),
		).toBe(true);
	});

	it("warns when nullable mismatch", () => {
		const spec = makeBaseSpec([
			{
				type: "step",
				id: "first",
				action: "first",
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
			},
			{
				type: "step",
				id: "second",
				action: "second",
				inputSchema: {
					anyOf: [{ type: "object" }, { type: "null" }],
				},
				outputSchema: { type: "object" },
			},
		]);

		const issues = validateWorkflowSchemas(spec);
		expect(
			issues.some((issue) => issue.message.includes("Input allows null")),
		).toBe(true);
	});

	it("warns on enum mismatch in warn mode", () => {
		const spec = makeBaseSpec([
			{
				type: "step",
				id: "first",
				action: "first",
				inputSchema: { type: "string" },
				outputSchema: { type: "string", enum: ["a"] },
			},
			{
				type: "step",
				id: "second",
				action: "second",
				inputSchema: { type: "string", enum: ["a", "b"] },
				outputSchema: { type: "string" },
			},
		]);

		const issues = validateWorkflowSchemas(spec);
		const enumIssue = issues.find((issue) =>
			issue.message.includes("Output enum does not cover"),
		);
		expect(enumIssue?.severity).toBe("warning");
	});

	it("warns on constraint mismatch", () => {
		const spec = makeBaseSpec([
			{
				type: "step",
				id: "first",
				action: "first",
				inputSchema: { type: "string" },
				outputSchema: { type: "string" },
			},
			{
				type: "step",
				id: "second",
				action: "second",
				inputSchema: { type: "string", minLength: 2 },
				outputSchema: { type: "string" },
			},
		]);

		const issues = validateWorkflowSchemas(spec);
		expect(
			issues.some((issue) =>
				issue.message.includes("Input schema has constraints"),
			),
		).toBe(true);
	});

	it("checks array item compatibility", () => {
		const spec = makeBaseSpec([
			{
				type: "step",
				id: "first",
				action: "first",
				inputSchema: { type: "array", items: { type: "string" } },
				outputSchema: { type: "array", items: { type: "string" } },
			},
			{
				type: "step",
				id: "second",
				action: "second",
				inputSchema: { type: "array", items: { type: "number" } },
				outputSchema: { type: "array", items: { type: "number" } },
			},
		]);

		const issues = validateWorkflowSchemas(spec);
		expect(
			issues.some((issue) => issue.message.includes("Schema type mismatch")),
		).toBe(true);
	});
});
