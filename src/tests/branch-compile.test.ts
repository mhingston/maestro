import { describe, expect, it } from "vitest";
import { compileWorkflow } from "../compiler";
import type { HandlerRegistry } from "../registry";

const registry: HandlerRegistry = {
	handlers: {
		cond: async () => true,
		step1: async () => ({ value: "a" }),
		step2: async () => ({ value: "b" }),
	},
};

describe("compileWorkflow", () => {
	it("compiles branch steps with multiple steps", () => {
		const { workflow } = compileWorkflow(
			{
				id: "branch-workflow",
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
				steps: [
					{
						type: "branch",
						branches: [
							{
								when: {
									handler: "handlers.cond",
									inputSchema: { type: "object" },
									outputSchema: { type: "boolean" },
								},
								steps: [
									{
										type: "step",
										id: "first",
										action: "step1",
										inputSchema: { type: "object" },
										outputSchema: { type: "object" },
									},
									{
										type: "step",
										id: "second",
										action: "step2",
										inputSchema: { type: "object" },
										outputSchema: { type: "object" },
									},
								],
							},
						],
					},
				],
			},
			registry,
		);

		expect(workflow.serializedStepGraph.length).toBeGreaterThan(0);
	});

	it("compiles map, sleep, and sleepUntil steps", () => {
		const { workflow } = compileWorkflow(
			{
				id: "control-workflow",
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
				steps: [
					{
						type: "map",
						id: "mapStep",
						mappings: {
							value: { value: "ok" },
						},
					},
					{
						type: "sleep",
						ms: 1,
					},
					{
						type: "sleepUntil",
						date: "2026-02-10T12:00:00Z",
					},
				],
			},
			registry,
		);

		expect(workflow.serializedStepGraph.length).toBeGreaterThan(0);
	});

	it("throws on schema validation errors", () => {
		const badRegistry: HandlerRegistry = { handlers: {} };
		expect(() =>
			compileWorkflow(
				{
					id: "bad",
					inputSchema: { type: "object" },
					outputSchema: { type: "object" },
					steps: [
						{
							type: "step",
							id: "first",
							action: "missing",
							inputSchema: { type: "object" },
							outputSchema: { type: "object" },
						},
					],
				},
				badRegistry,
			),
		).toThrow(/Schema validation failed/);
	});

	it("compiles parallel and foreach steps", () => {
		const { workflow } = compileWorkflow(
			{
				id: "parallel-workflow",
				inputSchema: { type: "array" },
				outputSchema: { type: "array" },
				steps: [
					{
						type: "parallel",
						steps: [
							{
								type: "step",
								id: "left",
								action: "step1",
								inputSchema: { type: "object" },
								outputSchema: { type: "object" },
							},
							{
								type: "step",
								id: "right",
								action: "step2",
								inputSchema: { type: "object" },
								outputSchema: { type: "object" },
							},
						],
					},
					{
						type: "foreach",
						concurrency: 2,
						step: {
							type: "step",
							id: "process",
							action: "step1",
							inputSchema: { type: "object" },
							outputSchema: { type: "object" },
						},
					},
				],
			},
			registry,
		);

		expect(workflow.serializedStepGraph.length).toBeGreaterThan(0);
	});

	it("compiles dowhile and dountil loops", () => {
		const { workflow } = compileWorkflow(
			{
				id: "loop-workflow",
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
				steps: [
					{
						type: "dowhile",
						step: {
							type: "step",
							id: "loop",
							action: "step1",
							inputSchema: { type: "object" },
							outputSchema: { type: "object" },
						},
						condition: {
							handler: "handlers.cond",
							inputSchema: { type: "object" },
							outputSchema: { type: "boolean" },
						},
					},
					{
						type: "dountil",
						step: {
							type: "step",
							id: "loop2",
							action: "step2",
							inputSchema: { type: "object" },
							outputSchema: { type: "object" },
						},
						condition: {
							handler: "handlers.cond",
							inputSchema: { type: "object" },
							outputSchema: { type: "boolean" },
						},
					},
				],
			},
			registry,
		);

		expect(workflow.serializedStepGraph.length).toBeGreaterThan(0);
	});

	it("compiles nested workflow with input mapping", () => {
		const handlers = {
			step1: async () => ({ value: "a" }),
			step2: async () => ({ value: "b" }),
		};
		const childWorkflow = compileWorkflow(
			{
				id: "childWorkflow",
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
				steps: [
					{
						type: "step",
						id: "child",
						action: "step1",
						inputSchema: { type: "object" },
						outputSchema: { type: "object" },
					},
				],
			},
			{ handlers },
		).workflow;
		const nestedRegistry: HandlerRegistry = {
			handlers,
			workflows: {
				childWorkflow,
			},
		};

		const { workflow } = compileWorkflow(
			{
				id: "parent",
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
				steps: [
					{
						type: "workflow",
						workflowId: "childWorkflow",
						inputMapping: {
							value: { from: "init", path: "value" },
						},
					},
				],
			},
			nestedRegistry,
		);

		expect(workflow.serializedStepGraph.length).toBeGreaterThan(0);
	});
});
