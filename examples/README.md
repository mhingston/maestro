# Maestro Examples

These YAML files demonstrate Maestro's features and capabilities. They are **fully valid** examples that pass schema validation.

## Important Note

⚠️ **These examples demonstrate syntax and structure.** While they pass schema validation and can be parsed, running them requires additional setup:

### What's Required to Run These Examples

1. **Agent Definitions** - Create agent files in `agents/` directory
2. **Environment Variables** - Set required env vars (DATABASE_URL, API keys, etc.)
3. **External Services** - Configure PostgreSQL, MCP servers, observability providers
4. **Custom Tools** - Implement tool handlers referenced in the examples

### Quick Test

To validate an example (checks syntax only):

```bash
maestro compile --file examples/advanced-features.yaml
```

## Available Examples

### 1. `advanced-features.yaml`
Demonstrates syntax for:
- MCP (Model Context Protocol) integration
- Memory configuration
- Custom tools definition
- Evaluation scorers
- Agent tool usage

### 2. `graphrag-eval-example.yaml`
Demonstrates syntax for:
- GraphRAG configuration
- Automated evaluation steps
- Document processing
- Cache configuration
- Observability integration

### 3. `complete-workflow.yaml`
Demonstrates syntax for:
- Agent network definition
- Voice integration (TTS)
- Suspend/resume for approvals
- Document processing
- Complex step sequences

### 4. `advanced-agent.md`
Demonstrates syntax for:
- Agent configuration in markdown
- Model fallbacks
- Voice synthesis config
- Input/output processors
- Evaluation scorers

## See Also

- Main README.md for full documentation
- `src/tests/examples-e2e.test.ts` - Tests that validate example syntax
