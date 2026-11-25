import type { MessageKey } from "@/lib/i18n/messages";

export function eventTitle(name: string): MessageKey | null {
	switch (name) {
		case "submission.created":
			return "eventSubmissionReceived";
		case "submission.approved":
			return "eventReviewApproved";
		case "submission.needs_revision":
			return "eventRevision";
		case "submission.rejected":
			return "eventReviewRejected";
		case "badge.awarded":
			return "eventBadge";
		case "points.adjusted":
			return "eventPoints";
		case "grant.decided":
			return "eventGrant";
		case "follow_up.due":
			return "eventFollowUp";
		case "learner.stalled":
			return "eventStalled";
		case "announcement.posted":
			return "eventAnnouncement";
		case "submission.escalated":
			return "eventEscalated";
		case "recipient.dormant":
			return "eventDormant";
		default:
			return null;
	}
}
