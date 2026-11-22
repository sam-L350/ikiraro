import { beforeEach, describe, expect, test } from "bun:test";
import { TEST_WEB_ORIGIN, useTestEnv } from "../../../test/helpers";
import { createApp } from "../../app";
import { resolveRedirectTarget } from "./google";

describe("google oauth", () => {
	beforeEach(() => useTestEnv());

	test("redirect targets are restricted to the web app and allowed origins", () => {
		expect(resolveRedirectTarget(null)).toBe(TEST_WEB_ORIGIN);
		expect(resolveRedirectTarget("/dashboard")).toBe(
			`${TEST_WEB_ORIGIN}/dashboard`,
		);
		expect(resolveRedirectTarget("//evil.example.net")).toBe(TEST_WEB_ORIGIN);
		expect(resolveRedirectTarget("https://evil.example.net/phish")).toBe(
			TEST_WEB_ORIGIN,
		);
		expect(resolveRedirectTarget("https://preview.example.com/x")).toBe(
			"https://preview.example.com/x",
		);
	});

	test("the product app does not serve Google sign-in", async () => {
		const app = createApp();
		const response = await app.fetch(
			new Request("http://x/api/auth/google/login"),
		);
		expect(response.status).toBe(404);
	});
});
