# Maestro

![coverage](https://img.shields.io/badge/coverage-90%25%2B-brightgreen)

Write declarative workflows in YAML, run them with Mastra.

Maestro compiles YAML workflow definitions into Mastra workflows at runtime. Define your control flow (sequences, branches, loops, parallelism) and business logic separately—Maestro handles the wiring.

## Overview

Maestro is a **pure YAML-first workflow orchestrator**. You write:
- YAML workflow files defining control flow
- Markdown files with YAML frontmatter defining AI agents
- Nothing else—no code, no registries, no boilerplate

```
my-project/
├── workflow.yaml              # Main workflow definition
├── agents/
│   ├── support.md             # Agent with YAML frontmatter + instructions
│   └── technical.md
├── .env                       # API keys, model configuration
└── package.json
```

## Quick Start

### 1. Create your workflow

Create a `workflow.yaml` file and optionally add agent definitions in an `agents/` directory:

```yaml
id: support-workflow
name: Customer Support Automation
inputSchema:
  type: object
  properties:
    message: { type: string }
  required: [message]

steps:
  - type: agent
    id: support
    agent: support               # Loads agents/support.md
    input: ${input.message}
  
  - type: step
    id: respond
    action: saveResponse
    params:
      response: ${steps.support.output}
```

Create `agents/support.md`:

```markdown
---
model: gpt-4
tools:
  - search
  - calculator
temperature: 0.7
---

You are a helpful support agent. Be concise and friendly.
```

### 2. Run it

```bash
# Install Maestro
npm install @mhingston5/maestro

# Run workflow
maestro run --file workflow.yaml --input '{"message":"I need help!"}'
```

That's it. Maestro automatically:
- Loads agent definitions from `agents/*.md` files
- Creates Mastra agents with the configured models and tools
- Compiles your YAML workflow to Mastra's execution engine
- Executes the workflow with the provided input

## Installation

```bash
npm install @mhingston5/maestro
```

## Built-in Tools

Maestro provides built-in tools that work out of the box:

| Tool | Description |
|------|-------------|
| `http` | Make HTTP requests to external APIs |
| `fetch` | Simple GET requests for quick web fetching |
| `calculator` | Perform mathematical calculations safely |
| `memory` | Store and retrieve data from memory |
| `vectorStore` | Vector database operations (upsert, query, delete, list) |
| `rag` | Retrieval-Augmented Generation - retrieves context for LLM queries |
| **File System** ||
| `readFile` | Read file contents (utf8/base64) |
| `readFileLines` | Read specific line ranges from files |
| `writeFile` | Write or overwrite files |
| `appendFile` | Append to files (creates if missing) |
| `listFiles` | List directory contents |
| `searchFiles` | Search files by glob pattern |
| `searchContent` | Search file contents with regex |
| **Execution** ||
| `runCommand` | Execute shell commands safely |
| **Git** ||
| `git` | Git operations (clone, status, commit, push, pull, checkout) |

List all available tools:
```bash
maestro tools list
```

## Built-in Actions

For steps that don't need AI agents, use built-in actions:

```yaml
- type: step
  id: notify
  action: sendNotification
  params:
    channel: "slack"
    message: "Critical issue: ${input.message}"
    priority: "high"
```

Available actions:
- `sendNotification` - Send to Slack, email, webhook, or console
- `escalate` - Escalate to human operator
- `saveResponse` - Persist output to console, file, or webhook
- `delay` - Pause execution for a specified duration
- `condition` - Evaluate simple conditional expressions

List all available actions:
```bash
maestro actions list
```

## Primitives

Maestro provides high-level primitives that compile to Mastra's control-flow operations:

### Control Flow Primitives

| Maestro Primitive | Compiles To | Purpose |
|------------------|-------------|---------|
| `step` | `createStep().then()` | Sequential execution with built-in action |
| `agent` | `createStep().then()` | AI agent invocation |
| `parallel` | `.parallel()` | Concurrent execution |
| `branch` | `.branch()` | Conditional routing |
| `foreach` | `.foreach()` | Iterate over arrays |
| `dowhile` | `.dowhile()` | Execute then check condition |
| `dountil` | `.dountil()` | Execute until condition met |
| `sleep` | `.sleep()` | Pause execution |
| `sleepUntil` | `.sleepUntil()` | Pause until specific time |
| `humanInput` | Suspend/Resume | Pause for human input/approval |
| `bail` | `bail()` | Graceful workflow termination |
| `map` | `.map()` | Transform/reshape data |
| `workflow` | Nested workflow | Compose workflows |

### Example Workflows

**Sequential Steps:**
```yaml
steps:
  - type: agent
    id: analyze
    agent: support
    input: ${input.message}
  
  - type: agent
    id: respond
    agent: support
    input: "Respond to: ${steps.analyze.output}"
```

**Parallel Execution:**
```yaml
steps:
  - type: parallel
    steps:
      - type: agent
        id: fetchA
        agent: research
        input: "Research A: ${input.topic}"
      - type: agent
        id: fetchB
        agent: research
        input: "Research B: ${input.topic}"
```

**Conditional Branching:**
```yaml
steps:
  - type: branch
    id: routeByPriority
    inputSchema:
      type: object
    outputSchema:
      type: object
    branches:
      - when:
          handler: condition
          inputSchema:
            type: object
          outputSchema:
            type: object
          params:
            operator: eq
            left: ${input.priority}
            right: "high"
        steps:
          - type: step
            id: escalate
            action: escalate
            params:
              reason: "High priority"
            inputSchema:
              type: object
            outputSchema:
              type: object
      - when:
          handler: condition
          inputSchema:
            type: object
          outputSchema:
            type: object
          params:
            operator: always
        steps:
          - type: agent
            id: handle
            agent: support
            input: ${input.message}
            inputSchema:
              type: object
            outputSchema:
              type: object
```

**Human-in-the-Loop:**
```yaml
steps:
  - type: agent
    id: draft
    agent: writer
    input: "Draft a response to: ${input.message}"
  
  - type: humanInput
    id: review
    prompt: "Please review and approve the draft response"
    inputType: confirm
  
  - type: agent
    id: send
    agent: support
    input: "Send the approved response: ${steps.draft.output}"
```

**Graceful Termination:**
```yaml
steps:
  - type: agent
    id: review
    agent: approver
    input: "Review this content: ${input.content}"
  
  - type: bail
    id: reject
    when: ${steps.review.output.approved == false}
    payload:
      reason: "Content rejected by reviewer"
      status: "rejected"
  
  - type: agent
    id: publish
    agent: publisher
    input: "Publish the approved content"
```

## CLI Usage

```bash
# Run workflow
maestro run --file workflow.yaml --input '{"key":"value"}'

# Compile and validate
maestro compile --file workflow.yaml

# List built-in tools
maestro tools list

# List built-in actions
maestro actions list

# Print JSON Schema
maestro schema --pretty
```

## RAG (Retrieval-Augmented Generation)

Maestro provides built-in RAG capabilities for semantic search and context retrieval:

### Vector Store Operations

```yaml
# Index documents for semantic search
- type: tool
  tool: vectorStore
  params:
    action: upsert
    indexName: knowledge-base
    documents:
      - id: doc-1
        text: "Company refund policy: Full refunds within 30 days..."
        metadata:
          category: policy
          source: handbook.pdf
      - id: doc-2
        text: "Support hours: Monday-Friday 9AM-6PM EST"
        metadata:
          category: support
          source: faq.md

# Query the vector store
- type: tool
  tool: vectorStore
  params:
    action: query
    indexName: knowledge-base
    query: "What are the support hours?"
    topK: 3
    filter:
      category: support
```

### RAG Pipeline

The RAG tool automates the retrieval and formatting process:

```yaml
steps:
  - type: tool
    id: context
    tool: rag
    params:
      query: "What is the refund policy?"
      indexName: knowledge-base
      maxChunks: 5
      minScore: 0.3
      format: context  # Options: text, json, context

  - type: agent
    id: answer
    agent: support
    input: |
      Based on the following context, answer the user's question:
      
      ${steps.context.output.context}
      
      User question: ${input.question}
```

### RAG Output Formats

- **text**: Returns concatenated text of all chunks
- **json**: Returns structured array of chunks with metadata
- **context**: Returns formatted context with relevance scores (default, best for LLMs)

## Configuration

You can configure the declarative mode in your workflow YAML:

```yaml
id: my-workflow
config:
  agentsDir: "./agents"           # Custom agents directory
  enabledTools: ["http", "memory"] # Only enable specific tools

inputSchema:
  type: object
  properties:
    message: { type: string }
```

## API Reference

### Core Functions

```typescript
import { 
  compileWorkflowDeclarative,
  runYamlWorkflow,
  loadAgents,
  listBuiltInTools,
  listBuiltInActions,
} from "@mhingston5/maestro";
```

### Example: Programmatic Usage

```typescript
import { compileWorkflowDeclarative } from "@mhingston5/maestro";

const { workflow, metadata } = await compileWorkflowDeclarative({
  workflowPath: "./workflow.yaml",
  agentsDir: "./agents",
});

const run = await workflow.createRun();
const result = await run.start({ 
  inputData: { message: "Hello!" } 
});

console.log("Agents used:", metadata.agents.map(a => a.name));
```

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────┐
│   YAML      │────▶│   Maestro    │────▶│   Mastra    │────▶│  Execution  │
│  Workflow   │     │   Compiler   │     │  Workflow   │     │   Engine    │
└─────────────┘     └──────────────┘     └─────────────┘     └─────────────┘
       │                    │                  │
       │                    │                  │
       ▼                    ▼                  ▼
agents/*.md            Built-in Tools    LLM APIs
(Markdown +            (http, memory,    (OpenAI, Claude,
 YAML frontmatter)     calculator, etc.)  etc.)
```

1. **Load**: Read YAML workflow and agent markdown files
2. **Parse**: Extract YAML frontmatter from agents, parse workflow spec
3. **Create**: Build Mastra instance with configured agents and tools
4. **Compile**: Transform YAML primitives to Mastra workflow
5. **Execute**: Run the compiled workflow

## Advanced Agent Configuration

Extend agent definitions in markdown frontmatter with Mastra's advanced features:

```markdown
---
name: advanced-agent
model: openai/gpt-4

# Model fallbacks for reliability
fallbacks:
  - model: anthropic/claude-3-opus-20240229
    maxRetries: 2
    enabled: true
  - model: google/gemini-pro
    maxRetries: 1
    enabled: true

# Voice synthesis for audio responses
voice:
  provider: openai
  model: tts-1
  voice: alloy

# Input/output processors
processors:
  input:
    - deduplicate
    - token-limit
  output:
    - sanitize
    - format-json

# Evaluation scorers per-agent
evals:
  - scorer: faithfulness
    threshold: 0.8
  - scorer: toxicity
    threshold: 0.1
---

Your agent instructions here...
```

## Memory System

Configure conversation memory with semantic recall and working memory:

```yaml
config:
  memory:
    storage: postgresql              # Storage backend
    connection: ${env.DATABASE_URL}  # Connection string
    semanticRecall:
      vectorStore: pgvector
      embedder: openai/text-embedding-3-small
      topK: 5
    workingMemory:
      enabled: true
      template: |
        # Customer Information
        - Customer ID: {{customerId}}
        - Issue History: {{issueHistory}}
steps:
  - type: agent
    id: chat
    agent: support
    memory: true                       # Enable conversation history
    threadId: ${input.sessionId}       # Thread for continuity
```

## MCP (Model Context Protocol) Integration

Connect to MCP servers for external tool access:

```yaml
config:
  mcpServers:
    brave-search:
      url: https://api.search.io/mcp
      apiKey: ${env.BRAVE_API_KEY}
    filesystem:
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/data"]

steps:
  - type: mcp
    id: search
    server: brave-search
    tool: web_search
    input:
      query: "Latest TypeScript features"
```

## Custom Tools

Define custom tools directly in YAML:

```yaml
tools:
  - id: sendInvoice
    description: Send invoice via Stripe
    inputSchema:
      type: object
      properties:
        amount: { type: number }
        email: { type: string }
      required: [amount, email]
    handler:
      file: ./tools/invoice.js       # Load from file
      export: sendInvoice

  - id: validateCoupon
    description: Validate a coupon code
    inputSchema:
      type: object
      properties:
        code: { type: string }
    handler:
      inline: "return { valid: input.code === 'SAVE20' };"

steps:
  - type: tool
    tool: sendInvoice
    params:
      amount: 100
      email: ${input.customerEmail}
```

## Evaluation Framework

Configure automated evaluation of agent outputs:

```yaml
# Global evals for all agents
evals:
  - scorer: faithfulness
    threshold: 0.8
  - scorer: toxicity
    threshold: 0.1

steps:
  - type: agent
    id: response
    agent: support
    evals:                        # Per-step evals
      - hallucination
      - answer-relevancy
    input: "Answer the user's question"
```

Available scorers: `faithfulness`, `toxicity`, `hallucination`, `answer-relevancy`, `context-precision`, `bias`

## Storage & State Persistence

Enable workflow state persistence for recovery and time travel:

```yaml
config:
  storage:
    backend: postgresql
    connection: ${env.DATABASE_URL}
  persistState: true               # Enable workflow state persistence

steps:
  - type: agent
    id: process
    stateKey: processingState      # Persist specific step output
```

## Streaming

Enable streaming responses for real-time output:

```yaml
steps:
  - type: agent
    id: writer
    agent: content
    stream: true                   # Enable streaming
    input: "Write a story about..."
```

## Complete Advanced Example

See `examples/advanced-features.yaml` for a complete workflow demonstrating all features:

```yaml
id: production-workflow
name: Production Support Workflow

config:
  memory:
    storage: postgresql
    connection: ${env.DATABASE_URL}
    semanticRecall:
      vectorStore: pgvector
      embedder: openai/text-embedding-3-small
  mcpServers:
    brave-search:
      url: https://api.search.io/mcp

evals:
  - scorer: faithfulness
    threshold: 0.8

tools:
  - id: sendNotification
    handler:
      file: ./tools/notifications.js

steps:
  - type: mcp
    server: brave-search
    tool: web_search
    input:
      query: ${input.query}
  
  - type: agent
    agent: advanced-support
    memory: true
    threadId: ${input.customerId}
    stream: true
    evals: [faithfulness, toxicity]
    input: |
      Query: ${input.query}
      Context: ${steps.web_search.output.results}
```

## Environment Variables

Maestro supports environment variable substitution in workflow YAML:

```yaml
config:
  memory:
    connection: ${env.DATABASE_URL}
  mcpServers:
    brave-search:
      apiKey: ${env.BRAVE_API_KEY}
```

Load from `.env` file in your workflow directory or pass via CLI:

```bash
export DATABASE_URL="postgresql://..."
maestro run --file workflow.yaml
```

## Agent Networks

Create multi-agent systems with intelligent routing:

```yaml
networks:
  - id: researchTeam
    name: Research Team
    description: Collaborative research network
    agents:
      - name: researcher
        description: Finds and analyzes information
        agent: research-agent
      - name: analyst
        description: Synthesizes findings
        agent: analyst-agent
      - name: writer
        description: Creates final output
        agent: writer-agent
    router: auto                    # auto, round-robin, or manual
    maxIterations: 10               # Limit routing iterations

steps:
  - type: network
    id: research
    network: researchTeam
    input: "Research the impact of AI on healthcare"
    output: researchResult
```

## Voice Integration

Add speech capabilities to your workflows:

```yaml
# Text-to-Speech
steps:
  - type: tts
    id: speak
    text: "Hello, welcome to our support line"
    voice: alloy
    provider: openai
    output: audioData

# Speech-to-Text
steps:
  - type: listen
    id: transcribe
    audio: ${input.audioFile}      # Path or base64 audio data
    provider: openai
    language: en-US
    output: transcription
```

## Document Processing

Process documents for RAG and knowledge extraction:

```yaml
# Chunk documents for embedding
steps:
  - type: documentChunk
    id: chunks
    document: ${input.document}
    strategy: sentence               # character, sentence, token, markdown, json
    chunkSize: 500
    chunkOverlap: 50
    output: documentChunks

# Extract metadata
steps:
  - type: documentMetadata
    id: metadata
    document: ${input.document}
    extractors:
      - title
      - summary
      - keywords
      - questions
    output: docMetadata

# Transform/clean documents
steps:
  - type: documentTransform
    id: clean
    document: ${input.htmlContent}
    transformations:
      - htmlToText
      - removeExtraWhitespace
      - normalizeNewlines
    output: cleanText
```

## Workflow Suspend & Resume

Create long-running workflows with human-in-the-loop:

```yaml
steps:
  - type: agent
    id: draft
    agent: writer
    input: "Draft a proposal for ${input.project}"

  - type: suspend
    id: review
    prompt: "Please review and approve the draft proposal"
    waitFor: approval                 # input, approval, or event
    timeout: 86400000                 # 24 hours in ms
    resumeSchema:
      type: object
      properties:
        approved:
          type: boolean
        feedback:
          type: string

  - type: agent
    id: finalize
    agent: writer
    input: |
      Finalize the proposal based on feedback:
      Approved: ${steps.review.output.data.approved}
      Feedback: ${steps.review.output.data.feedback}
```

Resume suspended workflows via CLI:

```bash
maestro resume --workflow-id <id> --step-id review --data '{"approved": true}'
```

## Updated Primitives Reference

| Primitive | Compiles To | Description |
|-----------|-------------|-------------|
| `agent` | `createStep().then()` | AI agent with memory, streaming, evals |
| `network` | Multi-agent loop | Agent network with routing |
| `tts` | Voice step | Text-to-speech synthesis |
| `listen` | Voice step | Speech-to-text transcription |
| `documentChunk` | Processing step | Split documents into chunks |
| `documentMetadata` | Processing step | Extract document metadata |
| `documentTransform` | Processing step | Clean/transform documents |
| `graphRag` | GraphRAG query | Knowledge graph RAG |
| `graphRagQuery` | Graph query | Query existing knowledge graph |
| `evals` | Scorer evaluation | Run evaluation scorer |
| `suspend` | `suspend()` | Pause for external input |
| `resume` | `resume()` | Resume suspended workflow |
| `mcp` | MCP client | Call MCP server tools |
| `tool` | Tool execution | Built-in or custom tools |
| `parallel` | `.parallel()` | Concurrent execution |
| `branch` | `.branch()` | Conditional routing |
| `foreach` | `.foreach()` | Iterate over arrays |
| `sleep` | `.sleep()` | Pause execution |
| `humanInput` | Suspend/Resume | Pause for human input |
| `bail` | `bail()` | Graceful termination |

## GraphRAG (Knowledge Graph RAG)

Build and query knowledge graphs for multi-hop reasoning:

```yaml
# Configure GraphRAG
graphRags:
  - id: knowledgeGraph
    dimension: 1536
    threshold: 0.7
    description: Main knowledge graph

steps:
  # Build graph and query in one step
  - type: graphRag
    id: graphSearch
    query: "What are the relationships between AI and healthcare?"
    chunks: ${steps.documentChunk.output.chunks}
    embeddings: ${steps.embeddings.output.vectors}
    topK: 10
    threshold: 0.7
    randomWalkSteps: 150
    restartProb: 0.15
    output: graphResults

  # Query existing graph
  - type: graphRagQuery
    id: followUpQuery
    graphId: knowledgeGraph
    query: "Find related concepts"
    queryEmbedding: ${input.queryEmbedding}
    topK: 5
    output: relatedConcepts
```

## Evaluation Step

Run automated evaluations as workflow steps:

```yaml
steps:
  # Evaluate agent output
  - type: evals
    id: qualityCheck
    scorer: faithfulness
    outputText: ${steps.agent.output.text}
    context: ${steps.rag.output.context}
    threshold: 0.8
    output: evaluation

  # Check for hallucinations
  - type: evals
    id: hallucinationCheck
    scorer: hallucination
    outputText: ${steps.agent.output.text}
    context: ${steps.rag.output.context}
    threshold: 0.2
    output: hallucinationScore

  # Evaluate completeness
  - type: evals
    id: completenessCheck
    scorer: completeness
    outputText: ${steps.agent.output.text}
    expected: ${input.expectedAnswer}
    threshold: 0.7
    output: completenessScore
```

Available scorers: `faithfulness`, `hallucination`, `answer-relevancy`, `toxicity`, `bias`, `context-precision`, `completeness`

## Cache Layer

Enable caching for better performance:

```yaml
config:
  cache:
    enabled: true
    backend: memory              # memory, redis, filesystem
    ttl: 3600                    # Default TTL in seconds
    maxSize: 104857600          # Max size in bytes (100MB)

# For Redis backend:
  cache:
    enabled: true
    backend: redis
    connection: redis://localhost:6379
    ttl: 7200
```

## Observability Integrations

Configure observability providers:

```yaml
config:
  observability:
    provider: langfuse           # langfuse, langsmith, braintrust, arize, datadog, posthog, sentry, laminar, otel
    apiKey: ${env.LANGFUSE_API_KEY}
    endpoint: https://cloud.langfuse.com
    projectId: my-project
    enabled: true
```

Supported providers:
- **Langfuse**: LLM observability platform
- **Langsmith**: LangChain observability
- **Braintrust**: Evaluation platform
- **Arize**: ML observability
- **Datadog**: Application monitoring
- **PostHog**: Product analytics
- **Sentry**: Error tracking
- **Laminar**: LLM observability
- **OTel**: OpenTelemetry standard

## Complete GraphRAG + Evals Example

See `examples/graphrag-eval-example.yaml` for a comprehensive workflow:

```yaml
id: research-workflow
name: Research with GraphRAG and Evaluation

graphRags:
  - id: knowledgeGraph
    dimension: 1536
    threshold: 0.7

evals:
  - scorer: faithfulness
    threshold: 0.8

config:
  cache:
    enabled: true
    backend: memory
  observability:
    provider: langfuse
    apiKey: ${env.LANGFUSE_API_KEY}

steps:
  - type: documentChunk
    id: chunks
    document: ${input.document}
    strategy: sentence
    chunkSize: 300

  - type: graphRag
    id: search
    query: ${input.query}
    chunks: "${steps.chunks.output.chunks}"
    embeddings: []
    topK: 10

  - type: agent
    id: answer
    agent: research-assistant
    input: "Answer based on context from previous steps"

  - type: evals
    id: check
    scorer: faithfulness
    outputText: ${steps.answer.output.text}
    context: "Context from GraphRAG search"
    threshold: 0.8
```

## Testing

Maestro includes comprehensive tests to ensure workflows compile and execute correctly:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/tests/real-e2e.test.ts
```

### Test Coverage

- **103 tests** covering all primitives and features
- **Real E2E tests** in `src/tests/real-e2e.test.ts` that execute actual workflows
- **Example validation** in `src/tests/examples-e2e.test.ts` ensuring examples parse correctly
- **Unit tests** for parser, compiler, templating, and validation

### Programmatic Testing

Test workflows programmatically using `runWorkflowFromString()`:

```typescript
import { runWorkflowFromString } from "@mhingston5/maestro";

const result = await runWorkflowFromString({
  yaml: `
id: test-workflow
inputSchema:
  type: object
outputSchema:
  type: object
steps:
  - type: step
    id: double
    action: doubleValue
    params:
      value: 5
    inputSchema:
      type: object
    outputSchema:
      type: object
`,
  registry: myRegistry,
  inputData: {},
});

console.log(result.steps.double.output); // { result: 10 }
```

### Examples

See the `examples/` directory for complete, working workflow examples:
- `examples/advanced-features.yaml` - MCP, memory, custom tools
- `examples/graphrag-eval-example.yaml` - GraphRAG and evaluation
- `examples/complete-workflow.yaml` - Full production workflow
- `examples/advanced-agent.md` - Agent configuration

## License

MIT
