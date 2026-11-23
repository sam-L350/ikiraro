import { beforeEach, describe, expect, test } from "bun:test";
import { useTestEnv } from "../../../test/helpers";
import { createApp } from "../../app";
import { parseAfricasTalkingSend, parseProviderCost } from "./africastalking";
import { kigaliDayWindow, pickDailyCap } from "./cap";
import { withFailover } from "./failover";
import { parseDeliveryReceipt, receiptEffect } from "./receipts";
import { chooseSmsSender } from "./select";
import { logSmsSender, SmsPermanentError, type SmsSendResult } from "./sender";

const accepted: SmsSendResult = {
	provider: "africastalking",
	providerMessageId: "ATXid_1",
	currency: "RWF",
	amount: 10,
};

describe("sms gateway", () => {
	beforeEach(() => useTestEnv());

	test("an accepted Africa's Talking response keeps the id and the franc cost", () => {
		expect(parseProviderCost("RWF 10.0000")).toEqual({
			currency: "RWF",
			amount: 10,
		});
		expect(
			parseAfricasTalkingSend(
				{
					SMSMessageData: {
						Recipients: [
							{
								statusCode: 101,
								messageId: "ATXid_1",
								cost: "RWF 10.0000",
							},
						],
					},
				},
				"africastalking",
			),
		).toEqual(accepted);
		expect(() =>
			parseAfricasTalkingSend(
				{ SMSMessageData: { Recipients: [{ statusCode: 403 }] } },
				"africastalking",
			),
		).toThrow(SmsPermanentError);
		expect(() =>
			parseAfricasTalkingSend(
				{ SMSMessageData: { Recipients: [{ statusCode: 500 }] } },
				"africastalking",
			),
		).toThrow("sms_retry");
	});

	test("a delivery report is read from a form body", () => {
		expect(
			parseDeliveryReceipt(
				"id=ATXid_1&status=Success&phoneNumber=%2B250788000000&networkCode=63510",
				"application/x-www-form-urlencoded",
			),
		).toEqual({
			id: "ATXid_1",
			status: "Success",
			failureReason: null,
		});
		expect(receiptEffect("Success")).toBe("delivered");
		expect(receiptEffect("Failed")).toBe("retry");
		expect(receiptEffect("Rejected")).toBe("final");
		expect(receiptEffect("Buffered")).toBe("pending");
	});

	test("the second gateway is used only when the first one cannot be reached", async () => {
		let fallbackCalls = 0;
		const fallback = {
			async send(): Promise<SmsSendResult> {
				fallbackCalls += 1;
				return { ...accepted, provider: "africastalking-fallback" };
			},
		};
		const down = {
			async send(): Promise<SmsSendResult> {
				throw new Error("sms_http_503");
			},
		};
		const rejected = {
			async send(): Promise<SmsSendResult> {
				throw new SmsPermanentError();
			},
		};
		const saved = await withFailover(down, fallback).send({
			to: "+250788000000",
			body: "hello",
		});
		expect(saved?.provider).toBe("africastalking-fallback");
		expect(fallbackCalls).toBe(1);
		await expect(
			withFailover(rejected, fallback).send({
				to: "+250788000000",
				body: "hello",
			}),
		).rejects.toBeInstanceOf(SmsPermanentError);
		expect(fallbackCalls).toBe(1);
	});

	test("tests keep the log adapter even when gateway keys are present", async () => {
		const account = {
			username: "sandbox",
			apiKey: "test-key",
			sandbox: true,
			provider: "africastalking",
		};
		expect(
			chooseSmsSender({
				appEnv: "test",
				primary: account,
				fallback: null,
			}),
		).toBe(logSmsSender);
		await expect(
			chooseSmsSender({
				appEnv: "production",
				primary: null,
				fallback: null,
			}).send({ to: "+250788000000", body: "hello" }),
		).rejects.toThrow("sms_not_configured");
	});

	test("the Kigali day rolls at midnight, not at UTC midnight", () => {
		expect(
			kigaliDayWindow(new Date("2026-11-23T21:30:00Z")).start.toISOString(),
		).toBe("2026-11-22T22:00:00.000Z");
		expect(
			kigaliDayWindow(new Date("2026-11-23T22:30:00Z")).start.toISOString(),
		).toBe("2026-11-23T22:00:00.000Z");
		expect(pickDailyCap([{ version: 1, value: 3 }], 8)).toBe(3);
		expect(pickDailyCap([{ version: 2, value: "8" }], 8)).toBe(8);
	});

	test("a delivery receipt without the secret is rejected", async () => {
		useTestEnv({ SMS_WEBHOOK_SECRET: undefined });
		const app = createApp();
		const url = "http://x/api/webhooks/sms/africastalking";
		const open = await app.fetch(
			new Request(url, { method: "POST", body: "id=1&status=Success" }),
		);
		expect(open.status).toBe(404);
		useTestEnv({ SMS_WEBHOOK_SECRET: "test-secret" });
		const denied = await app.fetch(
			new Request(url, { method: "POST", body: "id=1&status=Success" }),
		);
		expect(denied.status).toBe(401);
		const wrong = await app.fetch(
			new Request(url, {
				method: "POST",
				headers: { "x-ikiraro-sms-secret": "other" },
				body: "id=1&status=Success",
			}),
		);
		expect(wrong.status).toBe(401);
		const malformed = await app.fetch(
			new Request(url, {
				method: "POST",
				headers: { "x-ikiraro-sms-secret": "test-secret" },
				body: "not-a-report",
			}),
		);
		expect(malformed.status).toBe(400);
	});
});
