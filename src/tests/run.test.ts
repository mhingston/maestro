import { describe, expect, it, vi } from "vitest";
import type { HandlerRegistry } from "../registry";
import { runWorkflowFromString } from "../run";

vi.mock("../parser", () => ({
	parseWorkflowYaml: vi.fn(() => ({
		id: "test",
		inputSchema: {},
		outputSchema: {},
		steps: [],
	})),
}));

const start = vi.fn().mockResolvedValue({ ok: true });
const createRun = vi.fn().mockResolvedValue({ start });

vi.mock("../compiler", () => ({
	compileWorkflow: vi.fn(() => ({
		workflow: { createRun },
		warnings: [],
	})),
}));

describe("runWorkflowFromString", () => {
	it("parses, compiles, and starts run", async () => {
		const registry: HandlerRegistry = { handlers: {} };
		const result = await runWorkflowFromString({
			yaml: "id: test",
			registry,
			inputData: { value: 1 },
		});

		expect(result).toEqual({ ok: true });
		expect(start).toHaveBeenCalledWith({
			inputData: { value: 1 },
			requestContext: undefined,
			initialState: undefined,
		});
	});
});
