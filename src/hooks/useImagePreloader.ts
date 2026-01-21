import { useState, useEffect } from 'react';

export interface PreloadedImages {
    low: HTMLImageElement[];
    high: HTMLImageElement[];
}

export const useImagePreloader = (currentQuestion: any) => {
    const [images, setImages] = useState<PreloadedImages | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        setImages(null);

        const folder = `/quiz_planet_images/${currentQuestion.folder}`;
        const lowImages: HTMLImageElement[] = [];
        const highImages: HTMLImageElement[] = [];
        let loadedCount = 0;
        const totalImages = 40; // 20 low + 20 high

        const onImageLoad = () => {
            loadedCount++;
            if (loadedCount === totalImages) {
                setImages({ low: lowImages, high: highImages });
                setIsLoading(false);
            }
        };

        // Preload Low (0-19)
        for (let i = 0; i < 20; i++) {
            const img = new Image();
            const frameStr = i.toString().padStart(2, '0');
            img.src = `${folder}/${currentQuestion.lowPrefix}/${currentQuestion.lowPrefix}_${frameStr}.png`;
            img.onload = onImageLoad;
            img.onerror = onImageLoad; // Continue even if error
            lowImages[i] = img; // Ensure order
        }

        // Preload High (0-19)
        for (let i = 0; i < 20; i++) {
            const img = new Image();
            const frameStr = i.toString().padStart(2, '0');
            img.src = `${folder}/${currentQuestion.highPrefix}/${currentQuestion.highPrefix}_${frameStr}.png`;
            img.onload = onImageLoad;
            img.onerror = onImageLoad;
            highImages[i] = img;
        }

        return () => {
            // Cleanup if needed (browser handles image cancellation mostly)
            setIsLoading(false);
        };
    }, [currentQuestion]);

    return { images, isLoading };
};
