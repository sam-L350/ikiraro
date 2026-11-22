import { useI18n } from "@/lib/i18n";

export function SharedComputerCheck({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	const { t } = useI18n();
	return (
		<label className="mt-6 flex items-start gap-3">
			<input
				type="checkbox"
				className="mt-1 size-5 accent-ink"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<span>
				<span className="block font-sans font-semibold text-fg">
					{t("sharedComputer")}
				</span>
				<span className="mt-1 block font-sans text-sm font-medium text-fg">
					{t("sharedComputerBody")}
				</span>
			</span>
		</label>
	);
}
