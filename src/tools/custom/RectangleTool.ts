// Rectangle annotation tool
import { ToolBase } from '../Tool';
import { Annotation } from '../../components/Annotation';
import { SquareIcon } from '@radix-ui/react-icons';
import { screenToWorld } from '../helpers';
import type ToolSystem from '../ToolSystem';

class RectangleTool extends ToolBase {
    startPoint: {x: number, y: number} | null;
    curAnnotation: Annotation | null;
    isDragging: boolean;
    dragThreshold: number;
    dragStartScreen: {x: number, y: number} | null;

    constructor(toolSystem: ToolSystem) {
        super(toolSystem, "Rectangle", SquareIcon, "R");
        this.startPoint = null;
        this.curAnnotation = null;
        this.isDragging = false;
        this.dragThreshold = 3; // pixels
        this.dragStartScreen = null;
    }

    onToolSelected() {
        this.startPoint = null;
        this.isDragging = false;
    }

    onMouseDown(button: number, position: {x: number, y: number}, canvasRect: DOMRect) {
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
    onMB0(position: {x: number, y: number}, canvasRect: DOMRect) {
        const worldPos = screenToWorld(position, this.toolSystem.viewport, canvasRect);

        if (!this.startPoint) {
            // First click (or drag start)
            this.startPoint = worldPos;
            this.dragStartScreen = position;
            this.isDragging = false;

            const name = this.toolSystem.getCurrentAnnotationClass();
            this.curAnnotation = new Annotation("rectangle", [this.startPoint, this.startPoint], [], name);
            this.toolSystem.addAnnotation(this.curAnnotation);
        } 
        else {
            // Second click (click-to-click mode)
            const bounds = [this.startPoint, worldPos];
            if (this.curAnnotation) {
                this.curAnnotation.bounds = bounds;
            }
            this.startPoint = null;
            this.curAnnotation = null;
        }
    }

    onMouseMove(position: {x: number, y: number}, canvasRect: DOMRect) {
        if (this.startPoint && this.curAnnotation) {
            const worldPos = screenToWorld(position, this.toolSystem.viewport, canvasRect);

            // Check if movement passes drag threshold
            if (this.dragStartScreen && !this.isDragging) {
                const dx = position.x - this.dragStartScreen.x;
                const dy = position.y - this.dragStartScreen.y;
                if (Math.sqrt(dx * dx + dy * dy) > this.dragThreshold) {
                    this.isDragging = true;
                }
            }

            // Live preview
            if (this.isDragging) {
                this.curAnnotation.bounds = [this.startPoint, worldPos];
            }
        }
    }

    onMouseUp(button: number, position: {x: number, y: number}, canvasRect: DOMRect) {
        if (button === 0 && this.isDragging) {
            // End of drag mode
            const worldPos = screenToWorld(position, this.toolSystem.viewport, canvasRect);
            if (this.startPoint && this.curAnnotation) {
                this.curAnnotation.bounds = [this.startPoint, worldPos];
            }
            this.startPoint = null;
            this.curAnnotation = null;
            this.isDragging = false;
            this.dragStartScreen = null;
        }
    }

    // MMB
    onMB1(position: {x: number, y: number}, canvasRect: DOMRect) {}

    // RMB
    onMB2(position: {x: number, y: number}, canvasRect: DOMRect) {}

    onMouseLeave(event: React.MouseEvent<HTMLCanvasElement>) {
        this.startPoint = null;
        this.isDragging = false;
        this.dragStartScreen = null;

        if (this.curAnnotation != null) {
            this.toolSystem.removeAnnotation(this.curAnnotation.id);
            this.curAnnotation = null;
        }
    }
}

export default RectangleTool;
