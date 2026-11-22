import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { en, type MessageKey, rw } from "./messages";

export type Locale = "en" | "rw";

const STORAGE_KEY = "ikiraro.locale";

const dictionaries = { en, rw } as const;

function readLocale(): Locale {
	try {
		return localStorage.getItem(STORAGE_KEY) === "rw" ? "rw" : "en";
	} catch {
		return "en";
	}
}

function fill(template: string, vars?: Record<string, string>): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
		return vars[name] ?? "";
	});
}

type I18nValue = {
	locale: Locale;
	setLocale: (locale: Locale) => void;
	t: (key: MessageKey, vars?: Record<string, string>) => string;
};

const I18nContext = createContext<I18nValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
	const [locale, setLocaleState] = useState<Locale>(readLocale);

	const setLocale = useCallback((next: Locale) => {
		setLocaleState(next);
		document.documentElement.lang = next === "rw" ? "rw" : "en";
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// The choice still applies for this visit.
		}
	}, []);

	const value = useMemo<I18nValue>(
		() => ({
			locale,
			setLocale,
			t: (key, vars) => fill(dictionaries[locale][key], vars),
		}),
		[locale, setLocale],
	);

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
	const value = useContext(I18nContext);
	if (!value) throw new Error("useI18n must be used within I18nProvider");
	return value;
}
