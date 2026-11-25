import { cn } from "@/lib/utils";

/**
 * Natural Earth 1:50m public-domain outline, drawn in the same frame as
 * placeOnMap: west 28.8, east 30.95, south -2.9, north -1.0.
 */
const OUTLINE =
	"M77.7 38.79 L80.97 38.71 L102.54 33.55 L104.69 35.17 L108.16 45.18 L110.0 46.63 L113.01 46.99 L119.05 44.7 L130.16 36.87 L135.0 32.11 L140.7 25.42 L147.99 17.88 L152.05 11.31 L156.03 7.46 L161.23 6.31 L166.99 6.6 L171.0 6.73 L167.71 8.3 L167.02 13.12 L170.81 20.82 L183.19 36.75 L191.07 39.68 L196.22 45.87 L201.26 56.31 L202.75 69.37 L200.67 85.07 L201.91 96.75 L206.46 104.4 L207.66 114.34 L205.5 126.54 L202.87 133.85 L199.77 136.27 L196.25 137.17 L191.48 136.35 L185.66 137.38 L179.34 139.68 L175.36 140.01 L172.89 139.56 L168.22 137.61 L160.85 131.3 L147.1 134.79 L143.38 134.71 L138.33 137.71 L134.23 141.4 L131.73 141.66 L129.19 141.15 L117.34 133.71 L113.02 133.96 L111.24 154.86 L109.26 166.46 L106.82 171.64 L98.34 176.64 L89.8 179.47 L85.14 179.28 L66.37 180.84 L59.02 180.86 L54.98 179.15 L49.71 167.3 L39.76 162.03 L30.21 159.57 L26.32 160.25 L22.86 166.46 L21.44 172.02 L12.18 168.2 L9.39 163.51 L9.14 155.56 L5.76 144.67 L7.64 140.03 L11.27 137.03 L18.96 131.28 L30.64 123.32 L33.15 119.51 L34.8 113.18 L34.06 98.46 L32.94 86.03 L34.33 81.6 L39.66 71.99 L46.82 62.16 L55.17 51.76 L60.2 50.74 L66.8 46.81 L73.78 40.98 L77.7 38.79 Z";

const WIDTH = 215;
const HEIGHT = 190;

export type MapCenter = {
	id: string;
	name: string;
	mapX: number;
	mapY: number;
};

export function RwandaMap({
	centers,
	selectedId,
	onSelect,
	label,
}: {
	centers: readonly MapCenter[];
	selectedId: string | null;
	onSelect: (id: string) => void;
	label: string;
}) {
	return (
		<div className="relative">
			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				className="h-auto w-full"
				role="img"
				aria-label={label}
			>
				<title>{label}</title>
				<path
					d={OUTLINE}
					className="fill-surface stroke-ink"
					strokeWidth="1.4"
				/>
			</svg>
			{centers.map((center) => {
				const selected = center.id === selectedId;
				return (
					<button
						key={center.id}
						type="button"
						className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
						style={{
							left: `${center.mapX * 100}%`,
							top: `${center.mapY * 100}%`,
						}}
						aria-label={center.name}
						aria-pressed={selected}
						title={center.name}
						onClick={() => onSelect(center.id)}
					>
						<span
							className={cn(
								"rounded-full",
								selected
									? "size-4 border-2 border-ink bg-yellow"
									: "size-2.5 bg-ink",
							)}
						/>
					</button>
				);
			})}
		</div>
	);
}
