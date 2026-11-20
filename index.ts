import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

type Window = { label: string; usedPercent: number; resetsAt?: Date };
type Report = { name: string; plan?: string; windows: Window[]; error?: string };

async function token(ctx: ExtensionContext, provider: string): Promise<string> {
	const auth = await ctx.modelRegistry.getProviderAuth(provider).catch(() => undefined);
	if (!auth?.auth.apiKey) throw new Error(`login missing or expired (run /login ${provider})`);
	return auth.auth.apiKey;
}

async function getJson(url: string, headers: Record<string, string>): Promise<any> {
	const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

async function claude(ctx: ExtensionContext): Promise<Report> {
	const data = await getJson("https://api.anthropic.com/api/oauth/usage", {
		Authorization: `Bearer ${await token(ctx, "anthropic")}`,
		"anthropic-beta": "oauth-2025-04-20",
	});
	const labels: Record<string, string> = {
		five_hour: "5h",
		seven_day: "Week",
		seven_day_opus: "Week (Opus)",
		seven_day_sonnet: "Week (Sonnet)",
	};
	const windows = Object.entries(labels)
		.filter(([key]) => data[key])
		.map(([key, label]) => ({
			label,
			usedPercent: data[key].utilization ?? 0,
			resetsAt: data[key].resets_at ? new Date(data[key].resets_at) : undefined,
		}));
	return { name: "Claude Code", windows };
}

async function codex(ctx: ExtensionContext): Promise<Report> {
	const jwt = await token(ctx, "openai-codex");
	const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
	const accountId = claims["https://api.openai.com/auth"]?.chatgpt_account_id;
	const data = await getJson("https://chatgpt.com/backend-api/wham/usage", {
		Authorization: `Bearer ${jwt}`,
		...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
	});
	const win = (label: string, w: any): Window[] =>
		w ? [{ label, usedPercent: w.used_percent, resetsAt: new Date(w.reset_at * 1000) }] : [];
	return {
		name: "OpenAI Codex",
		plan: data.plan_type,
		windows: [...win("5h", data.rate_limit?.primary_window), ...win("Week", data.rate_limit?.secondary_window)],
	};
}

function timeUntil(date: Date): string {
	const mins = Math.max(0, Math.round((date.getTime() - Date.now()) / 60_000));
	if (mins < 60) return `${mins}m`;
	if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
	return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
}

function bar(usedPercent: number, width: number): { filled: string; empty: string } {
	const left = Math.max(0, Math.min(100, 100 - usedPercent));
	const n = Math.round((left / 100) * width);
	return { filled: "█".repeat(n), empty: "░".repeat(width - n) };
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("usage", {
		description: "Show Claude Code and OpenAI Codex subscription usage",
		handler: async (_args, ctx) => {
			const reports = await Promise.all(
				[claude, codex].map((fn, i) =>
					fn(ctx).catch((e: Error): Report => ({
						name: i === 0 ? "Claude Code" : "OpenAI Codex",
						windows: [],
						error: e.message,
					})),
				),
			);

			if (!ctx.hasUI) {
				for (const r of reports) {
					const detail = r.error ?? r.windows.map((w) => `${w.label} ${100 - w.usedPercent}% left`).join(", ");
					console.log(`${r.name}: ${detail}`);
				}
				return;
			}

			await ctx.ui.custom<void>((_tui, theme, keybindings, done) => ({
				render(width: number): string[] {
					const barWidth = Math.max(10, Math.min(40, width - 40));
					const lines: string[] = [""];
					for (const r of reports) {
						const plan = r.plan ? theme.fg("dim", ` ${r.plan}`) : "";
						lines.push(` ${theme.bold(theme.fg("accent", r.name))}${plan}`);
						if (r.error) lines.push(`   ${theme.fg("error", r.error)}`);
						for (const w of r.windows) {
							const left = Math.round(100 - w.usedPercent);
							const color = left > 50 ? "success" : left > 20 ? "warning" : "error";
							const { filled, empty } = bar(w.usedPercent, barWidth);
							const reset = w.resetsAt ? theme.fg("dim", `  resets in ${timeUntil(w.resetsAt)}`) : "";
							lines.push(
								`   ${w.label.padEnd(14)}${theme.fg(color, filled)}${theme.fg("dim", empty)} ${theme.fg(color, `${left}% left`.padStart(9))}${reset}`,
							);
						}
						lines.push("");
					}
					return lines.map((l) => truncateToWidth(l, width));
				},
				handleInput(data: string) {
					if (keybindings.matches(data, "tui.select.cancel") || keybindings.matches(data, "tui.select.confirm")) done();
				},
				invalidate() {},
			}));
		},
	});
}
