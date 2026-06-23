// Rectangle annotation tool
import { ToolBase } from '../Tool';
import { CursorArrowIcon } from '@radix-ui/react-icons';
import { screenToWorld, inBounds } from '../helpers';
import type ToolSystem from '../ToolSystem';

/**
 * Allows the user to click and select the topmost annotation.
 */
class SelectorTool extends ToolBase {
	constructor(toolSystem: ToolSystem) {
		super(toolSystem, "Selector", CursorArrowIcon, "W");
	}

	onMouseDown(button: number, position: { x: number, y: number }, canvasRect: DOMRect) {
		switch (button) {
			case 0:
				this.onMB0(position, canvasRect);
				break;
			case 1:
				this.onMB1(position, canvasRect);
				break;
			case 2:
				this.onMB2(position, canvasRect);
				break;
		}
	}

	// LMB
	onMB0(position: { x: number, y: number }, canvasRect: DOMRect) {
		const worldPos = screenToWorld(position, this.toolSystem.viewport, canvasRect);
		const annotations = Object.values(this.toolSystem.annotations[this.toolSystem.currentImageIndex]);

		let topmostAnnotationId: string | null = null;

		// Iterate backwards so we check topmost first (assuming later = drawn on top)
		for (let i = annotations.length - 1; i >= 0; i--) {
			const annotation = annotations[i];
			if (inBounds(worldPos, annotation.bounds)) {
				topmostAnnotationId = annotation.id;
				break; // Stop after first (topmost) hit
			}
		}

		if (topmostAnnotationId) {
			this.toolSystem.selectAnnotations([topmostAnnotationId]);
		} else {
			// Clicked empty space — clear selection
			this.toolSystem.selectAnnotations([]);
		}
	}

	// MMB
	onMB1(position: { x: number, y: number }, canvasRect: DOMRect) {}

	// RMB
	onMB2(position: { x: number, y: number }, canvasRect: DOMRect) {}

	onMouseMove(position: { x: number, y: number }, canvasRect: DOMRect) {}

	onMouseLeave(event: React.MouseEvent<HTMLCanvasElement>) {}
}

export default SelectorTool;
