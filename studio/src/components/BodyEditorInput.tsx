import { useLayoutEffect, useRef } from 'react';
import { styled } from 'styled-components';
import type { InputProps } from 'sanity';

const MIN_EDITOR_HEIGHT_PX = 320;
const FALLBACK_MAX_EDITOR_HEIGHT_PX = 1800;
const FIELD_BOTTOM_GUTTER_PX = 16;
const MAX_HEIGHT_PROPERTY = '--body-editor-max-height';
const SCROLLABLE_OVERFLOW = /auto|scroll/;

const EDITOR = "[data-testid='pt-editor'][data-fullscreen='false']";
const TOOLBAR = "[data-testid='pt-editor__toolbar-card']";
const SCROLLER = "[data-testid='pt-editor__scroller']";

const AutoGrowEditor = styled.div`
	& ${EDITOR} {
		height: auto;
		min-height: min(
			${MIN_EDITOR_HEIGHT_PX}px,
			var(${MAX_HEIGHT_PROPERTY}, ${MIN_EDITOR_HEIGHT_PX}px)
		);
		max-height: var(${MAX_HEIGHT_PROPERTY}, ${FALLBACK_MAX_EDITOR_HEIGHT_PX}px);
	}

	& ${EDITOR} > ${TOOLBAR} {
		flex: none;
	}

	& ${EDITOR} > :has(> ${SCROLLER}) {
		display: flex;
		flex: 0 1 auto;
		flex-direction: column;
		min-height: 0;
	}

	& ${EDITOR} ${SCROLLER} {
		flex: 1 1 auto;
		min-height: 0;
		height: auto;
	}
`;

function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
	let ancestor = element.parentElement;

	while (ancestor) {
		if (SCROLLABLE_OVERFLOW.test(getComputedStyle(ancestor).overflowY)) {
			return ancestor;
		}
		ancestor = ancestor.parentElement;
	}

	return null;
}

function labelOffsetOf(wrapper: HTMLElement): number {
	const field = wrapper.closest('fieldset') ?? wrapper;

	return Math.max(
		0,
		wrapper.getBoundingClientRect().top - field.getBoundingClientRect().top,
	);
}

export function BodyEditorInput(props: InputProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const wrapper = wrapperRef.current;
		const scroller = wrapper ? findScrollableAncestor(wrapper) : null;

		if (!wrapper || !scroller) {
			return undefined;
		}

		const applyMaxHeight = () => {
			const available =
				scroller.clientHeight - labelOffsetOf(wrapper) - FIELD_BOTTOM_GUTTER_PX;

			wrapper.style.setProperty(
				MAX_HEIGHT_PROPERTY,
				`${Math.max(0, Math.floor(available))}px`,
			);
		};

		applyMaxHeight();

		const observer = new ResizeObserver(applyMaxHeight);
		observer.observe(scroller);
		window.addEventListener('resize', applyMaxHeight);

		return () => {
			observer.disconnect();
			window.removeEventListener('resize', applyMaxHeight);
		};
	}, []);

	return (
		<AutoGrowEditor ref={wrapperRef}>{props.renderDefault(props)}</AutoGrowEditor>
	);
}
