import React, { Suspense, forwardRef, useImperativeHandle, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { DisplacementSphere } from './DisplacementSphere';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface Planet3DProps {
    values: number[];
    currentSection: number;
    tintColor?: string;
    tintOpacity?: number;
}

export interface Planet3DHandle {
    getScene: () => THREE.Scene | null;
}

export const Planet3D = forwardRef<Planet3DHandle, Planet3DProps>((props, ref) => {
    const sceneRef = useRef<THREE.Scene>(null);

    useImperativeHandle(ref, () => ({
        getScene: () => sceneRef.current
    }));

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <Canvas camera={{ position: [0, 0, 18], fov: 45 }}>
                <scene ref={sceneRef}>
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} />
                    <Suspense fallback={null}>
                        <DisplacementSphere
                            values={props.values}
                            currentSection={props.currentSection}
                            tintColor={props.tintColor}
                            tintOpacity={props.tintOpacity}
                        />
                    </Suspense>
                </scene>
                <OrbitControls enableZoom={false} enablePan={false} />
            </Canvas>
        </div>
    );
});

Planet3D.displayName = 'Planet3D';
