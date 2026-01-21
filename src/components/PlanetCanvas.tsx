import React, { useRef, useEffect } from 'react';
import styles from './WorldQuiz.module.css';

interface PlanetCanvasProps {
    images: { low: HTMLImageElement[]; high: HTMLImageElement[] } | null;
    sliderValue: number;
    width: number;
    height: number;
}

export const PlanetCanvas: React.FC<PlanetCanvasProps> = ({ images, sliderValue, width, height }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !images) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        let imgToDraw: HTMLImageElement | null = null;

        if (sliderValue === 50) {
            // Neutral state - use first frame of low (or whichever logic)
            imgToDraw = images.low[0];
        } else if (sliderValue < 50) {
            // Low side: 50 -> 0 (indices 0 -> 19)
            // 50 (neutral) -> index 0
            // 0 (full low) -> index 19
            const index = Math.min(19, Math.floor(((50 - sliderValue) / 50) * 19));
            imgToDraw = images.low[index];
        } else {
            // High side: 50 -> 100 (indices 0 -> 19)
            // 50 (neutral) -> index 0
            // 100 (full high) -> index 19
            const index = Math.min(19, Math.floor(((sliderValue - 50) / 50) * 19));
            imgToDraw = images.high[index];
        }

        if (imgToDraw && imgToDraw.complete) {
            // Draw image scaled to canvas size
            ctx.drawImage(imgToDraw, 0, 0, width, height);
        }

    }, [images, sliderValue, width, height]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={styles.planetIcon}
            style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain'
            }}
        />
    );
};
