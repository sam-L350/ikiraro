import { Link } from "react-router";
import { useI18n } from "@/lib/i18n";

export default function LearnerHomePage() {
	const { t } = useI18n();
	return (
		<section className="max-w-3xl">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg sm:text-5xl">
				{t("learnerTitle")}
			</h1>
			<p className="mt-6 font-sans text-lg font-medium leading-relaxed text-fg">
				{t("learnerBody")}
			</p>
			<Link
				className="mt-8 inline-flex font-sans text-sm font-semibold text-fg underline-offset-4 hover:underline"
				to="/profile"
			>
				{t("yourProfile")}
			</Link>
		</section>
	);
}
