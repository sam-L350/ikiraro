import { getRequestContext } from "../api/context";

export function clientIp(): string {
	const header = getRequestContext().request.headers.get("x-forwarded-for");
	const first = header?.split(",")[0]?.trim();
	return first && first.length > 0 ? first : "local";
}
