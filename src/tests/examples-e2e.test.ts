import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseWorkflowYaml } from "../parser";

/**
 * NOTE: These tests validate that example YAML files parse correctly against the schema.
 * They do NOT test actual execution - the examples reference external resources
 * (MCP servers, custom tools, agents, databases) that would need to be configured
 * separately for the workflows to run successfully.
 */
describe("Examples Validation Tests", () => {
	describe("advanced-features.yaml", () => {
		it("should parse and validate the workflow", async () => {
			const yaml = await readFile(
				join(process.cwd(), "examples", "advanced-features.yaml"),
				"utf-8",
			);

			// Should parse without errors
			const spec = parseWorkflowYaml(yaml);
			expect(spec).toBeDefined();
			expect(spec.id).toBe("advanced-workflow");
			expect(spec.config).toBeDefined();
			expect(spec.config?.memory).toBeDefined();
			expect(spec.config?.mcpServers).toBeDefined();
			expect(spec.tools).toBeDefined();
			expect(spec.evals).toBeDefined();
			expect(spec.steps.length).toBeGreaterThan(0);
		});

		it("should have valid MCP step configuration", async () => {
			const yaml = await readFile(
				join(process.cwd(), "examples", "advanced-features.yaml"),
				"utf-8",
			);

			const spec = parseWorkflowYaml(yaml);
			const mcpStep = spec.steps.find((s) => s.type === "mcp");
			expect(mcpStep).toBeDefined();
			if (mcpStep && mcpStep.type === "mcp") {
				expect(mcpStep.server).toBe("brave-search");
				expect(mcpStep.tool).toBe("web_search");
			}
		});
	});

	describe("graphrag-eval-example.yaml", () => {
		it("should have GraphRAG configuration", async () => {
			const yaml = await readFile(
				join(process.cwd(), "examples", "graphrag-eval-example.yaml"),
				"utf-8",
			);

			const spec = parseWorkflowYaml(yaml);
			expect(spec.graphRags).toBeDefined();
			expect(spec.graphRags).toHaveLength(1);
			expect(spec.graphRags?.[0]?.id).toBe("knowledgeGraph");
			expect(spec.graphRags?.[0]?.dimension).toBe(1536);
		});

		it("should have eval configuration", async () => {
			const yaml = await readFile(
				join(process.cwd(), "examples", "graphrag-eval-example.yaml"),
				"utf-8",
			);

			const spec = parseWorkflowYaml(yaml);
			expect(spec.evals).toBeDefined();
			expect(spec.evals?.length).toBeGreaterThan(0);
		});

		it("should have document processing steps", async () => {
			const yaml = await readFile(
				join(process.cwd(), "examples", "graphrag-eval-example.yaml"),
				"utf-8",
			);

			const spec = parseWorkflowYaml(yaml);
			const docChunkStep = spec.steps.find((s) => s.type === "documentChunk");
			const docMetaStep = spec.steps.find((s) => s.type === "documentMetadata");
			expect(docChunkStep).toBeDefined();
			expect(docMetaStep).toBeDefined();
		});
	});

	describe("complete-workflow.yaml", () => {
		it("should parse workflow configuration", async () => {
			const yaml = await readFile(
				join(process.cwd(), "examples", "complete-workflow.yaml"),
				"utf-8",
			);

			const spec = parseWorkflowYaml(yaml);
			expect(spec).toBeDefined();
			expect(spec.id).toBe("complete-demo");
			expect(spec.config?.persistState).toBe(true);
		});

		it("should have network configuration", async () => {
			const yaml = await readFile(
				join(process.cwd(), "examples", "complete-workflow.yaml"),
				"utf-8",
			);

			const spec = parseWorkflowYaml(yaml);
			expect(spec.networks).toBeDefined();
			expect(spec.networks?.length).toBeGreaterThan(0);
		});

		it("should have document processing steps", async () => {
			const yaml = await readFile(
				join(process.cwd(), "examples", "complete-workflow.yaml"),
				"utf-8",
			);

			const spec = parseWorkflowYaml(yaml);
			// Check for document processing steps
			const docChunkStep = spec.steps.find((s) => s.type === "documentChunk");
			const docMetaStep = spec.steps.find((s) => s.type === "documentMetadata");
			expect(docChunkStep).toBeDefined();
			expect(docMetaStep).toBeDefined();
		});
	});

	describe("advanced-agent.md", () => {
		it("should parse agent markdown with frontmatter", async () => {
			const content = await readFile(
				join(process.cwd(), "examples", "advanced-agent.md"),
				"utf-8",
			);

			// Simple check for frontmatter
			expect(content).toContain("---");
			expect(content).toContain("fallbacks:");
			expect(content).toContain("voice:");
			expect(content).toContain("processors:");
			expect(content).toContain("evals:");
		});
	});

	describe("Feature validation with simple YAML", () => {
		it("should parse GraphRAG step with string template for chunks", () => {
			const yaml = `
id: test-graphrag
inputSchema:
  type: object
outputSchema:
  type: object
steps:
  - type: graphRag
    id: search
    query: "test query"
    chunks: "\${input.chunks}"
    embeddings: []
    inputSchema:
      type: object
    outputSchema:
      type: object
`;
			const spec = parseWorkflowYaml(yaml);
			expect(spec.steps[0]?.type).toBe("graphRag");
		});

		it("should parse evals step", () => {
			const yaml = `
id: test-evals
inputSchema:
  type: object
outputSchema:
  type: object
steps:
  - type: evals
    id: check
    scorer: faithfulness
    outputText: "test output"
    context: "test context"
    threshold: 0.8
    inputSchema:
      type: object
    outputSchema:
      type: object
`;
			const spec = parseWorkflowYaml(yaml);
			expect(spec.steps[0]?.type).toBe("evals");
		});

		it("should parse voice steps", () => {
			const yaml = `
id: test-voice
inputSchema:
  type: object
outputSchema:
  type: object
steps:
  - type: tts
    id: speak
    text: "Hello world"
    inputSchema:
      type: object
    outputSchema:
      type: object
  - type: listen
    id: hear
    audio: "test.mp3"
    inputSchema:
      type: object
    outputSchema:
      type: object
`;
			const spec = parseWorkflowYaml(yaml);
			expect(spec.steps[0]?.type).toBe("tts");
			expect(spec.steps[1]?.type).toBe("listen");
		});

		it("should parse suspend/resume steps", () => {
			const yaml = `
id: test-suspend
inputSchema:
  type: object
outputSchema:
  type: object
steps:
  - type: suspend
    id: wait
    prompt: "Please approve"
    waitFor: approval
    inputSchema:
      type: object
    outputSchema:
      type: object
`;
			const spec = parseWorkflowYaml(yaml);
			expect(spec.steps[0]?.type).toBe("suspend");
		});

		it("should parse network step", () => {
			const yaml = `
id: test-network
inputSchema:
  type: object
outputSchema:
  type: object
networks:
  - id: testNetwork
    agents:
      - name: agent1
        agent: test-agent
steps:
  - type: network
    id: runNetwork
    network: testNetwork
    input: "test input"
    inputSchema:
      type: object
    outputSchema:
      type: object
`;
			const spec = parseWorkflowYaml(yaml);
			expect(spec.steps[0]?.type).toBe("network");
			expect(spec.networks?.[0]?.id).toBe("testNetwork");
		});

		it("should parse document processing steps", () => {
			const yaml = `
id: test-document
inputSchema:
  type: object
outputSchema:
  type: object
steps:
  - type: documentChunk
    id: chunks
    document: "test document"
    strategy: sentence
    inputSchema:
      type: object
    outputSchema:
      type: object
  - type: documentMetadata
    id: meta
    document: "test document"
    extractors:
      - title
      - summary
    inputSchema:
      type: object
    outputSchema:
      type: object
`;
			const spec = parseWorkflowYaml(yaml);
			expect(spec.steps[0]?.type).toBe("documentChunk");
			expect(spec.steps[1]?.type).toBe("documentMetadata");
		});
	});
});
