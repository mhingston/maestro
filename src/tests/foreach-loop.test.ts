import { describe, expect, it } from "vitest";
import { compileWorkflow } from "../compiler";
import type { HandlerRegistry } from "../registry";

const registry: HandlerRegistry = {
	handlers: {
		processItem: async ({ inputData }) => inputData,
		shouldContinue: async () => false,
	},
};

describe("compileWorkflow foreach and loops", () => {
	it("compiles foreach", () => {
		const { workflow } = compileWorkflow(
			{
				id: "foreach-workflow",
				inputSchema: { type: "array", items: { type: "object" } },
				outputSchema: { type: "array", items: { type: "object" } },
				steps: [
					{
						type: "foreach",
						concurrency: 2,
						step: {
							type: "step",
							id: "item",
							action: "processItem",
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

	it("compiles loops", () => {
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
							id: "loopStep",
							action: "processItem",
							inputSchema: { type: "object" },
							outputSchema: { type: "object" },
						},
						condition: {
							handler: "handlers.shouldContinue",
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
});
