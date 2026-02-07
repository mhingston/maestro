import { describe, expect, it } from "vitest";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { compileWorkflow } from "../compiler";
import type { HandlerRegistry } from "../registry";

describe("compileWorkflow nested workflows", () => {
	it("compiles nested workflow with input mapping", () => {
		const innerStep = createStep({
			id: "inner",
			inputSchema: { type: "object" } as Record<string, unknown>,
			outputSchema: { type: "object" } as Record<string, unknown>,
			execute: async () => ({ ok: true }),
		});
		const nestedWorkflow = createWorkflow({
			id: "nested",
			inputSchema: { type: "object" } as Record<string, unknown>,
			outputSchema: { type: "object" } as Record<string, unknown>,
		})
			.then(innerStep)
			.commit();

		const registry: HandlerRegistry = {
			handlers: {
				step1: async () => ({ ok: true }),
			},
			workflows: {
				nested: nestedWorkflow,
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
						workflowId: "nested",
						inputMapping: {
							payload: { from: "init", path: "." },
						},
					},
				],
			},
			registry,
		);

		expect(workflow.serializedStepGraph.length).toBeGreaterThan(0);
	});
});
