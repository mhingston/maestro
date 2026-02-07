import { describe, expect, it } from "vitest";
import { fromInit, fromRequestContext, fromStep, literal } from "../mappings";

describe("mapping helpers", () => {
	it("builds step mapping", () => {
		expect(fromStep("stepA", "value")).toEqual({
			from: "step",
			stepId: "stepA",
			path: "value",
		});
	});

	it("builds init mapping", () => {
		expect(fromInit("seed")).toEqual({ from: "init", path: "seed" });
	});

	it("builds requestContext mapping", () => {
		expect(fromRequestContext("requestId")).toEqual({
			from: "requestContext",
			path: "requestId",
		});
	});

	it("builds literal mapping", () => {
		expect(literal(42)).toEqual({ value: 42 });
	});
});
