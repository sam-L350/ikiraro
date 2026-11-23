const STORAGE_KEY = "ikiraro.dataSaver";

type SaverStorage = {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
};

/** Pictures and sound files stay off until the learner asks. Default is on. */
export function readDataSaver(storage: SaverStorage = localStorage): boolean {
	try {
		return storage.getItem(STORAGE_KEY) !== "off";
	} catch {
		return true;
	}
}

export function writeDataSaver(
	on: boolean,
	storage: SaverStorage = localStorage,
): void {
	try {
		storage.setItem(STORAGE_KEY, on ? "on" : "off");
	} catch {
		// The choice still applies for this visit.
	}
}

/** A storage key is not fetched until data saver is off or the learner asks. */
export function mediaShouldLoad(dataSaver: boolean, asked: boolean): boolean {
	return !dataSaver || asked;
}
