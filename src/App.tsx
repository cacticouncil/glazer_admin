import { useState, useEffect, useRef, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Canvas from './components/Canvas';
import ToolSystem from './tools/ToolSystem';
import { Toolbar } from './tools/ToolSystem';
import { Inspector } from './components/Inspector';
import { AnnotationScrollbar } from './components/AnnotationScrollbar';
import type { ToolBase } from './tools/Tool';
import Filebar from './components/Filebar';

import { ConfigManager, DEFAULT_CONFIG, type AppConfig } from './tools/config_manager';
import { model_loader } from './onnx/model_loader';
import { inference_pipeline } from './onnx/inference_pipeline';
import type { InferenceSession } from 'onnxruntime-web/wasm';
import { Annotation } from './components/Annotation';
import { FastAverageColor, type FastAverageColorResult } from 'fast-average-color';
import rgbToLab from '@fantasy-color/rgb-to-lab';
import JSZip from 'jszip';
import { LoadingBar } from './components/LoadingBar';
import { useTranslation } from "react-i18next";

const GLAZE_DAEMON_URL = (
	(import.meta.env.VITE_GLAZE_DAEMON_URL as string | undefined) ?? "http://localhost:8000"
).replace(/\/+$/, "");

type UploadResponse = {
	status?: string;
	message?: string;
	detail?: string;
	imported?: number;
	warnings?: string[];
};

const loadImageFile = async (file: File) => {
	const objectUrl = URL.createObjectURL(file);
	try {
		return await new Promise<HTMLImageElement>((resolve, reject) => {
			const loadedImage = new Image();
			loadedImage.onload = () => resolve(loadedImage);
			loadedImage.onerror = () => reject(new Error(`Could not load image: ${file.name}`));
			loadedImage.src = objectUrl;
		});
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
};

const downloadBlob = (blob: Blob, filename: string) => {
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	try {
		anchor.href = objectUrl;
		anchor.download = filename;
		anchor.style.display = 'none';
		document.body.appendChild(anchor);
		anchor.click();
	} finally {
		anchor.remove();
		URL.revokeObjectURL(objectUrl);
	}
};

const sanitizeArchiveName = (value: string) => Array.from(value)
	.map(character => {
		const code = character.charCodeAt(0);
		return code < 32 || '\\/:*?"<>|'.includes(character) ? "_" : character;
	})
	.join("")
	.trim();

/**
 * App component; base rendering point, handles cross-component state. 
 */
function App() {
	//language
	const { t } = useTranslation("app");

	// Images
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	const [imageFiles, setImageFiles] = useState<File[]>([]);
	const [isImageLoaded, setIsImageLoaded] = useState(false);
	const [isImageTransitioning, setIsImageTransitioning] = useState(false);
	const [currentImageIndex, setCurrentImageIndex] = useState(0);
	const prevImageCountRef = useRef(0);

	// Annotations
	const [annotations, setAnnotations] = useState<{ [imageIndex: number]: { [id: string]: Annotation } }>({});
	const [selectedAnnotationIDs, setSelectedAnnotationIDs] = useState<string[]>([]);
	const [currentAnnotationClass, setCurrentAnnotationClass] = useState<string>('');

	// Models
	// Warmed-up and ready for use
	const [loadedModels, setLoadedModels] = useState<Record<string, InferenceSession>>({});
	const [availableModels, setAvailableModels] = useState<Record<string, string>>({
		'tile_detector': '/models/tile_detector.onnx',
	});
	const [selectedModels, setSelectedModels] = useState<string[]>([]);

	// Exports
	const [isExporting, setIsExporting] = useState(false);
	const [currentExportIndex, setCurrentExportIndex] = useState(0);
	const [totalExportSteps, setTotalExportSteps] = useState(0);
	const [currentExportStep, setCurrentExportStep] = useState('');
	const [currentExportSubStep, setCurrentExportSubStep] = useState('');

	// Misc
	const [, setPanelSize] = useState(80);
	const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
	const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
	const [, setCurrentTool] = useState<ToolBase | null>(null);
	const [canvasKey, setCanvasKey] = useState(0);

	// Refs
	const toolSystemRef = useRef<ToolSystem | null>(null);
	const configManagerRef = useRef<ConfigManager | null>(null);

	// Initialize ConfigManager and ToolSystem
	useEffect(() => {
		if (!configManagerRef.current) {
			configManagerRef.current = new ConfigManager(DEFAULT_CONFIG, setConfig);
			configManagerRef.current.loadFromStorage();
		}

		if (!toolSystemRef.current) {
			toolSystemRef.current = new ToolSystem(
				annotations,
				selectedAnnotationIDs,
				currentImageIndex,
				setAnnotations,
				setSelectedAnnotationIDs,
				setViewport,
				configManagerRef.current,
				setCurrentTool,
				setCurrentAnnotationClass
			);

			setCurrentTool(toolSystemRef.current.currentTool);
		}
	}, [annotations, selectedAnnotationIDs, currentImageIndex]);

	const handleImageNavigation = (num: number) => {
		if (!imageFiles.length) return;

		const newIndex = currentImageIndex + num;
		if (newIndex < 0 || newIndex > imageFiles.length - 1) return;
		setIsImageTransitioning(true);
		setCurrentImageIndex(prev => prev + num);
	};

	useEffect(() => {
		let resizeTimeout: number | undefined;

		const handleResize = () => {
			if (resizeTimeout) clearTimeout(resizeTimeout);
			// Debounce: only trigger after resizing has stopped for 200ms
			resizeTimeout = window.setTimeout(() => {
				setCanvasKey(k => k + 1);
			}, 200);
		};

		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
			if (resizeTimeout) clearTimeout(resizeTimeout);
		};
	}, []);

	useEffect(() => {
		if (toolSystemRef.current) {
			toolSystemRef.current.viewport = viewport;
		}
	}, [viewport]);

	// Update keybinds when config changes
	useEffect(() => {
		if (toolSystemRef.current) {
			toolSystemRef.current.updateKeybinds();
		}
	}, [config]);

	useEffect(() => {
		if (toolSystemRef.current) {
			toolSystemRef.current.annotations = annotations;
		}
	}, [annotations]);

	useEffect(() => {
		if (toolSystemRef.current) {
			toolSystemRef.current.selectedAnnotationIDs = selectedAnnotationIDs;
		}
	}, [selectedAnnotationIDs]);

	const toolSystem = toolSystemRef.current;
	const configManager = configManagerRef.current;

	// Image loading when imageFiles or currentImageIndex changes
	useEffect(() => {
		if (!imageFiles.length) {
			return;
		}
		const file = imageFiles[currentImageIndex];
		if (!file) return;

		const img = new Image();
		img.onload = () => {
			setImage(img);
			setIsImageLoaded(true);

			// Update toolSystem with the current image index
			if (toolSystem) {
				toolSystem.setCurrentImage(currentImageIndex);
			}

			// Clear the transitioning state after everything is set up
			setIsImageTransitioning(false);
		};
		img.onerror = () => {
			console.error("Failed to load image.");
		};

		img.src = URL.createObjectURL(file);

		return () => {
			img.onload = null;
			img.onerror = null;
		};
	}, [imageFiles, currentImageIndex, toolSystem]);

	/**
	 * Centralized imageFiles updater used by Filebar.
	 * This avoids typing conflicts and gives us one place for side effects if we want them later.
	 */
	const updateImageFiles = (updater: (prev: File[]) => File[]) => {
		setImageFiles(prev => {
			const next = updater(prev);

			// Example: when going from 0 → >0 images, reset index & annotations
			if (prev.length === 0 && next.length > 0) {
				setAnnotations({});
				setCurrentImageIndex(0);
			}

			// When clearing all images, also clear current image
			if (next.length === 0) {
				setImage(null);
				setCurrentImageIndex(0);
				setIsImageLoaded(false);
			}

			return next;
		});
	};

	const closeImage = (index: number) => {
		setImageFiles(prev => {
			const newFiles = prev.filter((_, i) => i !== index);

			// Shift current index if needed
			if (index < currentImageIndex) {
				setCurrentImageIndex(i => Math.max(i - 1, 0));
			} else if (index === currentImageIndex) {
				setCurrentImageIndex(0);
			}

			// Remove annotations for that file
			setAnnotations(prevA => {
				const clone = { ...prevA };
				delete clone[index];

				// shift annotation indices down by 1 after the removed file
					const shifted: { [imageIndex: number]: { [id: string]: Annotation } } = {};
				const keys = Object.keys(clone).map(Number).sort((a,b)=>a-b);
				let shift = 0;
				for (const k of keys) {
					if (k > index) shift = 1;
					shifted[k - shift] = clone[k];
				}
				return shifted;
			});

			return newFiles;
		});
	};

	const clearAllFiles = () => {
		setImageFiles([]);
		setAnnotations({});
		setCurrentImageIndex(0);
		setImage(null);
	};

	const runModelsOnImage = useCallback(async (img: HTMLImageElement) => {
			const newAnnotations: { [id: string]: Annotation } = {};

		for (const modelName of selectedModels) {
			const model = loadedModels[modelName];
			if (!model) continue;

			const [results] = await inference_pipeline(img, { yolo_model: model });

			for (const result of results) {
				const [x, y, w, h] = result.bbox;
				const annotation = new Annotation(
					'rectangle',
					[{ x, y }, { x: x + w, y: y + h }],
					[],
					'tile'
				);
				newAnnotations[annotation.id] = annotation;
			}
		}

		return newAnnotations;
	}, [selectedModels, loadedModels]);

	/**
	 * Load all newly selected models.
	 * @param models List of currently selected models
	 */
	const handleModelSelect = async (models: string[]) => {
		// Load newly selected models
		console.log(availableModels);
		for (let i = 0; i < models.length; i++) {
			const modelName = models[i];
			// If already loaded, ignore
			if (!loadedModels[modelName]) {
				const modelPath = availableModels[modelName];

				console.log(modelPath);
				const session = (await model_loader('wasm', modelPath, { input_shape: [1, 3, 800, 800] })).yolo_model;
				setLoadedModels(prev => ({ ...prev, [modelName]: session }));
			}
		}

		// Unload deselected models
		for (const modelName of Object.keys(loadedModels)) {
			if (!models.includes(modelName)) {
				// Dispose session on deload
				setLoadedModels(prev => {
					const copy = { ...prev };
					copy[modelName].release();
					delete copy[modelName];

					return copy;
				});
			}
		}

		setSelectedModels(models);
	};

	const preprocessIndices = useCallback(async (indices: number[]) => {
		for (const index of indices) {
			const file = imageFiles[index];
			if (!file) continue;

			// Load file into an off-screen Image
			const img = await new Promise<HTMLImageElement>((resolve, reject) => {
				const tempImg = new Image();
				tempImg.onload = () => resolve(tempImg);
				tempImg.onerror = reject;
				tempImg.src = URL.createObjectURL(file);
			});

			const newAnnotations = await runModelsOnImage(img);

			setAnnotations(prev => ({
				...prev,
				[index]: {
					...newAnnotations
				}
			}));
		}
	}, [imageFiles, runModelsOnImage, setAnnotations]);

	/**
	 * Load custom user uploaded ONNX CNN model.
	 * @param file File representing model
	 */
	const handleCustomModelUpload = (file: File) => {
		const customModelName = `Custom: ${file.name}`;

		setAvailableModels(prev => ({
			...prev,
			[customModelName]: URL.createObjectURL(file)
		}));

		// NOTE: doesn't properly pass state, since availableModels isn't updated immediately.
		//		 could re-add, but not dire.
		// handleModelSelect([...selectedModels, customModelName]);
	};

	/**
	 * Runs all currently loaded ONNX models over currently loaded image in series.
	 * Creates new annotations for detected bounding boxes via onnx/inference_pipeline.
	 */
	const handlePreprocessors = useCallback(async () => {
		if (!image || isImageTransitioning) return;

		const newAnnotations = await runModelsOnImage(image);

		setAnnotations(prev => ({
			...prev,
			[currentImageIndex]: {
				...newAnnotations
			}
		}));
	}, [image, isImageTransitioning, currentImageIndex, runModelsOnImage, setAnnotations]);

	// Rebuild annotation grid (used for navigation) on new select
	useEffect(() => {
		if (toolSystemRef.current) {
			toolSystemRef.current.buildAnnotationGrid();
		}
	}, [annotations, currentImageIndex, selectedAnnotationIDs]);

	// Global keyboard event handler
	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			if (e.key === ' ') {
				handlePreprocessors();
			}
		};

		const handleGlobalKeyUp = (e: KeyboardEvent) => {
			const activeElement = document.activeElement;
			const isTyping = activeElement && (
				activeElement.tagName === 'INPUT' ||
				activeElement.tagName === 'TEXTAREA' ||
				activeElement.getAttribute('contenteditable') === 'true'
			);

			if (isTyping) return;

			// Check if Ctrl key is held for image navigation
			if (e.ctrlKey) {
				if (e.key === 'ArrowRight') {
					handleImageNavigation(1);
				} else if (e.key === 'ArrowLeft') {
					handleImageNavigation(-1);
				}
			} else if (toolSystem) {
				// Arrow keys without Ctrl navigate annotations
				if (e.key === 'ArrowUp') {
					toolSystem.navigateAnnotationGrid('up');
				}
				else if (e.key === 'ArrowDown') {
					toolSystem.navigateAnnotationGrid('down');
				}
				else if (e.key === 'ArrowLeft') {
					toolSystem.navigateAnnotationGrid('left');
				}
				else if (e.key === 'ArrowRight') {
					toolSystem.navigateAnnotationGrid('right');
				}
				else if (e.key === 'Delete') {
					toolSystem.removeAnnotation(toolSystem.selectedAnnotationIDs[0]);
				}
			}
		};

			document.addEventListener('keydown', handleGlobalKeyDown);
			document.addEventListener('keyup', handleGlobalKeyUp);

		// Cleanup event listeners on unmount
		return () => {
				document.removeEventListener('keydown', handleGlobalKeyDown);
				document.removeEventListener('keyup', handleGlobalKeyUp);
		};
	}, [imageFiles, currentImageIndex, isImageTransitioning, handlePreprocessors, toolSystem]);

	useEffect(() => {
		if (image && toolSystem) {
			toolSystem.setCurrentImage(currentImageIndex);

			const canvasWidth = window.innerWidth;
			const canvasHeight = window.innerHeight;

			// Adjust initial viewport so that full image fits (centered) in screen
			const aspectRatio = canvasWidth / canvasHeight;
			const scale = (image.height > image.width)
				? (window.innerHeight / image.height / aspectRatio)
				: (window.innerWidth / image.width / aspectRatio);

			const initialViewport = {
				x: ((canvasWidth / scale) - image.width) * 0.5,
				y: ((canvasHeight / scale) - image.height) * 0.5,
				scale
			};

			setViewport(initialViewport);
		}
	}, [isImageLoaded, toolSystem, currentImageIndex, image]);

	useEffect(() => {
		const prevCount = prevImageCountRef.current;
		const currCount = imageFiles.length;

		// If files were added (not removed)
		if (currCount > prevCount) {
			const newIndices = Array.from(
				{ length: currCount - prevCount },
				(_, i) => prevCount + i
			);

			// Preprocess all newly added indices in the background
			void preprocessIndices(newIndices);
		}

		// Update ref for next comparison
		prevImageCountRef.current = currCount;
	}, [imageFiles, preprocessIndices]);


	const handleToolSelect = (tool: ToolBase) => {
		if (toolSystem) {
			toolSystem.setCurrentTool(tool);
		}
	};

	const exportCurrentAnnotations = () => exportAnnotations(true);
	const exportAllAnnotations = () => exportAnnotations(false);

	/**
	  * Saves all images to annotations.zip/images and all annotations to annotations.zip/annotations.json.
	* Save code found in Annotation.save() [<-- TO IMPLEMENT]
	*/

	const exportAnnotations = async (onlyCurrent: boolean) => {
		if (!imageFiles.length || isExporting) return;

		setIsExporting(true);
		setCurrentExportIndex(0);
		setCurrentExportStep(t('export.preparing'));
		setCurrentExportSubStep('');

		try {
			const zip = new JSZip();
			const imageIndices = onlyCurrent
				? [currentImageIndex]
				: imageFiles.map((_, index) => index);
			const totalSteps = imageIndices.reduce(
				(total, index) => total + Object.keys(annotations[index] || {}).length,
				0
			);

			setTotalExportSteps(totalSteps);
			if (totalSteps === 0) {
				throw new Error("There are no tile annotations to export.");
			}

			let currentStepIndex = 0;
			let exportedAnnotationCount = 0;
			const failedAnnotations: string[] = [];

			for (const i of imageIndices) {
				const file = imageFiles[i];
				if (!file) {
					throw new Error(`Image ${i + 1} is no longer available.`);
				}

				const imageName = file.name.replace(/\.[^/.]+$/, "");
				const safeImageName = sanitizeArchiveName(imageName) || `image-${i + 1}`;
				const folderName = `${String(i + 1).padStart(3, "0")}-${safeImageName}`;
				const imageFolder = zip.folder(folderName);
				const imagesFolder = imageFolder?.folder('images');
				const annotationsData: {
					annotation: Record<string, string | number>;
					imageUrl: string;
				}[] = [];
				if (!imageFolder || !imagesFolder) {
					throw new Error(`Could not create the export folder for ${file.name}.`);
				}

				const originalExt = (file.name.split('.').pop() || 'jpg')
					.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
				imageFolder.file(`${safeImageName}.${originalExt}`, file);

				let imageToProcess = (
					i === currentImageIndex &&
					image?.complete &&
					image.naturalWidth > 0
				) ? image : null;
				if (!imageToProcess) {
					setCurrentExportStep(t("export.loadingImage", { current: i + 1, total: imageFiles.length }));
					imageToProcess = await loadImageFile(file);
				}

				const annots = Object.values(annotations[i] || []);
				setCurrentExportStep(t("process.image", { current: i + 1, total: imageFiles.length }));

				for (const annotation of annots) {
					currentStepIndex++;
					setCurrentExportIndex(currentStepIndex);
					setCurrentExportSubStep(annotation.id);

					if (!annotation.bounds || annotation.bounds.length !== 2) {
						failedAnnotations.push(annotation.id);
						continue;
					}

					const [start, end] = annotation.bounds;
					const coordinates = [start.x, start.y, end.x, end.y];
					if (!coordinates.every(Number.isFinite)) {
						failedAnnotations.push(annotation.id);
						continue;
					}

					const sourceWidth = imageToProcess.naturalWidth || imageToProcess.width;
					const sourceHeight = imageToProcess.naturalHeight || imageToProcess.height;
					const left = Math.max(0, Math.min(start.x, end.x));
					const top = Math.max(0, Math.min(start.y, end.y));
					const right = Math.min(sourceWidth, Math.max(start.x, end.x));
					const bottom = Math.min(sourceHeight, Math.max(start.y, end.y));
					const x = Math.floor(left);
					const y = Math.floor(top);
					const width = Math.ceil(right) - x;
					const height = Math.ceil(bottom) - y;

					if (width <= 0 || height <= 0) {
						failedAnnotations.push(annotation.id);
						continue;
					}

					const cropCanvas = document.createElement('canvas');
					cropCanvas.width = width;
					cropCanvas.height = height;
					const cropContext = cropCanvas.getContext('2d');
					if (!cropContext) {
						failedAnnotations.push(annotation.id);
						continue;
					}

					cropContext.drawImage(
						imageToProcess,
						x, y, width, height,
						0, 0, width, height
					);

					const blob = await new Promise<Blob | null>(
						resolve => cropCanvas.toBlob(resolve, 'image/jpeg', 0.95)
					);
					if (!blob) {
						failedAnnotations.push(annotation.id);
						continue;
					}

					const fileName = `${annotation.id}.jpg`;
					imagesFolder.file(fileName, blob);

					try {
						const marginRatio = 0.25;
						const marginX = Math.floor(width * marginRatio);
						const marginY = Math.floor(height * marginRatio);
						const colorW = Math.max(1, width - 2 * marginX);
						const colorH = Math.max(1, height - 2 * marginY);
						const colorCanvas = document.createElement('canvas');
						colorCanvas.width = colorW;
						colorCanvas.height = colorH;
						const colorContext = colorCanvas.getContext('2d');
						if (colorContext) {
							colorContext.drawImage(
								cropCanvas,
								marginX, marginY, colorW, colorH,
								0, 0, colorW, colorH
							);
							const fac = new FastAverageColor();
							const color: FastAverageColorResult = await fac.getColorAsync(
								colorCanvas,
								{ algorithm: 'simple' }
							);
							const colorValues = color.rgb.split(/[,()]/);
							const red = parseFloat(colorValues[1]);
							const green = parseFloat(colorValues[2]);
							const blue = parseFloat(colorValues[3]);
							const lab = rgbToLab({ red, green, blue });
							annotation.color_data.ColorL = lab.luminance;
							annotation.color_data.ColorA = lab.a;
							annotation.color_data.ColorB = lab.b;
						}
					} catch (error) {
						console.error('Error calculating color:', error);
					}

					annotationsData.push({
						annotation: annotation.getData(),
						imageUrl: `images/${fileName}`
					});
					exportedAnnotationCount++;
				}

				imageFolder.file('annotations.json', JSON.stringify(annotationsData, null, 2));
			}

			if (failedAnnotations.length > 0) {
				throw new Error(
					`Could not crop ${failedAnnotations.length} annotation(s): ${failedAnnotations.slice(0, 3).join(", ")}`
				);
			}
			if (exportedAnnotationCount !== totalSteps) {
				throw new Error(
					`Prepared ${exportedAnnotationCount} of ${totalSteps} tile annotations.`
				);
			}

			const zipBlob = await zip.generateAsync({ type: 'blob' });
			const formData = new FormData();
			formData.append('file', zipBlob, 'annotations.zip');

			const response = await fetch(`${GLAZE_DAEMON_URL}/upload`, {
				method: "POST",
				body: formData,
			});
			const responseText = await response.text();
			let result: UploadResponse = {};
			try {
				result = responseText ? JSON.parse(responseText) : {};
			} catch {
				throw new Error(
					`The tile service returned an invalid response (HTTP ${response.status}).`
				);
			}

			if (!response.ok || result.status !== "success") {
				throw new Error(
					result.detail ||
					result.message ||
					`The tile service rejected the export (HTTP ${response.status}).`
				);
			}
			if (result.imported !== exportedAnnotationCount) {
				throw new Error(
					`The tile service imported ${result.imported ?? 0} of ${exportedAnnotationCount} tiles.`
				);
			}
			if (result.warnings?.length) {
				console.warn("Export completed with warnings:", result.warnings);
			}

			downloadBlob(zipBlob, 'annotations.zip');
			setCurrentExportStep(t('export.complete'));
		}
		catch (error: unknown) {
			console.error('Export failed:', error);
			setCurrentExportStep(t('export.failed'));
			setCurrentExportSubStep(
				error instanceof Error ? error.message : "Unknown export error"
			);
		}
		finally {
			// Hide LoadingBar after export completes
			setTimeout(() => setIsExporting(false), 2000);
		}
	};


	return (
		<div className='flex-col flex'>
			<LoadingBar
				isExporting={isExporting}
				index={currentExportIndex}
				numSteps={totalExportSteps}
				currentStep={currentExportStep}
				subStep={currentExportSubStep}
			/>
			<Filebar
				updateImageFiles={updateImageFiles}
				closeImage={closeImage}
    			clearAllFiles={clearAllFiles}
				configManager={configManagerRef.current}
				toolSystem={toolSystemRef.current}
				currentAnnotationClass={currentAnnotationClass}
				availableModels={availableModels}
				selectedModels={selectedModels}
				onModelSelect={handleModelSelect}
				onCustomModelUpload={handleCustomModelUpload}
				onPreprocess={handlePreprocessors}
				onExportAll={exportAllAnnotations}
				onExportCurrent={exportCurrentAnnotations}
			/>
			<PanelGroup direction="horizontal" style={{ height: '100vh' }}>
				<Panel defaultSize={15} minSize={10} className='bg-(--color-medium) min-h-0 h-full'>
					{toolSystem && (
						<>
							<Toolbar
								toolSystem={toolSystem}
								onToolSelect={handleToolSelect}
							/>
							<Inspector
								toolSystem={toolSystem}
								selectedAnnotationIDs={selectedAnnotationIDs}
							/>
						</>
					)}

				</Panel>
				<PanelResizeHandle style={{ width: '4px', background: 'var(--color-light)' }} />
				<Panel
					defaultSize={70}
					minSize={25}
					onResize={(size) => setPanelSize(size)}
				>
					<div style={{
						width: '100%',
						height: '100%',
						display: 'flex',
						justifyContent: 'center',
						alignItems: 'center',
						padding: '20px',
						boxSizing: 'border-box',
						background: '#fff'
					}}>
						{image && toolSystem && configManager && (!isImageTransitioning ? (
							<Canvas
								key={canvasKey}
								image={image}
								currentImageIndex={currentImageIndex}
								backgroundColor={'#3B3B3B'}
								toolSystem={toolSystem}
								configManager={configManager}
								viewport={viewport}
								annotations={annotations}
								selectedAnnotationIDs={selectedAnnotationIDs}
							/>
						) : (
							<Canvas
								key={canvasKey}
								image={null}
								currentImageIndex={-1}
								backgroundColor={'#3B3B3B'}
								toolSystem={toolSystem}
								configManager={configManager}
								viewport={viewport}
								annotations={annotations}
								selectedAnnotationIDs={selectedAnnotationIDs}
							/>
						))}
					</div>
				</Panel>
				<PanelResizeHandle style={{ width: '4px', background: '#ccc' }} />
				<Panel defaultSize={10} minSize={5} className='bg-(--color-medium)'>
					<AnnotationScrollbar
						imageFiles={imageFiles}
						currentImageIndex={currentImageIndex}
						annotations={annotations}
						onImageChange={(index) => {
							if (index === currentImageIndex) return;
							setIsImageTransitioning(true);
							setCurrentImageIndex(index);
						}}
					/>
				</Panel>
			</PanelGroup>
		</div>
	);
}

export default App;
