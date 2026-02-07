import { describe, expect, it } from "vitest";
import * as exports from "../index";

describe("index exports", () => {
	it("exposes core APIs", () => {
		expect(exports).toHaveProperty("compileWorkflow");
		expect(exports).toHaveProperty("parseWorkflowYaml");
		expect(exports).toHaveProperty("runYamlWorkflow");
		expect(exports).toHaveProperty("resolveTemplates");
		expect(exports).toHaveProperty("getWorkflowSpecJsonSchema");
	});
});
