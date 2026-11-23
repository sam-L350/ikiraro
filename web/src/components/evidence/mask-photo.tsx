import { type PointerEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import {
	coverColor,
	type MaskRect,
	maskRect,
	scaleRect,
} from "@/lib/media/mask";

const PREVIEW_WIDTH = 640;

function paint(
	node: HTMLCanvasElement,
	image: ImageBitmap,
	covers: readonly MaskRect[],
) {
	const width = Math.min(PREVIEW_WIDTH, image.width);
	const height = Math.max(1, Math.round((image.height * width) / image.width));
	node.width = width;
	node.height = height;
	const context = node.getContext("2d");
	if (!context) return;
	context.drawImage(image, 0, 0, width, height);
	const ink = coverColor();
	context.save();
	context.fillStyle = ink;
	context.globalAlpha = 0.92;
	for (const cover of covers) {
		context.fillRect(cover.x, cover.y, cover.width, cover.height);
	}
	context.restore();
}

/**
 * Cover a name or an id before the photo is uploaded.
 * The original file is not sent. The cover is part of the bytes.
 */
export function MaskPhotoDialog({
	file,
	onClose,
	onUse,
}: {
	file: File;
	onClose: () => void;
	onUse: (file: File) => void;
}) {
	const { t } = useI18n();
	const dialog = useRef<HTMLDialogElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const bitmap = useRef<ImageBitmap | null>(null);
	const dragging = useRef<{ x: number; y: number } | null>(null);
	const [rects, setRects] = useState<MaskRect[]>([]);
	const [draft, setDraft] = useState<MaskRect | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		const current = dialog.current;
		current?.showModal();
		let cancelled = false;
		void createImageBitmap(file)
			.then((image) => {
				if (cancelled) {
					image.close();
					return;
				}
				bitmap.current = image;
				const node = canvas.current;
				if (node) paint(node, image, []);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
			bitmap.current?.close();
			bitmap.current = null;
		};
	}, [file]);

	useEffect(() => {
		const image = bitmap.current;
		const node = canvas.current;
		if (!image || !node) return;
		paint(node, image, draft ? [...rects, draft] : rects);
	}, [rects, draft]);

	function point(event: PointerEvent<HTMLCanvasElement>): {
		x: number;
		y: number;
	} {
		const node = canvas.current;
		if (!node) return { x: 0, y: 0 };
		const box = node.getBoundingClientRect();
		const x =
			box.width === 0
				? 0
				: ((event.clientX - box.left) / box.width) * node.width;
		const y =
			box.height === 0
				? 0
				: ((event.clientY - box.top) / box.height) * node.height;
		return { x, y };
	}

	async function confirmPhoto() {
		const image = bitmap.current;
		const node = canvas.current;
		if (!image || !node || rects.length === 0) {
			onUse(file);
			return;
		}
		const out = document.createElement("canvas");
		out.width = image.width;
		out.height = image.height;
		const context = out.getContext("2d");
		if (!context) {
			setFailed(true);
			return;
		}
		context.drawImage(image, 0, 0);
		context.fillStyle = coverColor();
		for (const cover of rects) {
			const scaled = scaleRect(
				cover,
				{ width: node.width, height: node.height },
				{ width: image.width, height: image.height },
			);
			context.fillRect(scaled.x, scaled.y, scaled.width, scaled.height);
		}
		const blob = await new Promise<Blob | null>((resolve) => {
			out.toBlob((next) => resolve(next), "image/jpeg", 0.92);
		});
		if (!blob) {
			setFailed(true);
			return;
		}
		onUse(new File([blob], "covered.jpg", { type: "image/jpeg" }));
	}

	return (
		<dialog
			ref={dialog}
			className="w-[min(100%,40rem)] rounded-[28px] border border-line bg-canvas p-8 text-fg backdrop:bg-ink/40"
			onClose={onClose}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<div className="flex flex-col gap-4">
				<h2 className="font-sans text-2xl font-semibold text-fg">
					{t("maskTitle")}
				</h2>
				<p className="font-sans text-lg text-fg">{t("maskSentence")}</p>
				{failed ? (
					<p className="font-sans text-lg text-fg">{t("tryAgain")}</p>
				) : (
					<canvas
						ref={canvas}
						className="w-full touch-none rounded-md bg-surface"
						aria-label={t("maskTitle")}
						onPointerDown={(event) => {
							event.currentTarget.setPointerCapture(event.pointerId);
							dragging.current = point(event);
						}}
						onPointerMove={(event) => {
							const start = dragging.current;
							const image = bitmap.current;
							const node = canvas.current;
							if (!start || !image || !node) return;
							setDraft(
								maskRect(start, point(event), {
									width: node.width,
									height: node.height,
								}),
							);
						}}
						onPointerUp={(event) => {
							const start = dragging.current;
							const node = canvas.current;
							dragging.current = null;
							setDraft(null);
							if (!start || !node) return;
							const next = maskRect(start, point(event), {
								width: node.width,
								height: node.height,
							});
							if (!next) return;
							setRects((current) => [...current, next]);
						}}
					/>
				)}
				<div className="flex flex-wrap gap-3">
					<Button
						type="button"
						variant="sticker"
						disabled={failed}
						onClick={() => void confirmPhoto()}
					>
						{t("maskUse")}
					</Button>
					<Button
						type="button"
						variant="quiet"
						disabled={rects.length === 0}
						onClick={() => setRects([])}
					>
						{t("maskClear")}
					</Button>
					<Button type="button" variant="quiet" onClick={onClose}>
						{t("maskClose")}
					</Button>
				</div>
			</div>
		</dialog>
	);
}
