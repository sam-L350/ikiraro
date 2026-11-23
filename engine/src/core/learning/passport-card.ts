import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";

export type PassportCardCopy = {
	name: string;
	hours: string;
	level: string;
	badges: string[];
};

/** A one-page card a bank or employer can print. The QR is the live share link. */
export async function buildPassportCard(input: {
	copy: PassportCardCopy;
	url: string;
}): Promise<{ pdfBase64: string; imageSvg: string }> {
	const png = await QRCode.toBuffer(input.url, {
		type: "png",
		margin: 1,
		width: 280,
		errorCorrectionLevel: "M",
	});
	const [pdfBase64, imageSvg] = await Promise.all([
		renderPdf(input.copy, png),
		Promise.resolve(renderSvg(input.copy, png)),
	]);
	return { pdfBase64, imageSvg };
}

async function renderPdf(copy: PassportCardCopy, png: Buffer): Promise<string> {
	const pdf = await PDFDocument.create();
	const page = pdf.addPage([420, 595]);
	const font = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
	const image = await pdf.embedPng(png);
	page.drawRectangle({
		x: 0,
		y: 0,
		width: 420,
		height: 595,
		color: rgb(0.957, 0.941, 0.925),
	});
	page.drawText(pdfSafe(copy.name), {
		x: 36,
		y: 540,
		size: 22,
		font: bold,
		color: rgb(0.145, 0.129, 0.133),
	});
	page.drawText(pdfSafe(copy.hours), {
		x: 36,
		y: 508,
		size: 12,
		font,
		color: rgb(0.145, 0.129, 0.133),
	});
	page.drawText(pdfSafe(copy.level), {
		x: 36,
		y: 488,
		size: 12,
		font,
		color: rgb(0.145, 0.129, 0.133),
	});
	let y = 456;
	for (const badge of copy.badges.slice(0, 6)) {
		page.drawText(pdfSafe(badge), {
			x: 36,
			y,
			size: 12,
			font,
			color: rgb(0.145, 0.129, 0.133),
		});
		y -= 20;
	}
	page.drawImage(image, { x: 110, y: 72, width: 200, height: 200 });
	page.drawText("Ikiraro", {
		x: 36,
		y: 36,
		size: 11,
		font: bold,
		color: rgb(0.145, 0.129, 0.133),
	});
	const bytes = await pdf.save();
	return Buffer.from(bytes).toString("base64");
}

function renderSvg(copy: PassportCardCopy, png: Buffer): string {
	const lines = [copy.hours, copy.level, ...copy.badges.slice(0, 6)];
	const text = lines
		.map(
			(line, index) =>
				`<text x="36" y="${150 + index * 28}" font-family="sans-serif" font-size="18" fill="#252122">${xml(line)}</text>`,
		)
		.join("");
	const href = `data:image/png;base64,${png.toString("base64")}`;
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="840" viewBox="0 0 600 840">
<rect width="600" height="840" fill="#f4f0ec"/>
<text x="36" y="96" font-family="sans-serif" font-size="36" font-weight="700" fill="#252122">${xml(copy.name)}</text>
${text}
<image href="${href}" x="160" y="500" width="280" height="280"/>
<text x="36" y="800" font-family="sans-serif" font-size="16" font-weight="700" fill="#252122">Ikiraro</text>
</svg>`;
}

function pdfSafe(value: string): string {
	return value.replace(/[^\x20-\x7E]/g, "").slice(0, 180);
}

function xml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}
