import { describe, expect, it } from "vitest";
import { WorkflowSpecSchema, getWorkflowSpecJsonSchema } from "../spec";

describe("spec schema", () => {
	it("accepts schemaCompatibility option", () => {
		const result = WorkflowSpecSchema.safeParse({
			id: "test",
			inputSchema: { type: "object" },
			outputSchema: { type: "object" },
			options: { schemaCompatibility: "strict" },
			steps: [
				{
					type: "step",
					id: "first",
					action: "ok",
					inputSchema: { type: "object" },
					outputSchema: { type: "object" },
				},
			],
		});

		expect(result.success).toBe(true);
	});

	it("builds JSON schema", () => {
		const schema = getWorkflowSpecJsonSchema();
		expect(schema).toHaveProperty("definitions");
	});
});
