import { describe, expect, it, vi } from "vitest";

vi.mock("@mastra/schema-compat", () => ({
	convertSchemaToZod: (schema: unknown) => schema,
}));

vi.mock("@mastra/core/workflows", () => {
	const createdSteps: Array<Record<string, unknown>> = [];
	const createdWorkflows: Array<Record<string, unknown>> = [];
	const createWorkflow = vi.fn((opts: Record<string, unknown>) => {
		const workflow: Record<string, unknown> = {
			...opts,
			map: vi.fn().mockReturnThis(),
			parallel: vi.fn().mockReturnThis(),
			branch: vi.fn().mockReturnThis(),
			foreach: vi.fn().mockReturnThis(),
			dowhile: vi.fn().mockReturnThis(),
			dountil: vi.fn().mockReturnThis(),
			sleep: vi.fn().mockReturnThis(),
			sleepUntil: vi.fn().mockReturnThis(),
			commit: vi.fn().mockReturnValue({
				serializedStepGraph: [1],
				createRun: vi.fn(),
				id: opts.id,
			}),
		};
		Reflect.set(workflow, "then", vi.fn().mockReturnThis());
		workflow.__kind = "workflow";
		createdWorkflows.push(workflow);
		return workflow;
	});

	const createStep = vi.fn((spec: Record<string, unknown>) => {
		createdSteps.push(spec);
		return spec;
	});

	const cloneWorkflow = vi.fn((workflow: Record<string, unknown>, { id }) => ({
		...workflow,
		id,
	}));

	return {
		createWorkflow,
		createStep,
		cloneWorkflow,
		__createdSteps: createdSteps,
		__createdWorkflows: createdWorkflows,
	};
});

import { compileWorkflow } from "../compiler";
import type { HandlerRegistry } from "../registry";

describe("compileWorkflow with mocks", () => {
	it("passes resolved params to handlers", async () => {
		const handler = vi.fn().mockResolvedValue({ ok: true });
		const registry: HandlerRegistry = {
			handlers: {
				step: handler,
			},
		};

		compileWorkflow(
			{
				id: "mocked",
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
				steps: [
					{
						type: "step",
						id: "step",
						action: "step",
						inputSchema: { type: "object" },
						outputSchema: { type: "object" },
						params: { value: "${input.message}" },
					},
				],
			},
			registry,
		);

		const { __createdSteps } = await import("@mastra/core/workflows");
		const step = __createdSteps.find((item) => item.id === "step") as {
			execute: (ctx: Record<string, unknown>) => Promise<unknown>;
		};

		await step.execute({
			mastra: {},
			requestContext: { all: {} },
			inputData: { message: "hello" },
			getInitData: () => ({}),
			getStepResult: () => undefined,
		});

		expect(handler).toHaveBeenCalledWith(expect.any(Object), {
			value: "hello",
		});
	});

	it("invokes branch and loop condition functions", async () => {
		const condHandler = vi.fn().mockResolvedValue(true);
		const registry: HandlerRegistry = {
			handlers: {
				cond: condHandler,
				step: async () => ({ ok: true }),
			},
		};

		compileWorkflow(
			{
				id: "flow",
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
									params: { flag: "${input.flag}" },
								},
								steps: [
									{
										type: "step",
										id: "inner",
										action: "step",
										inputSchema: { type: "object" },
										outputSchema: { type: "object" },
									},
								],
							},
						],
					},
					{
						type: "dowhile",
						step: {
							type: "step",
							id: "loop",
							action: "step",
							inputSchema: { type: "object" },
							outputSchema: { type: "object" },
						},
						condition: {
							handler: "handlers.cond",
							inputSchema: { type: "object" },
							outputSchema: { type: "boolean" },
							params: { flag: "${input.flag}" },
						},
					},
					{
						type: "dountil",
						step: {
							type: "step",
							id: "loop2",
							action: "step",
							inputSchema: { type: "object" },
							outputSchema: { type: "object" },
						},
						condition: {
							handler: "handlers.cond",
							inputSchema: { type: "object" },
							outputSchema: { type: "boolean" },
							params: { flag: "${input.flag}" },
						},
					},
				],
			},
			registry,
		);

		const { __createdWorkflows } = await import("@mastra/core/workflows");
		const workflows = __createdWorkflows as Array<Record<string, unknown>>;
		const branchWorkflow = workflows.find(
			(workflow) =>
				((workflow.branch as ReturnType<typeof vi.fn>)?.mock.calls.length ??
					0) > 0,
		);
		const loopWorkflow = workflows.find(
			(workflow) =>
				((workflow.dowhile as ReturnType<typeof vi.fn>)?.mock.calls.length ??
					0) > 0 &&
				((workflow.dountil as ReturnType<typeof vi.fn>)?.mock.calls.length ??
					0) > 0,
		);

		expect(branchWorkflow).toBeDefined();
		expect(loopWorkflow).toBeDefined();

		const ctx = {
			mastra: {},
			requestContext: { all: {} },
			inputData: { flag: true },
			getInitData: () => ({}),
			getStepResult: () => undefined,
		};

		const branchCall = branchWorkflow?.branch as ReturnType<typeof vi.fn>;
		const loopDowhile = loopWorkflow?.dowhile as ReturnType<typeof vi.fn>;
		const loopDountil = loopWorkflow?.dountil as ReturnType<typeof vi.fn>;

		const branchArgs = branchCall?.mock.calls[0];
		const dowhileArgs = loopDowhile?.mock.calls[0];
		const dountilArgs = loopDountil?.mock.calls[0];

		expect(branchArgs).toBeDefined();
		expect(dowhileArgs).toBeDefined();
		expect(dountilArgs).toBeDefined();

		const branchEntries = branchArgs?.[0] as Array<
			[(ctx: Record<string, unknown>) => Promise<boolean>, unknown]
		>;
		const condFn = branchEntries?.[0]?.[0];
		const condFnDowhile = dowhileArgs?.[1] as (
			ctx: Record<string, unknown>,
		) => Promise<boolean>;
		const condFnDountil = dountilArgs?.[1] as (
			ctx: Record<string, unknown>,
		) => Promise<boolean>;

		await expect(condFn(ctx)).resolves.toBe(true);
		await expect(condFnDowhile(ctx)).resolves.toBe(true);
		await expect(condFnDountil(ctx)).resolves.toBe(true);
	});

	it("throws on unsupported step types", () => {
		const registry: HandlerRegistry = { handlers: {} };
		const spec = {
			id: "bad",
			inputSchema: { type: "object" },
			outputSchema: { type: "object" },
			steps: [
				{
					type: "unknown",
					id: "bad",
					inputSchema: { type: "object" },
					outputSchema: { type: "object" },
				},
			],
		} as unknown as Parameters<typeof compileWorkflow>[0];

		expect(() => compileWorkflow(spec, registry)).toThrow(
			"Unsupported step type",
		);
	});

	it("throws when step handler missing", () => {
		const registry: HandlerRegistry = { handlers: {} };
		const spec = {
			id: "bad",
			inputSchema: { type: "object" },
			outputSchema: { type: "object" },
			steps: [
				{
					type: "step",
					id: "missing",
					inputSchema: { type: "object" },
					outputSchema: { type: "object" },
				},
			],
		} as unknown as Parameters<typeof compileWorkflow>[0];

		expect(() => compileWorkflow(spec, registry)).toThrow(
			"Missing handler/agent/action/tool for step",
		);
	});
});
