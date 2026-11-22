import { type Locale, useI18n } from "@/lib/i18n";

export function LanguageSwitch() {
	const { locale, setLocale, t } = useI18n();
	const options: { id: Locale; label: string }[] = [
		{ id: "en", label: t("english") },
		{ id: "rw", label: t("kinyarwanda") },
	];

	return (
		<fieldset className="flex items-center gap-3 border-0 p-0">
			<legend className="sr-only">{t("language")}</legend>
			{options.map((option) => (
				<button
					key={option.id}
					type="button"
					onClick={() => setLocale(option.id)}
					aria-pressed={locale === option.id}
					className={
						locale === option.id
							? "inline-flex h-11 items-center font-meta text-xs font-semibold uppercase tracking-wide text-fg"
							: "inline-flex h-11 items-center font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted hover:text-ink"
					}
				>
					{option.label}
				</button>
			))}
		</fieldset>
	);
}
