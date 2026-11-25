/**
 * Stores the production secrets on the Hubfly space container.
 *
 *   make deploy-secrets
 *
 * Reads `engine/.env.production` (git-ignored) and the container bound in
 * `hubfly.build.json`, and saves every value as a secret variable of that
 * container, so secrets never enter the image or a committed file. Hubfly
 * space restarts the container with the new values. `hubfly.build.json` lists
 * the same names with `"from": "cloud"`, which makes `make deploy` keep them.
 *
 * Needs a Hubfly space access token in `HUBFLY_TOKEN`, or in the file
 * `~/.hubfly/api-token` (console: Settings, Access tokens).
 */

import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

interface ContainerVariable {
	readonly key: string;
	/** Hubfly space never returns the value of a secret. */
	readonly value?: string;
	readonly isSecret: boolean;
	readonly scope?: "runtime" | "build" | "both";
}

const root = resolve(import.meta.dir, "../..");
const secretsPath = resolve(root, "engine/.env.production");
const manifestPath = resolve(root, "hubfly.build.json");
const origin = (
	process.env.HUBFLY_API_URL ?? "https://api.hubfly.space"
).replace(/\/+$/, "");

function fail(message: string): never {
	console.error(`deploy-secrets: ${message}`);
	process.exit(1);
}

async function readToken(): Promise<string> {
	const fromEnv = process.env.HUBFLY_TOKEN?.trim();
	if (fromEnv) return fromEnv;
	const file = Bun.file(resolve(homedir(), ".hubfly/api-token"));
	if (await file.exists()) {
		const token = (await file.text()).trim();
		if (token) return token;
	}
	return fail(
		"set HUBFLY_TOKEN, or save an access token in ~/.hubfly/api-token.",
	);
}

async function request<T>(
	token: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	const response = await fetch(`${origin}/api/v1${path}`, {
		method,
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/json",
			"user-agent": "hubfly-deploy-secrets",
			...(body === undefined ? {} : { "content-type": "application/json" }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const payload = (await response.json().catch(() => null)) as {
		ok?: boolean;
		data?: T;
		error?: { code?: string; message?: string };
	} | null;
	if (!response.ok || !payload?.ok) {
		const reason =
			payload?.error?.message ?? payload?.error?.code ?? response.statusText;
		return fail(`${method} ${path} failed (${response.status}): ${reason}`);
	}
	return payload.data as T;
}

const secretsFile = Bun.file(secretsPath);
if (!(await secretsFile.exists())) {
	fail(
		"engine/.env.production is missing. Copy engine/.env.production.example and fill it in.",
	);
}
const secrets = Object.entries(parseEnv(await secretsFile.text())).filter(
	(entry): entry is [string, string] =>
		typeof entry[1] === "string" && entry[1] !== "",
);
if (secrets.length === 0) fail("engine/.env.production holds no values.");

const manifestFile = Bun.file(manifestPath);
if (!(await manifestFile.exists())) fail("hubfly.build.json is missing.");
const manifest = await manifestFile.json();
const projectId: unknown = manifest?.project?.id;
const containerId: unknown = manifest?.container?.id;
if (
	typeof projectId !== "string" ||
	typeof containerId !== "string" ||
	!projectId ||
	!containerId
) {
	fail(
		"hubfly.build.json is not bound to a container yet. Run `make deploy` once to create it.",
	);
}

const token = await readToken();
const path = `/projects/${encodeURIComponent(projectId)}/containers/${encodeURIComponent(containerId)}`;

// The update replaces the container's whole set of variables, and secret
// values cannot be read back, so every secret it has must be in the file.
const current = (
	await request<{ environmentVariables?: ContainerVariable[] }>(
		token,
		"GET",
		path,
	)
).environmentVariables;
const names = new Set(secrets.map(([key]) => key));
const unknown = (current ?? []).filter(
	(variable) => variable.isSecret && !names.has(variable.key),
);
if (unknown.length > 0) {
	fail(
		`the container has secrets that engine/.env.production does not name: ${unknown
			.map((variable) => variable.key)
			.join(
				", ",
			)}. Add them to the file, or remove them in the Hubfly space console.`,
	);
}

const result = await request<{ mode?: string }>(
	token,
	"PATCH",
	`${path}/config`,
	{
		environmentVariables: [
			...(current ?? [])
				.filter((variable) => !variable.isSecret && !names.has(variable.key))
				.map(({ key, value, scope }) => ({
					key,
					value: value ?? "",
					isSecret: false,
					...(scope ? { scope } : {}),
				})),
			...secrets.map(([key, value]) => ({
				key,
				value,
				isSecret: true,
				scope: "runtime",
			})),
		],
	},
);

console.log(
	`deploy-secrets: stored ${[...names].join(", ")} on container ${containerId}` +
		` (${result.mode ?? "applied"}).`,
);
