import { parseDocument } from "yaml";
import type { WorkflowSpec } from "./spec";
import { WorkflowSpecSchema } from "./spec";

export class YamlSpecError extends Error {
	line?: number;
	column?: number;
	constructor(message: string, line?: number, column?: number) {
		super(message);
		this.name = "YamlSpecError";
		this.line = line;
		this.column = column;
	}
}

export function parseWorkflowYaml(yamlText: string): WorkflowSpec {
	const doc = parseDocument(yamlText, { prettyErrors: true });
	if (doc.errors.length > 0) {
		const first = doc.errors[0];
		const line = first.linePos?.[0]?.line;
		const col = first.linePos?.[0]?.col;
		throw new YamlSpecError(first.message, line, col);
	}

	const data = doc.toJSON();
	const parsed = WorkflowSpecSchema.safeParse(data);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw new YamlSpecError(
			`Spec validation failed: ${issue.path.join(".")} ${issue.message}`,
		);
	}

	return parsed.data;
}
