import { createStep, createWorkflow } from "@mastra/core/workflows";
import { describe, expect, it, vi } from "vitest";
import {
	compileWorkflow,
	parseWorkflowYaml,
	runWorkflowFromString as runYamlWorkflow,
} from "../index";
import type { HandlerRegistry } from "../registry";

// Helper to safely access step results from workflow run result
function getStepResult(
	result: unknown,
	stepId: string,
): Record<string, unknown> | undefined {
	const r = result as Record<string, unknown> | undefined;
	const steps = r?.steps as
		| Record<string, { output?: Record<string, unknown> }>
		| undefined;
	return (
		steps?.[stepId]?.output ??
		(steps?.[stepId] as Record<string, unknown> | undefined)
	);
}

describe("E2E Tests - Maestro primitives map to Mastra primitives", () => {
	const createRegistry = (): HandlerRegistry => ({
		handlers: {
			formatMessage: async ({ inputData }) => ({
				text: String(
					(inputData as { message?: unknown } | undefined)?.message ?? "",
				),
			}),
			transformData: async ({ inputData }) => {
				const data = inputData as { value?: number } | undefined;
				return { result: (data?.value ?? 0) * 2 };
			},
			isPositive: async ({ inputData }) => {
				const data = inputData as { value?: number } | undefined;
				return (data?.value ?? 0) > 0;
			},
			isEven: async ({ inputData }) => {
				const data = inputData as { value?: number } | undefined;
				return (data?.value ?? 0) % 2 === 0;
			},
			processItem: async ({ inputData }) => {
				const item = inputData as { id?: number; name?: string } | undefined;
				return {
					processed: true,
					id: item?.id,
					upperName: String(item?.name ?? "").toUpperCase(),
				};
			},
			shouldContinue: async ({ inputData }) => {
				const data = inputData as { counter?: number } | undefined;
				return (data?.counter ?? 0) < 3;
			},
			incrementCounter: async ({ inputData }) => {
				const data = inputData as { counter?: number } | undefined;
				return { counter: (data?.counter ?? 0) + 1 };
			},
			logMessage: async ({ inputData }) => {
				console.log("Log:", inputData);
				return { logged: true };
			},
		},
		agents: {
			testAgent: {
				generate: vi.fn().mockResolvedValue({ text: "Agent response" }),
			},
		} as unknown as HandlerRegistry["agents"],
		tools: {
			testTool: {
				execute: vi.fn().mockResolvedValue({ result: "Tool executed" }),
			},
		} as unknown as HandlerRegistry["tools"],
	});

	describe("Basic step execution", () => {
		it("executes a simple workflow with handler steps", async () => {
			const yaml = `
id: simple-workflow
inputSchema:
  type: object
  properties:
    message: { type: string }
  required: [message]
outputSchema:
  type: object
  properties:
    text: { type: string }
  required: [text]
steps:
  - type: step
    id: format
    action: formatMessage
    inputSchema:
      type: object
      properties:
        message: { type: string }
      required: [message]
    outputSchema:
      type: object
      properties:
        text: { type: string }
      required: [text]
`;

			const registry = createRegistry();
			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { message: "hello world" },
			});

			expect(getStepResult(result, "format")).toBeDefined();
		});

		it("chains multiple steps with data passing", async () => {
			const yaml = `
id: chain-workflow
inputSchema:
  type: object
  properties:
    value: { type: number }
  required: [value]
outputSchema:
  type: object
  properties:
    result: { type: number }
  required: [result]
steps:
  - type: step
    id: step1
    action: transformData
    inputSchema:
      type: object
      properties:
        value: { type: number }
      required: [value]
    outputSchema:
      type: object
      properties:
        result: { type: number }
      required: [result]
  - type: map
    id: mapStep
    mappings:
      value:
        from: step
        stepId: step1
        path: result
  - type: step
    id: step2
    action: transformData
    inputSchema:
      type: object
      properties:
        value: { type: number }
      required: [value]
    outputSchema:
      type: object
      properties:
        result: { type: number }
      required: [result]
`;

			const registry = createRegistry();
			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { value: 5 },
			});

			expect(getStepResult(result, "step2")?.result).toBe(20);
		});
	});

	describe("Control flow primitives", () => {
		it("executes parallel steps", async () => {
			const yaml = `
id: parallel-workflow
inputSchema:
  type: object
  properties:
    value: { type: number }
  required: [value]
outputSchema:
  type: object
  properties:
    left: { type: object }
    right: { type: object }
steps:
  - type: parallel
    steps:
      - type: step
        id: left
        action: transformData
        inputSchema:
          type: object
          properties:
            value: { type: number }
          required: [value]
        outputSchema:
          type: object
          properties:
            result: { type: number }
          required: [result]
      - type: step
        id: right
        action: transformData
        inputSchema:
          type: object
          properties:
            value: { type: number }
          required: [value]
        outputSchema:
          type: object
          properties:
            result: { type: number }
          required: [result]
`;

			const registry = createRegistry();
			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { value: 10 },
			});

			expect(getStepResult(result, "left")?.result).toBe(20);
			expect(getStepResult(result, "right")?.result).toBe(20);
		});

		it("executes branch with condition", async () => {
			const yaml = `
id: branch-workflow
inputSchema:
  type: object
  properties:
    value: { type: number }
  required: [value]
outputSchema:
  type: object
  properties:
    result: { type: boolean }
steps:
  - type: map
    id: mapCheck
    mappings:
      value:
        from: init
        path: value
  - type: branch
    branches:
      - when:
          handler: handlers.isPositive
          inputSchema:
            type: object
            properties:
              value: { type: number }
            required: [value]
          outputSchema: { type: boolean }
        steps:
          - type: step
            id: positiveBranch
            action: isPositive
            inputSchema:
              type: object
              properties:
                value: { type: number }
              required: [value]
            outputSchema: { type: boolean }
`;

			const registry = createRegistry();
			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { value: 5 },
			});

			// Branch step creates a nested workflow, so we check if the branch executed
			// by verifying the workflow completed without errors
			expect(result.status).toBe("success");
		});

		it("executes foreach over array input", async () => {
			const yaml = `
id: foreach-workflow
inputSchema:
  type: array
  items:
    type: object
    properties:
      id: { type: number }
      name: { type: string }
outputSchema:
  type: array
  items:
    type: object
steps:
  - type: foreach
    concurrency: 2
    step:
      type: step
      id: processItem
      action: processItem
      inputSchema:
        type: object
        properties:
          id: { type: number }
          name: { type: string }
      outputSchema:
        type: object
        properties:
          processed: { type: boolean }
          id: { type: number }
          upperName: { type: string }
`;

			const registry = createRegistry();
			const items = [
				{ id: 1, name: "alice" },
				{ id: 2, name: "bob" },
			];

			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: items,
			});

			const foreachResult = getStepResult(result, "processItem");
			expect(Array.isArray(foreachResult)).toBe(true);
			expect(foreachResult).toHaveLength(2);
		});

		it("executes dowhile loop", async () => {
			const yaml = `
id: loop-workflow
inputSchema:
  type: object
  properties:
    counter: { type: number }
  required: [counter]
outputSchema:
  type: object
  properties:
    counter: { type: number }
steps:
  - type: dowhile
    step:
      type: step
      id: increment
      action: incrementCounter
      inputSchema:
        type: object
        properties:
          counter: { type: number }
      outputSchema:
        type: object
        properties:
          counter: { type: number }
    condition:
      handler: handlers.shouldContinue
      inputSchema:
        type: object
        properties:
          counter: { type: number }
      outputSchema: { type: boolean }
`;

			const registry = createRegistry();
			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { counter: 0 },
			});

			expect(getStepResult(result, "increment")?.counter).toBe(3);
		});

		it("executes sleep step", async () => {
			const startTime = Date.now();
			const yaml = `
id: sleep-workflow
inputSchema:
  type: object
  properties: {}
outputSchema:
  type: object
  properties:
    done: { type: boolean }
steps:
  - type: step
    id: before
    action: logMessage
    inputSchema: { type: object }
    outputSchema: { type: object }
    params:
      message: "before sleep"
  - type: sleep
    ms: 100
  - type: step
    id: after
    action: logMessage
    inputSchema: { type: object }
    outputSchema: { type: object }
    params:
      message: "after sleep"
`;

			const registry = createRegistry();
			await runYamlWorkflow({
				yaml,
				registry,
				inputData: {},
			});

			const elapsed = Date.now() - startTime;
			expect(elapsed).toBeGreaterThanOrEqual(100);
		});
	});

	describe("Step types", () => {
		it("executes agent step", async () => {
			const yaml = `
id: agent-workflow
inputSchema:
  type: object
  properties:
    prompt: { type: string }
  required: [prompt]
outputSchema:
  type: object
  properties:
    response: { type: string }
steps:
  - type: agent
    id: agentStep
    agent: testAgent
    inputSchema:
      type: object
      properties:
        prompt: { type: string }
      required: [prompt]
    outputSchema:
      type: object
      properties:
        response: { type: string }
    params:
      prompt: "test prompt"
`;

			const registry = createRegistry();
			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { prompt: "Hello agent" },
			});

			expect(getStepResult(result, "agentStep")?.text).toBe("Agent response");
		});

		it("executes tool step", async () => {
			const yaml = `
id: tool-workflow
inputSchema:
  type: object
  properties:
    query: { type: string }
  required: [query]
outputSchema:
  type: object
  properties:
    result: { type: string }
steps:
  - type: tool
    id: toolStep
    tool: testTool
    inputSchema:
      type: object
      properties:
        query: { type: string }
      required: [query]
    outputSchema:
      type: object
      properties:
        result: { type: string }
    params:
      query: "search query"
`;

			const registry = createRegistry();
			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { query: "search query" },
			});

			expect(getStepResult(result, "toolStep")?.result).toBe("Tool executed");
		});
	});

	describe("Nested workflows", () => {
		it("executes nested workflow with input mapping", async () => {
			const childStep = createStep({
				id: "childStep",
				inputSchema: { type: "object" } as never,
				outputSchema: { type: "object" } as never,
				execute: async ({ inputData }) =>
					({
						childResult: (inputData as { value?: string })?.value,
					}) as never,
			});

			const childWorkflow = createWorkflow({
				id: "child",
				inputSchema: { type: "object" } as never,
				outputSchema: { type: "object" } as never,
			})
				.then(childStep as never)
				.commit();

			const yaml = `
id: parent-workflow
inputSchema:
  type: object
  properties:
    value: { type: string }
  required: [value]
outputSchema:
  type: object
  properties:
    childResult: { type: string }
steps:
  - type: workflow
    workflowId: childWorkflow
    inputMapping:
      value:
        from: init
        path: value
`;

			const registry: HandlerRegistry = {
				...createRegistry(),
				workflows: {
					childWorkflow: childWorkflow as never,
				},
			};

			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { value: "test-value" },
			});

			// Nested workflow creates internal steps, we verify it executed
			expect(result.status).toBe("success");
		});
	});

	describe("Map step", () => {
		it("executes map step with mappings", async () => {
			const yaml = `
id: map-workflow
inputSchema:
  type: object
  properties:
    message: { type: string }
  required: [message]
outputSchema:
  type: object
  properties:
    mapped: { type: string }
steps:
  - type: step
    id: sourceStep
    action: formatMessage
    inputSchema:
      type: object
      properties:
        message: { type: string }
      required: [message]
    outputSchema:
      type: object
      properties:
        text: { type: string }
      required: [text]
  - type: map
    id: mappingStep
    mappings:
      mappedValue:
        from: step
        stepId: sourceStep
        path: text
`;

			const registry = createRegistry();
			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { message: "original" },
			});

			expect(getStepResult(result, "mappingStep")?.mappedValue).toBe(
				"original",
			);
		});
	});

	describe("Template parameter resolution", () => {
		it("resolves input template parameters", async () => {
			const yaml = `
id: template-workflow
inputSchema:
  type: object
  properties:
    message: { type: string }
  required: [message]
outputSchema:
  type: object
  properties:
    text: { type: string }
steps:
  - type: step
    id: templateStep
    action: formatMessage
    inputSchema:
      type: object
      properties:
        message: { type: string }
      required: [message]
    outputSchema:
      type: object
      properties:
        text: { type: string }
      required: [text]
`;

			const registry = createRegistry();
			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { message: "Hello, World!" },
			});

			expect(getStepResult(result, "templateStep")?.text).toBe("Hello, World!");
		});

		it("resolves step result template parameters via map", async () => {
			const yaml = `
id: step-template-workflow
inputSchema:
  type: object
  properties:
    value: { type: number }
  required: [value]
outputSchema:
  type: object
  properties:
    final: { type: number }
steps:
  - type: step
    id: step1
    action: transformData
    inputSchema:
      type: object
      properties:
        value: { type: number }
      required: [value]
    outputSchema:
      type: object
      properties:
        result: { type: number }
      required: [result]
  - type: map
    id: map1
    mappings:
      value:
        from: step
        stepId: step1
        path: result
  - type: step
    id: step2
    action: transformData
    inputSchema:
      type: object
      properties:
        value: { type: number }
      required: [value]
    outputSchema:
      type: object
      properties:
        result: { type: number }
      required: [result]
`;

			const registry = createRegistry();
			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { value: 3 },
			});

			expect(getStepResult(result, "step2")?.result).toBe(12);
		});
	});

	describe("Complex workflow scenarios", () => {
		it("executes complete workflow with multiple primitives", async () => {
			const yaml = `
id: complex-workflow
inputSchema:
  type: object
  properties:
    items:
      type: array
      items:
        type: object
    threshold: { type: number }
  required: [items, threshold]
outputSchema:
  type: object
  properties:
    processed: { type: array }
steps:
  - type: map
    id: initCheck
    mappings:
      value:
        from: init
        path: threshold
  - type: branch
    branches:
      - when:
          handler: handlers.isPositive
          inputSchema:
            type: object
            properties:
              value: { type: number }
            required: [value]
          outputSchema: { type: boolean }
        steps:
          - type: foreach
            concurrency: 2
            step:
              type: step
              id: process
              action: processItem
              inputSchema:
                type: object
                properties:
                  id: { type: number }
                  name: { type: string }
              outputSchema:
                type: object
`;

			const registry = createRegistry();
			const items = [
				{ id: 1, name: "item1" },
				{ id: 2, name: "item2" },
			];

			const result = await runYamlWorkflow({
				yaml,
				registry,
				inputData: { items, threshold: 10 },
			});

			expect(result.status).toBe("success");
		});
	});
});

describe("E2E Tests - compileWorkflow integration", () => {
	it("compiles and executes workflow using compileWorkflow directly", async () => {
		const spec = parseWorkflowYaml(`
id: direct-compile
inputSchema:
  type: object
  properties:
    value: { type: number }
outputSchema:
  type: object
  properties:
    doubled: { type: number }
steps:
  - type: step
    id: double
    action: double
    inputSchema:
      type: object
      properties:
        value: { type: number }
    outputSchema:
      type: object
      properties:
        result: { type: number }
`);

		const registry: HandlerRegistry = {
			handlers: {
				double: async ({ inputData }) => {
					const value = (inputData as { value?: number })?.value ?? 0;
					return { result: value * 2 };
				},
			},
		};

		const { workflow, warnings } = compileWorkflow(spec, registry);
		expect(warnings).toHaveLength(0);

		const run = await workflow.createRun();
		const result = await run.start({ inputData: { value: 21 } });

		expect(getStepResult(result, "double")?.result).toBe(42);
	});
});
