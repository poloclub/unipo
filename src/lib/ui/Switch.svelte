<!-- Small segmented switch (two or more options). -->
<script lang="ts" generics="T extends string">
    interface Option {
        value: T;
        label: string;
        title?: string;
    }

    interface Props {
        options: Option[];
        value: T;
        onChange: (v: T) => void;
    }
    let { options, value, onChange }: Props = $props();
</script>

<div class="switch" role="group">
    {#each options as opt}
        <button
            class="seg"
            class:active={value === opt.value}
            type="button"
            title={opt.title}
            onclick={() => onChange(opt.value)}
        >
            {opt.label}
        </button>
    {/each}
</div>

<style lang="scss">
    .switch {
        display: inline-flex;
        padding: 2px;
        background: $c-line-soft;
        border-radius: $radius-md;
    }
    .seg {
        font-family: $font-sans;
        font-size: $fs-xs;
        font-weight: $fw-medium;
        color: $c-ink-3;
        padding: 3px 10px;
        border: none;
        border-radius: calc(#{$radius-md} - 2px);
        background: transparent;
        cursor: pointer;
        line-height: 1;
        transition:
            background 120ms ease,
            color 120ms ease;

        &:hover:not(.active) {
            color: $c-ink-1;
        }
        &.active {
            background: $c-surface;
            color: $c-ink-1;
            font-weight: $fw-semibold;
            box-shadow: $shadow-card;
        }
    }
</style>
