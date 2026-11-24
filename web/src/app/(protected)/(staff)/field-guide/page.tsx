import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

const TIPS: MessageKey[] = [
	"fieldGuideReview",
	"fieldGuideOffline",
	"fieldGuideShared",
	"fieldGuideProblem",
	"fieldGuidePhoto",
];

export default function FieldGuidePage() {
	const { t } = useI18n();

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<style>{`@media print { nav, header, button { display: none !important; } }`}</style>
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("fieldGuideTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("fieldGuideSentence")}
				</p>
			</div>
			<ul className="flex flex-col gap-4">
				{TIPS.map((key) => (
					<li key={key} className="font-sans text-lg text-fg">
						{t(key)}
					</li>
				))}
			</ul>
			<Button
				type="button"
				variant="quiet"
				className="w-fit"
				onClick={() => window.print()}
			>
				{t("fieldGuidePrint")}
			</Button>
		</section>
	);
}
