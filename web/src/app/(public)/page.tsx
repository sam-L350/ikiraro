import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

const principles = [
	{
		title: "principleEvidenceTitle",
		body: "principleEvidenceBody",
		tone: "yellow",
	},
	{
		title: "principleFairTitle",
		body: "principleFairBody",
		tone: "sky",
	},
	{
		title: "principleOfflineTitle",
		body: "principleOfflineBody",
		tone: "orange",
	},
] as const;

export default function HomePage() {
	const { t } = useI18n();

	return (
		<>
			<section className="px-6 py-16 lg:px-12 lg:py-24">
				<div className="mx-auto flex max-w-5xl flex-col items-center text-center">
					<p className="font-meta text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
						{t("homeEyebrow")}
					</p>
					<h1 className="mt-6 max-w-4xl font-sans text-4xl font-semibold leading-tight text-balance text-fg sm:text-5xl lg:text-6xl">
						{t("homeHeadline")}
					</h1>
					<p className="mt-6 max-w-2xl font-sans text-lg font-semibold leading-relaxed text-fg">
						{t("homeLead")}
					</p>
					<Button asChild variant="sticker" className="mt-10">
						<Link to="/login">{t("signIn")}</Link>
					</Button>
				</div>
			</section>

			<section className="px-6 py-12 lg:px-12 lg:py-20">
				<div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:items-center">
					<h2 className="font-sans text-4xl font-semibold leading-tight text-balance text-fg sm:text-5xl">
						{t("homeSplitTitle")}
					</h2>
					<p className="font-sans text-lg font-medium leading-relaxed text-fg">
						{t("homeSplitBody")}
					</p>
				</div>
			</section>

			<section className="px-6 py-12 lg:px-12 lg:py-20">
				<div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-3">
					{principles.map((principle) => (
						<Card key={principle.title} variant="poster" tone={principle.tone}>
							<h3 className="font-sans text-3xl font-semibold text-balance">
								{t(principle.title)}
							</h3>
							<p className="mt-4 font-sans text-base font-semibold leading-relaxed">
								{t(principle.body)}
							</p>
						</Card>
					))}
				</div>
			</section>

			<section className="px-6 py-16 lg:px-12 lg:py-24">
				<div className="mx-auto flex max-w-3xl flex-col items-center text-center">
					<p className="font-sans text-2xl font-semibold text-fg">
						{t("homeClose")}
					</p>
					<Button asChild variant="sticker" className="mt-8">
						<Link to="/login">{t("signIn")}</Link>
					</Button>
				</div>
			</section>
		</>
	);
}
