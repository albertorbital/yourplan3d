'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { DisplacementSphere } from './DisplacementSphere';
import { OrbitControls } from '@react-three/drei';

interface Planet3DProps {
    values: number[];
    currentSection: number;
    tintColor?: string;
    tintOpacity?: number;
}

export const Planet3D: React.FC<Planet3DProps> = (props) => {
    return (
        <div style={{ width: '100%', height: '100%' }}>
            <Canvas camera={{ position: [0, 0, 18], fov: 45 }}>
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
                <OrbitControls enableZoom={false} enablePan={false} />
            </Canvas>
        </div>
    );
};
