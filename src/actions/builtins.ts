import { z } from "zod";
import type { HandlerContext, StepHandler } from "../registry";

export type BuiltInAction = {
	description: string;
	inputSchema: z.ZodType;
	handler: StepHandler;
};

export const escalateAction: BuiltInAction = {
	description: "Escalate to human operator with reason and metadata",
	inputSchema: z.object({
		reason: z.string().describe("Reason for escalation"),
		customerId: z.string().optional(),
		priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
		metadata: z.record(z.unknown()).optional(),
	}),
	handler: async (ctx: HandlerContext, params) => {
		const { reason, customerId, priority, metadata } = params as {
			reason: string;
			customerId?: string;
			priority: "low" | "medium" | "high" | "critical";
			metadata?: Record<string, unknown>;
		};

		console.log("[ESCALATION] Priority:", priority, ", Reason:", reason);
		if (customerId) console.log("[ESCALATION] Customer:", customerId);
		if (metadata) console.log("[ESCALATION] Metadata:", metadata);

		// In a real implementation, this would:
		// - Send notification to Slack/email
		// - Create ticket in ticketing system
		// - Alert on-call personnel

		return {
			escalated: true,
			timestamp: new Date().toISOString(),
			reason,
			priority,
			customerId,
		};
	},
};

export const saveResponseAction: BuiltInAction = {
	description: "Save workflow output to a destination",
	inputSchema: z.object({
		response: z.unknown().describe("The response data to save"),
		destination: z.enum(["console", "file", "webhook"]).default("console"),
		path: z.string().optional().describe("File path or webhook URL"),
	}),
	handler: async (ctx: HandlerContext, params) => {
		const { response, destination, path } = params as {
			response: unknown;
			destination: "console" | "file" | "webhook";
			path?: string;
		};

		switch (destination) {
			case "console":
				console.log("[SAVE RESPONSE]", JSON.stringify(response, null, 2));
				break;
			case "file":
				if (!path) throw new Error("Path is required for 'file' destination");
				// In a real implementation, write to file
				console.log("[SAVE RESPONSE] Would write to file:", path);
				break;
			case "webhook":
				if (!path) throw new Error("URL is required for 'webhook' destination");
				// In a real implementation, POST to webhook
				console.log("[SAVE RESPONSE] Would POST to webhook:", path);
				break;
		}

		return {
			saved: true,
			destination,
			timestamp: new Date().toISOString(),
		};
	},
};

export const sendNotificationAction: BuiltInAction = {
	description: "Send notification to various channels",
	inputSchema: z.object({
		channel: z
			.enum(["slack", "email", "webhook", "console"])
			.default("console"),
		message: z.string().describe("The message to send"),
		recipient: z
			.string()
			.optional()
			.describe("Email, Slack channel, or webhook URL"),
		priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
	}),
	handler: async (ctx: HandlerContext, params) => {
		const { channel, message, recipient, priority } = params as {
			channel: "slack" | "email" | "webhook" | "console";
			message: string;
			recipient?: string;
			priority: "low" | "normal" | "high" | "urgent";
		};

		const prefix =
			priority === "urgent"
				? "🚨 URGENT: "
				: priority === "high"
					? "⚠️ HIGH: "
					: "";
		const fullMessage = prefix + message;

		switch (channel) {
			case "console":
				console.log("[NOTIFICATION]", fullMessage);
				break;
			case "slack":
				console.log("[SLACK ->", recipient ?? "#general", "]", fullMessage);
				break;
			case "email":
				console.log(
					"[EMAIL ->",
					recipient ?? "admin@example.com",
					"]",
					fullMessage,
				);
				break;
			case "webhook":
				console.log("[WEBHOOK ->", recipient ?? "N/A", "]", fullMessage);
				break;
		}

		return {
			sent: true,
			channel,
			priority,
			timestamp: new Date().toISOString(),
		};
	},
};

export const delayAction: BuiltInAction = {
	description: "Pause execution for a specified duration",
	inputSchema: z.object({
		ms: z
			.number()
			.min(0)
			.max(3600000)
			.default(1000)
			.describe("Milliseconds to delay"),
	}),
	handler: async (ctx: HandlerContext, params) => {
		const { ms } = params as { ms: number };

		await new Promise((resolve) => setTimeout(resolve, ms));

		return {
			delayed: true,
			duration: ms,
			timestamp: new Date().toISOString(),
		};
	},
};

export const conditionAction: BuiltInAction = {
	description: "Evaluate a simple conditional expression",
	inputSchema: z.object({
		operator: z.enum([
			"eq",
			"ne",
			"gt",
			"gte",
			"lt",
			"lte",
			"contains",
			"startsWith",
			"endsWith",
		]),
		left: z.unknown().describe("Left operand"),
		right: z.unknown().describe("Right operand"),
	}),
	handler: async (ctx: HandlerContext, params) => {
		const { operator, left, right } = params as {
			operator:
				| "eq"
				| "ne"
				| "gt"
				| "gte"
				| "lt"
				| "lte"
				| "contains"
				| "startsWith"
				| "endsWith";
			left: unknown;
			right: unknown;
		};

		let result = false;

		switch (operator) {
			case "eq":
				result = left === right;
				break;
			case "ne":
				result = left !== right;
				break;
			case "gt":
				result = (left as number) > (right as number);
				break;
			case "gte":
				result = (left as number) >= (right as number);
				break;
			case "lt":
				result = (left as number) < (right as number);
				break;
			case "lte":
				result = (left as number) <= (right as number);
				break;
			case "contains":
				result = String(left).includes(String(right));
				break;
			case "startsWith":
				result = String(left).startsWith(String(right));
				break;
			case "endsWith":
				result = String(left).endsWith(String(right));
				break;
		}

		return { result, operator, left, right };
	},
};

export const builtInActions: Record<string, BuiltInAction> = {
	escalate: escalateAction,
	saveResponse: saveResponseAction,
	sendNotification: sendNotificationAction,
	delay: delayAction,
	condition: conditionAction,
};

export function resolveBuiltInAction(name: string): StepHandler | undefined {
	const action = builtInActions[name];
	if (!action) return undefined;
	return action.handler;
}

export function listBuiltInActions(): string[] {
	return Object.keys(builtInActions);
}

export function getBuiltInActionSchema(name: string): z.ZodType | undefined {
	const action = builtInActions[name];
	if (!action) return undefined;
	return action.inputSchema;
}
