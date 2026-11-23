/** A coarse device label. The full browser string is not stored. */
export function deviceType(): string {
	if (typeof navigator === "undefined") return "computer";
	const agent = navigator.userAgent;
	if (/iPad|Tablet/i.test(agent)) return "tablet";
	if (/Mobi|Android/i.test(agent)) return "phone";
	return "computer";
}

/** The learner's location when they allow it. A refusal sends the attempt without one. */
export function readGeo(): Promise<{ geoLat: number; geoLng: number } | null> {
	if (typeof navigator === "undefined" || !navigator.geolocation) {
		return Promise.resolve(null);
	}
	return new Promise((resolve) => {
		const timer = window.setTimeout(() => resolve(null), 2_500);
		navigator.geolocation.getCurrentPosition(
			(position) => {
				window.clearTimeout(timer);
				resolve({
					geoLat: position.coords.latitude,
					geoLng: position.coords.longitude,
				});
			},
			() => {
				window.clearTimeout(timer);
				resolve(null);
			},
			{ enableHighAccuracy: false, timeout: 2_000, maximumAge: 60_000 },
		);
	});
}
