import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	readdir: vi.fn().mockResolvedValue([]),
}));

vi.mock("../parser", () => ({
	parseWorkflowYaml: vi.fn(),
}));

vi.mock("../compiler", () => ({
	compileWorkflow: vi.fn(),
}));

vi.mock("../validation", () => ({
	validateWorkflowSchemas: vi.fn(),
}));

vi.mock("../spec", () => ({
	getWorkflowSpecJsonSchema: vi.fn(() => ({ schema: true })),
}));

import { readFile, readdir } from "node:fs/promises";
import {
	commandCompile,
	commandRun,
	commandSchema,
	loadWorkflow,
	parseJsonInput,
	printHelp,
} from "../cli";
import { parseWorkflowYaml } from "../parser";
import type { WorkflowSpec } from "../spec";

const mockReadFile = vi.mocked(readFile);
const mockReaddir = vi.mocked(readdir);
const mockParseWorkflowYaml = vi.mocked(parseWorkflowYaml);

describe("cli helpers", () => {
	it("loadWorkflow reads YAML and parses spec", async () => {
		mockReadFile.mockResolvedValue(
			"id: test\ninputSchema: {}\noutputSchema: {}\nsteps: []",
		);
		const spec: WorkflowSpec = {
			id: "test",
			inputSchema: {},
			outputSchema: {},
			steps: [
				{
					type: "step",
					id: "first",
					handler: "handlers.ok",
					inputSchema: {},
					outputSchema: {},
				},
			],
		};
		mockParseWorkflowYaml.mockReturnValue(spec);

		const result = await loadWorkflow("workflow.yaml");

		expect(result.yamlText).toContain("id: test");
		expect(mockParseWorkflowYaml).toHaveBeenCalled();
	});

	it("commandCompile throws on missing file", async () => {
		await expect(commandCompile(undefined)).rejects.toThrow(
			"Missing --file path",
		);
	});

	it("commandRun throws on missing file", async () => {
		await expect(commandRun(undefined, undefined)).rejects.toThrow(
			"Missing --file path",
		);
	});

	it("parseJsonInput throws on invalid JSON", () => {
		expect(() => parseJsonInput("{bad")).toThrowError(
			/Invalid JSON for --input/,
		);
	});

	it("commandSchema prints JSON", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		commandSchema(true);
		expect(logSpy).toHaveBeenCalledWith(
			JSON.stringify({ schema: true }, null, 2),
		);
		logSpy.mockRestore();
	});

	it("commandSchema prints compact JSON when pretty false", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		commandSchema(false);
		expect(logSpy).toHaveBeenCalledWith(
			JSON.stringify({ schema: true }, null, 0),
		);
		logSpy.mockRestore();
	});

	it("printHelp writes usage text", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		printHelp();
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"maestro - declarative YAML workflow orchestrator",
			),
		);
		logSpy.mockRestore();
	});

	it("main prints help when no command", async () => {
		const { main } = await import("../cli");
		const argv = process.argv;
		process.argv = ["node", "cli"];
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await main();
		expect(logSpy).toHaveBeenCalled();
		process.argv = argv;
		logSpy.mockRestore();
	});

	it("main prints help when --help", async () => {
		const { main } = await import("../cli");
		const argv = process.argv;
		process.argv = ["node", "cli", "--help"];
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await main();
		expect(logSpy).toHaveBeenCalled();
		process.argv = argv;
		logSpy.mockRestore();
	});

	it("main throws on unknown command", async () => {
		const { main } = await import("../cli");
		const argv = process.argv;
		process.argv = ["node", "cli", "unknown"];
		await expect(main()).rejects.toThrow("Unknown command: unknown");
		process.argv = argv;
	});
});
