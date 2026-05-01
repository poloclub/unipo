<script lang="ts">
    interface Props {
        onZoomIn: () => void;
        onZoomOut: () => void;
        onReset: () => void;
    }
    let { onZoomIn, onZoomOut, onReset }: Props = $props();
</script>

<div class="zoom-controls">
    <button type="button" onclick={onZoomIn} title="Zoom in" aria-label="Zoom in">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
    </button>
    <button type="button" onclick={onZoomOut} title="Zoom out" aria-label="Zoom out">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
    </button>
    <button type="button" onclick={onReset} title="Reset" aria-label="Reset">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
                d="M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-6.74 2.74L3 8"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
            />
            <path
                d="M3 3v5h5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
            />
        </svg>
    </button>
</div>

<style lang="scss">
    .zoom-controls {
        position: absolute;
        right: $sp-3;
        bottom: $sp-3;
        display: flex;
        flex-direction: column;
        gap: 1px;
        background: $c-line;
        border: 1px solid $c-line;
        border-radius: $radius-md;
        overflow: hidden;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    }
    button {
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        background: $c-surface;
        border: 0;
        color: $c-ink-2;
        cursor: pointer;
        transition: background 120ms, color 120ms;
        &:hover {
            background: $c-surface-subtle;
            color: $c-ink-1;
        }
    }
</style>
