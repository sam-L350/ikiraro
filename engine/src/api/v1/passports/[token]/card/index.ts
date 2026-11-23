import { env } from "../../../../../config/env";
import { buildPassportCard } from "../../../../../core/learning/passport-card";
import { readPublicPassport } from "../../../../../core/learning/share";
import { db } from "../../../../../db";

/** A printable card for the live link, as a PDF and an image. */
export async function getPublicPassportCard(input: {
	token: string;
	locale?: "en" | "rw";
}): Promise<{ pdfBase64: string; imageSvg: string }> {
	const passport = await readPublicPassport(db, input.token);
	const locale = input.locale === "rw" ? "rw" : "en";
	const hours =
		passport.verifiedMinutes === null
			? ""
			: passport.verifiedMinutes <= 0
				? locale === "rw"
					? "Nta masaha yemejwe."
					: "No verified hours yet."
				: locale === "rw"
					? `Iminota ${passport.verifiedMinutes} yemejwe.`
					: `${passport.verifiedMinutes} verified minutes.`;
	const level =
		passport.level === null
			? locale === "rw"
				? "Nta rwego rw'ikirango."
				: "No badge level yet."
			: locale === "rw"
				? `Urwego ${passport.level}`
				: `Level ${passport.level}`;
	const badges = passport.badges.map((badge) =>
		locale === "rw" && badge.titleRw.trim() ? badge.titleRw : badge.titleEn,
	);
	return buildPassportCard({
		copy: {
			name: passport.name || (locale === "rw" ? "Umunyeshuri" : "A learner"),
			hours,
			level,
			badges,
		},
		url: `${env.webUrl}/p/${input.token}`,
	});
}
