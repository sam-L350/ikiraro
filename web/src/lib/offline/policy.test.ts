import { expect, test } from "bun:test";
import {
	isCourseRead,
	isMediaRequest,
	OUTBOX_BYTE_LIMIT,
	OUTBOX_ITEM_LIMIT,
	planDraftSync,
	queueFits,
	shouldCacheMedia,
} from "./policy";

test("a server decision stands, and two different drafts ask", () => {
	expect(
		planDraftSync({
			localId: "local",
			taskId: "task",
			evidenceType: "note",
			localNote: "Mine",
			submit: true,
			server: [
				{
					id: "server",
					taskId: "task",
					status: "pending",
					note: "Already sent",
				},
			],
		}).action,
	).toBe("server");
	expect(
		planDraftSync({
			localId: "local",
			taskId: "task",
			evidenceType: "note",
			localNote: "A longer note",
			submit: true,
			server: [
				{ id: "draft", taskId: "task", status: "draft", note: "A longer" },
			],
		}),
	).toEqual({
		action: "merge",
		serverId: "draft",
		note: "A longer note",
		submit: true,
	});
	expect(
		planDraftSync({
			localId: "local",
			taskId: "task",
			evidenceType: "note",
			localNote: "The pump photo",
			submit: true,
			server: [
				{ id: "draft", taskId: "task", status: "draft", note: "The well" },
			],
		}),
	).toEqual({
		action: "ask",
		serverId: "draft",
		serverNote: "The well",
	});
	expect(
		planDraftSync({
			localId: "local",
			taskId: "task",
			evidenceType: "photo",
			localNote: null,
			submit: true,
			server: [],
		}).action,
	).toBe("send");
});

test("the device refuses another item once the cap is full", () => {
	expect(queueFits(0, 0, 10)).toBe(true);
	expect(queueFits(OUTBOX_ITEM_LIMIT, 0, 10)).toBe(false);
	expect(queueFits(1, OUTBOX_BYTE_LIMIT - 5, 10)).toBe(false);
	expect(queueFits(0, 0, OUTBOX_BYTE_LIMIT + 1)).toBe(false);
});

test("course reads are cached and data saver skips pictures", () => {
	expect(isCourseRead("/api/v1/enrollments")).toBe(true);
	expect(isCourseRead("/api/v1/enrollments/abc")).toBe(true);
	expect(isCourseRead("/api/v1/catalog/abc")).toBe(true);
	expect(isCourseRead("/api/v1/points/statement")).toBe(false);
	expect(isCourseRead("/api/v1/evidence-queue")).toBe(false);
	expect(isMediaRequest("image", "application/json")).toBe(true);
	expect(shouldCacheMedia(true, "image", "image/jpeg")).toBe(false);
	expect(shouldCacheMedia(false, "image", "image/jpeg")).toBe(true);
	expect(shouldCacheMedia(true, "", "application/json")).toBe(true);
});
