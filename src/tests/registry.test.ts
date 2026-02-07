import { describe, expect, it, vi } from "vitest";
import type { HandlerContext, HandlerRegistry } from "../registry";
import { resolveHandler } from "../registry";

const baseContext: HandlerContext = {
	mastra: {} as HandlerContext["mastra"],
	requestContext: {} as HandlerContext["requestContext"],
	inputData: { prompt: "default", toolInput: "default" },
	getStepResult: () => undefined,
	getInitData: () => undefined,
};

describe("resolveHandler", () => {
	it("passes params to agent handler", async () => {
		const generate = vi.fn().mockResolvedValue({ text: "ok" });
		const registry: HandlerRegistry = {
			handlers: {},
			agents: {
				supportAgent: { generate } as HandlerRegistry["agents"][string],
			},
		};

		const handler = resolveHandler(registry, "agent.supportAgent");
		const result = await handler(baseContext, { prompt: "from-params" });

		expect(generate).toHaveBeenCalledWith("from-params", {});
		expect(result).toEqual({ text: "ok" });
	});

	it("passes params to tool handler", async () => {
		const execute = vi.fn().mockResolvedValue({ ok: true });
		const registry: HandlerRegistry = {
			handlers: {},
			tools: {
				searchTool: { execute } as HandlerRegistry["tools"][string],
			},
		};

		const handler = resolveHandler(registry, "tool.searchTool");
		const result = await handler(baseContext, { query: "from-params" });

		expect(execute).toHaveBeenCalledWith(
			{ query: "from-params" },
			{ requestContext: baseContext.requestContext },
		);
		expect(result).toEqual({ ok: true });
	});

	it("supports handler namespace resolution", async () => {
		const registry: HandlerRegistry = {
			handlers: {
				basic: async () => "ok",
			},
		};
		const handler = resolveHandler(registry, "basic");
		await expect(handler(baseContext)).resolves.toBe("ok");
	});

	it("throws on missing tool", () => {
		const registry: HandlerRegistry = { handlers: {}, tools: {} };
		expect(() => resolveHandler(registry, "tool.missing")).toThrow(
			"Missing tool",
		);
	});

	it("throws on missing handler", () => {
		const registry: HandlerRegistry = { handlers: {} };
		expect(() => resolveHandler(registry, "handlers.missing")).toThrow(
			"Missing handler",
		);
	});

	it("throws when agent prompt missing", async () => {
		const registry: HandlerRegistry = {
			handlers: {},
			agents: {
				supportAgent: {
					generate: vi.fn(),
				} as HandlerRegistry["agents"][string],
			},
		};
		const handler = resolveHandler(registry, "agent.supportAgent");
		await expect(handler(baseContext, { options: {} })).rejects.toThrow(
			"Agent handler requires prompt",
		);
	});

	it("throws when tool input is not object", async () => {
		const registry: HandlerRegistry = {
			handlers: {},
			tools: {
				searchTool: { execute: vi.fn() } as HandlerRegistry["tools"][string],
			},
		};
		const handler = resolveHandler(registry, "tool.searchTool");
		await expect(
			handler(baseContext, "bad" as unknown as Record<string, unknown>),
		).rejects.toThrow("Tool handler requires input object");
	});

	it("resolves custom namespace buckets", async () => {
		const registry: HandlerRegistry = {
			handlers: {},
			memory: {
				recall: async () => ({ ok: true }),
			},
		};
		const handler = resolveHandler(registry, "memory.recall");
		await expect(handler(baseContext)).resolves.toEqual({ ok: true });
	});
});
