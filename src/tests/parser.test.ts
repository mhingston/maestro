import { describe, expect, it } from "vitest";
import { YamlSpecError, parseWorkflowYaml } from "../parser";

describe("parseWorkflowYaml", () => {
	it("parses valid YAML", () => {
		const yaml = `
id: test
inputSchema: { type: object }
outputSchema: { type: object }
steps:
  - type: step
    id: first
    action: ok
    inputSchema: { type: object }
    outputSchema: { type: object }
`;

		const spec = parseWorkflowYaml(yaml);
		expect(spec.id).toBe("test");
		expect(spec.steps.length).toBe(1);
	});

	it("throws with YAML line/column on parse error", () => {
		const yaml = "id: [";
		try {
			parseWorkflowYaml(yaml);
		} catch (error) {
			expect(error).toBeInstanceOf(YamlSpecError);
			const err = error as YamlSpecError;
			expect(err.line).toBeDefined();
			expect(err.column).toBeDefined();
			return;
		}
		throw new Error("Expected parse to throw");
	});

	it("throws on schema validation error", () => {
		const yaml = `
id: test
inputSchema: { type: object }
outputSchema: { type: object }
steps: []
`;
		expect(() => parseWorkflowYaml(yaml)).toThrow(/Spec validation failed/);
	});
});
