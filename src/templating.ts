type TemplateContext = {
	inputData: unknown;
	steps: Record<string, unknown>;
	initData: unknown;
	requestContext: Record<string, unknown>;
};

type PathExpression = {
	$path?: string;
	$jsonPath?: string;
};

function getPathValue(source: unknown, path: string): unknown {
	if (!path) return source;
	const parts = path.split(".");
	let current: unknown = source;
	for (const part of parts) {
		if (!current || typeof current !== "object") {
			return undefined;
		}
		const value = (current as Record<string, unknown>)[part];
		if (value === undefined) return undefined;
		current = value;
	}
	return current;
}

function resolveTemplateString(
	value: string,
	context: TemplateContext,
): string {
	const pattern = /\$\{([^}]+)\}/g;
	return value.replace(pattern, (_match, expr) => {
		const trimmed = String(expr).trim();
		const [root, ...rest] = trimmed.split(".");
		const path = rest.join(".");

		const resolveWith = (source: unknown) => {
			const resolved = getPathValue(source, path);
			if (resolved === undefined) {
				throw new Error(
					`Template resolution failed for ${root}.${path || ""}`.trim(),
				);
			}
			return String(resolved);
		};

		switch (root) {
			case "input":
				return resolveWith(context.inputData);
			case "steps":
				return resolveWith(context.steps);
			case "init":
				return resolveWith(context.initData);
			case "requestContext":
				return resolveWith(context.requestContext);
			default:
				throw new Error(`Unknown template root: ${root}`);
		}
	});
}

function normalizePathExpression(expression: string): string {
	const trimmed = expression.trim();
	if (trimmed.startsWith("$.")) return trimmed.slice(2);
	if (trimmed.startsWith("$")) return trimmed.slice(1);
	return trimmed;
}

function resolvePathExpression(
	expression: string,
	context: TemplateContext,
): unknown {
	const normalized = normalizePathExpression(expression);
	const [root, ...rest] = normalized.split(".");
	const path = rest.join(".");

	const resolveWith = (source: unknown) => {
		const resolved = getPathValue(source, path);
		if (resolved === undefined) {
			throw new Error(
				`Template resolution failed for ${root}.${path || ""}`.trim(),
			);
		}
		return resolved;
	};

	switch (root) {
		case "input":
			return resolveWith(context.inputData);
		case "steps":
			return resolveWith(context.steps);
		case "init":
			return resolveWith(context.initData);
		case "requestContext":
			return resolveWith(context.requestContext);
		default:
			throw new Error(`Unknown template root: ${root}`);
	}
}

function isPathExpression(
	value: Record<string, unknown>,
): value is PathExpression {
	const keys = Object.keys(value);
	if (keys.length !== 1) return false;
	return keys[0] === "$path" || keys[0] === "$jsonPath";
}

export function resolveTemplates(
	value: unknown,
	context: TemplateContext,
): unknown {
	if (typeof value === "string") {
		return resolveTemplateString(value, context);
	}

	if (Array.isArray(value)) {
		return value.map((item) => resolveTemplates(item, context));
	}

	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (isPathExpression(record)) {
			const expression = record.$path ?? record.$jsonPath;
			if (typeof expression !== "string") {
				throw new Error("Path expression must be a string.");
			}
			return resolvePathExpression(expression, context);
		}
		const result: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(record)) {
			result[key] = resolveTemplates(entry, context);
		}
		return result;
	}

	return value;
}
