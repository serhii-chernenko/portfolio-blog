import { styled } from 'styled-components';
import type { InputProps } from 'sanity';

const MIN_EDITOR_HEIGHT_PX = 320;
const MAX_EDITOR_HEIGHT_PX = 1800;

const EDITOR = "[data-testid='pt-editor'][data-fullscreen='false']";
const TOOLBAR = "[data-testid='pt-editor__toolbar-card']";
const SCROLLER = "[data-testid='pt-editor__scroller']";

const AutoGrowEditor = styled.div`
	& ${EDITOR} {
		height: auto;
		min-height: ${MIN_EDITOR_HEIGHT_PX}px;
		max-height: ${MAX_EDITOR_HEIGHT_PX}px;
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

export function BodyEditorInput(props: InputProps) {
	return <AutoGrowEditor>{props.renderDefault(props)}</AutoGrowEditor>;
}
