export type MappingSource =
	| { from: "step"; stepId: string; path: string }
	| { from: "init"; path: string }
	| { from: "requestContext"; path: string }
	| { value: unknown };

export type MappingConfig = Record<string, MappingSource>;

export function fromStep(stepId: string, path: string): MappingSource {
	return { from: "step", stepId, path };
}

export function fromInit(path: string): MappingSource {
	return { from: "init", path };
}

export function fromRequestContext(path: string): MappingSource {
	return { from: "requestContext", path };
}

export function literal(value: unknown): MappingSource {
	return { value };
}
