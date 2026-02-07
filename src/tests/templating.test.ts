import { describe, expect, it } from "vitest";
import { resolveTemplates } from "../templating";

describe("resolveTemplates", () => {
	it("resolves input, steps, init, and requestContext values", () => {
		const result = resolveTemplates(
			{
				message: "${input.message}",
				stepValue: "${steps.stepA.value}",
				initValue: "${init.seed}",
				requestId: "${requestContext.requestId}",
			},
			{
				inputData: { message: "hello" },
				steps: { stepA: { value: "done" } },
				initData: { seed: "abc" },
				requestContext: { requestId: "req-1" },
			},
		);

		expect(result).toEqual({
			message: "hello",
			stepValue: "done",
			initValue: "abc",
			requestId: "req-1",
		});
	});

	it("throws when template path is missing", () => {
		expect(() =>
			resolveTemplates("${input.missing}", {
				inputData: { message: "hello" },
				steps: {},
				initData: {},
				requestContext: {},
			}),
		).toThrow("Template resolution failed");
	});

	it("throws on unknown template root", () => {
		expect(() =>
			resolveTemplates("${unknown.value}", {
				inputData: { message: "hello" },
				steps: {},
				initData: {},
				requestContext: {},
			}),
		).toThrow("Unknown template root");
	});

	it("throws on invalid path expression", () => {
		expect(() =>
			resolveTemplates(
				{ value: { $path: 123 as unknown as string } },
				{
					inputData: { value: "ok" },
					steps: {},
					initData: {},
					requestContext: {},
				},
			),
		).toThrow("Path expression must be a string.");
	});

	it("supports $path without root prefix", () => {
		const result = resolveTemplates(
			{ value: { $path: "input.message" } },
			{
				inputData: { message: "hello" },
				steps: {},
				initData: {},
				requestContext: {},
			},
		);

		expect(result).toEqual({ value: "hello" });
	});

	it("resolves array values", () => {
		const result = resolveTemplates(
			["${input.message}", { $path: "input.count" }],
			{
				inputData: { message: "ok", count: 2 },
				steps: {},
				initData: {},
				requestContext: {},
			},
		);

		expect(result).toEqual(["ok", 2]);
	});

	it("resolves step output via steps proxy", () => {
		const result = resolveTemplates("${steps.format.text}", {
			inputData: {},
			steps: {
				format: { text: "hello" },
			},
			initData: {},
			requestContext: {},
		});

		expect(result).toBe("hello");
	});

	it("throws when template path missing", () => {
		expect(() =>
			resolveTemplates("${input.missing}", {
				inputData: { message: "ok" },
				steps: {},
				initData: {},
				requestContext: {},
			}),
		).toThrow("Template resolution failed");
	});

	it("resolves path expressions to raw values", () => {
		const result = resolveTemplates(
			{
				message: { $path: "input.message" },
				requestId: { $jsonPath: "$.requestContext.requestId" },
			},
			{
				inputData: { message: "hello" },
				steps: {},
				initData: {},
				requestContext: { requestId: 42 },
			},
		);

		expect(result).toEqual({ message: "hello", requestId: 42 });
	});
});
