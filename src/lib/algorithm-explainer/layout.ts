import type { CardDef } from "./schema";

export interface Viewport {
    width: number;
    height: number;
}

export interface FitOptions {
    padding: number;
    scaleExtent: [number, number];
}

export interface Transform {
    x: number;
    y: number;
    k: number;
}

/**
 * Compute a transform that fits the union bbox of all card boxes inside the viewport
 * with the given padding, centered.
 */
export function fitToView(
    cards: CardDef[],
    viewport: Viewport,
    opts: FitOptions,
): Transform {
    if (cards.length === 0) return { x: 0, y: 0, k: 1 };

    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const c of cards) {
        const w = c.size?.w ?? 320;
        const h = c.size?.h ?? 160;
        if (c.position.x < minX) minX = c.position.x;
        if (c.position.y < minY) minY = c.position.y;
        if (c.position.x + w > maxX) maxX = c.position.x + w;
        if (c.position.y + h > maxY) maxY = c.position.y + h;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const availW = Math.max(1, viewport.width - opts.padding * 2);
    const availH = Math.max(1, viewport.height - opts.padding * 2);

    const kRaw = Math.min(availW / contentW, availH / contentH);
    const k = Math.min(opts.scaleExtent[1], Math.max(opts.scaleExtent[0], kRaw));

    // Place the content center at the viewport center.
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const x = viewport.width / 2 - k * cx;
    const y = viewport.height / 2 - k * cy;

    return { x, y, k };
}
