import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useFBX, useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Mesh, Color, MeshStandardMaterial, Group } from 'three';

// Preload to avoid waterfalls
useGLTF.preload('/models/forest.glb');

// ... (Shader Helpers remain) ...

interface DisplacementSphereProps {
    values: number[];
}

// --- SHADER HELPERS ---

const noisePars = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
        const vec2  C = vec2(1.0 / 6.0, 1.0 / 3.0);
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
        i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1),
            dot(p2, x2), dot(p3, x3)));
    }
    `;

const growthLogic = `
float getGrowthAlpha(vec3 pos, float radius, float intensity) {
    vec3 posNorm = normalize(pos);
        if (intensity < 0.001) return 0.0;
    
    vec3 growthPoint = normalize(vec3(0.3, 1.0, 0.4)); 
    float align = dot(posNorm, growthPoint);
    float grad = pow(align * 0.5 + 0.5, 1.8); 
    
    float n = snoise(posNorm * 4.2) * 0.5 + 0.5;
    float growthMap = mix(grad, n, 0.25); 
    
    float threshold = 1.15 - (intensity * 1.35);
        return smoothstep(threshold, threshold + 0.03, growthMap);
    }
    `;

export const DisplacementSphere: React.FC<DisplacementSphereProps> = ({
    values
}) => {
    const base = useFBX('/models/base.fbx');
    const desert = useFBX('/models/desert.fbx');
    const ocean = useFBX('/models/ocean.fbx');
    // FOREST GLTF (Keep loading it to avoid errors, but don't use it yet)
    useGLTF.preload('/models/forest.glb');
    const forestGLTF = useGLTF('/models/forest.glb');
    // const forest = forestGLTF.scene; // Unused for now

    // Create clones for overlays
    // We only need Base and Volcan now.
    const materialRef = useRef<MeshStandardMaterial>(null);

    const customUniforms = useRef({
        uSliders: { value: [0.5, 0.5, 0.5, 0.5, 0.5] },
        uTime: { value: 0 },
        uDesertMap: { value: null as THREE.Texture | null },
        uOceanMap: { value: null as THREE.Texture | null },
        uHasDesertMap: { value: false },
        uHasOceanMap: { value: false },
        uDesertColor: { value: new Color(0.4, 0.25, 0.15) },
        uOceanColor: { value: new Color(0.0, 0.9, 1.0) },
        uIndices: { value: new Int32Array(8).fill(-1) },
    });

    // --- CLONES & GEOMETRY HANDLING ---
    const [baseMesh] = useMemo(() => {
        // Clone the entire scene structure (Group -> Mesh)
        const b = base.clone();
        return [b];
    }, [base]);

    // Removed useEffect for Forest Geometry

    const desertMaps = useMemo(() => {
        let map = null;
        desert.traverse((child: any) => { if (child.isMesh && child.material.map) map = child.material.map; });
        return map;
    }, [desert]);

    const oceanMaps = useMemo(() => {
        let map = null;
        ocean.traverse((child: any) => { if (child.isMesh && child.material.map) map = child.material.map; });
        return map;
    }, [ocean]);

    // Apply uniforms updates
    useEffect(() => {
        if (customUniforms.current) {
            customUniforms.current.uDesertMap.value = desertMaps;
            customUniforms.current.uHasDesertMap.value = !!desertMaps;
            customUniforms.current.uOceanMap.value = oceanMaps;
            customUniforms.current.uHasOceanMap.value = !!oceanMaps;
        }
    }, [desertMaps, oceanMaps]);


    // --- BASE MATERIAL (Ocean / Desert) ---
    useMemo(() => {
        const mat = new MeshStandardMaterial({
            color: new Color(0.12, 0.12, 0.15),
            roughness: 0.95,
            metalness: 0.0,
            side: THREE.FrontSide,
        });
        // FORCE DEFINES to ensure shader compiles with Morph logic
        mat.defines = {
            'USE_UV': '',
            'USE_MORPHTARGETS': '',
            'USE_MORPHNORMALS': ''
        };

        // @ts-ignore
        mat.morphTargets = true;
        // @ts-ignore
        mat.morphNormals = true;

        mat.onBeforeCompile = (shader) => {
            console.log("DisplacementSphere: Compiling Shader");
            shader.uniforms.uSliders = customUniforms.current.uSliders;
            shader.uniforms.uTime = customUniforms.current.uTime;
            shader.uniforms.uDesertMap = customUniforms.current.uDesertMap;
            shader.uniforms.uOceanMap = customUniforms.current.uOceanMap;
            shader.uniforms.uHasDesertMap = customUniforms.current.uHasDesertMap;
            shader.uniforms.uHasOceanMap = customUniforms.current.uHasOceanMap;
            shader.uniforms.uDesertColor = customUniforms.current.uDesertColor;
            shader.uniforms.uOceanColor = customUniforms.current.uOceanColor;
            shader.uniforms.uIndices = customUniforms.current.uIndices;

            // --- 3-POINT SYSTEM CONSTANTS ---
            // P1 (Top): vec3(0.0, 1.0, 0.0) -> Ocean/Desert
            // P2 (Bottom Right): vec3(0.8, -0.5, 0.3) -> Volcan
            // P3 (Bottom Left): vec3(-0.8, -0.5, 0.3) -> Forest (Future)

            shader.vertexShader = `
                uniform float uSliders[5];
                uniform float uTime;
                varying vec3 vWorldPos;
                varying vec3 vOriginalPos; 
                varying vec2 vCustomUv;
                uniform int uIndices[8];
                ${noisePars}
                
                // Helper to get Growth Alpha based on specific point
                float getGrowthAlpha(vec3 pos, vec3 seedPoint, float intensity) {
                    vec3 posNorm = normalize(pos);
                    if (intensity <= 0.0) return 0.0;
                    if (intensity >= 1.0) return 1.0;
                    
                    float align = dot(posNorm, normalize(seedPoint));
                    
                    // LINEAR GRADIENT (Removed pow 1.8)
                    // This ensures the "closing" of the mask at the antipode 
                    // is just as distinct/sharp as the "opening" at the seed.
                    float grad = align * 0.5 + 0.5; 
                    
                    float n = snoise(posNorm * 3.5) * 0.5 + 0.5;
                    float growthMap = mix(grad, n, 0.15); // Slightly reduced noise influence
                    
                    // TUNED THRESHOLD for Linear Gradient
                    // Starts at 1.02 (Closed) -> Ends at -0.02 (Open)
                    float threshold = 1.02 - (intensity * 1.05);
                    return smoothstep(threshold, threshold + 0.02, growthMap);
                }
    ` + shader.vertexShader;

            const maskedMorphLogic = `
    vCustomUv = uv;
    vOriginalPos = position; 

    // --- CALCULATE PER-VERTEX MASKS ---
    float s1 = uSliders[0];
    float s2 = uSliders[1];
    float intenDesert = (s1 < 0.5) ? (0.5 - s1) * 2.0 : 0.0;
    float intenOcean = (s1 > 0.5) ? (s1 - 0.5) * 2.0 : 0.0;
    float intenVolcano = (s2 > 0.5) ? (s2 - 0.5) * 2.0 : 0.0;
    
    vec3 p1 = vec3(0.0, 1.0, 0.0);
    vec3 p2 = vec3(0.8, -0.5, 0.3);
    float aD = getGrowthAlpha(vOriginalPos, p1, intenDesert);
    float aO = getGrowthAlpha(vOriginalPos, p1, intenOcean);
    float aV = getGrowthAlpha(vOriginalPos, p2, intenVolcano);

    // --- REPLACEMENT LOGIC ---
    // Volcano replaces Q1 in its unmasked area
    float maskD = aD * (1.0 - aV);
    float maskO = aO * (1.0 - aV);
    float maskV = aV;

    #include <morphtarget_vertex>

    vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    `;

            // --- ROBUST VARIABLE HIJACK ---
            // We replace all occurrences of 'morphTargetInfluences' with 'maskedInfluences'
            // in the vertex shader, and then declare 'maskedInfluences' locally in our block.
            // This ensures we don't rely on unreliable variable shadowing.

            // 1. Get the original morph target chunk
            let morphChunk = THREE.ShaderChunk['morphtarget_vertex'];

            // 2. Wrap it with our masking logic
            const hijackedMorphLogic = `
                // Local masked influences array
                float maskedInfluences[8]; 
                for(int i=0; i<8; i++) maskedInfluences[i] = 0.0;

                // Populate with our per-vertex masks and 1.8x boost
                // type 0=Desert, 1=Ocean, 2=Volcan
                for(int i=0; i<8; i++){
                    int type = uIndices[i];
                    if (type == 0) maskedInfluences[i] = maskD * 1.8;
                    else if (type == 1) maskedInfluences[i] = maskO * 1.8;
                    else if (type == 2) maskedInfluences[i] = maskV * 1.8;
                }

                // Injected Chunk logic where we rename the influence access
                ${morphChunk.replace(/morphTargetInfluences/g, 'maskedInfluences')}
            `;

            // Integrate into the maskedMorphLogic (which already has masks calculated)
            const finalLogic = maskedMorphLogic.replace('#include <morphtarget_vertex>', hijackedMorphLogic);

            shader.vertexShader = shader.vertexShader.replace('#include <morphtarget_vertex>', finalLogic);

            shader.fragmentShader = `
                uniform float uSliders[5];
                uniform float uTime;
                uniform sampler2D uDesertMap;
                uniform sampler2D uOceanMap;
                uniform vec3 uDesertColor;
                uniform vec3 uOceanColor;
                uniform bool uHasDesertMap;
                uniform bool uHasOceanMap;
                varying vec3 vWorldPos;
                varying vec3 vOriginalPos;
                varying vec2 vCustomUv;
                ${noisePars}
                
                float getGrowthAlpha(vec3 pos, vec3 seedPoint, float intensity) {
                    vec3 posNorm = normalize(pos);
                    if (intensity <= 0.0) return 0.0;
                    if (intensity >= 1.0) return 1.0;
                    float align = dot(posNorm, normalize(seedPoint));
                    
                    // LINEAR GRADIENT
                    float grad = align * 0.5 + 0.5; 
                    
                    float n = snoise(posNorm * 3.5) * 0.5 + 0.5;
                    float growthMap = mix(grad, n, 0.15); 
                    
                    float threshold = 1.02 - (intensity * 1.05);
                    return smoothstep(threshold, threshold + 0.02, growthMap);
                }
    ` + shader.fragmentShader;

            const normalLogic = `
    #include <normal_fragment_begin>
    // Recalculate normal for Base Mesh too, to catch the morphed topology properly
    normal = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    nonPerturbedNormal = normal;
    `;
            shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', normalLogic);

            const colorMixLogic = `
                vec3 mixedDiffuse = diffuseColor.rgb;
                float s1 = uSliders[0];
                float s2 = uSliders[1];
                float intenDesert = (s1 < 0.5) ? (0.5 - s1) * 2.0 : 0.0;
                float intenOcean = (s1 > 0.5) ? (s1 - 0.5) * 2.0 : 0.0;
                float intenVolcano = (s2 > 0.5) ? (s2 - 0.5) * 2.0 : 0.0;
                
                vec3 p1 = vec3(0.0, 1.0, 0.0);
                vec3 p2 = vec3(0.8, -0.5, 0.3);
                float alphaDesert = getGrowthAlpha(vOriginalPos, p1, intenDesert);
                float alphaOcean = getGrowthAlpha(vOriginalPos, p1, intenOcean);
                float alphaVolcan = getGrowthAlpha(vOriginalPos, p2, intenVolcano);

    if (alphaDesert > 0.001) {
                    vec3 dBase = uDesertColor;
        if (uHasDesertMap) dBase *= texture2D(uDesertMap, vCustomUv).rgb;
                    
                    float sandGrains = snoise(vOriginalPos * 250.0) * 0.04;
                    float ripples = snoise(vOriginalPos * 15.0) * 0.03;
        dBase += sandGrains + ripples;
        mixedDiffuse = mix(mixedDiffuse, dBase, alphaDesert);
    }

    if (alphaOcean > 0.001) {
                    vec3 oBase = uOceanColor;
        if (uHasOceanMap) oBase *= texture2D(uOceanMap, vCustomUv).rgb;
        mixedDiffuse = mix(mixedDiffuse, oBase, alphaOcean);
    }

                // --- Q2: VOLCANO OVERRIDE ---
                if (alphaVolcan > 0.05) {
                    // Magma Logic (Rock + Rivers)
                    float rockNoise = snoise(vOriginalPos * 10.0 + vec3(10.0)); 
                    vec3 rockDark = vec3(0.03, 0.03, 0.03);
                    vec3 rockBrown = vec3(0.08, 0.06, 0.04);
                    vec3 finalRock = mix(rockDark, rockBrown, rockNoise * 0.5 + 0.5);

                    float noiseFlow = snoise(vOriginalPos * 0.3 + vec3(0.0, uTime * 0.1, 0.0));
                    float ridges = 1.0 - abs(noiseFlow); 
                    float river = smoothstep(0.85, 0.98, ridges);

                    vec3 magmaRed = vec3(0.8, 0.0, 0.0);
                    vec3 magmaBright = vec3(1.5, 0.1, 0.0);
                    float pulse = snoise(vOriginalPos * 3.0 + vec3(uTime * 2.0)) * 0.5 + 0.5;
                    vec3 mixedMagma = mix(magmaRed, magmaBright, pulse);
                    
                    vec3 volcanoBase = mix(finalRock, mixedMagma, river);
                    mixedDiffuse = mix(mixedDiffuse, volcanoBase, alphaVolcan);
                }

    diffuseColor.rgb = mixedDiffuse;
    `;
            shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', colorMixLogic);

            const metalnessLogic = `
    #include <metalnessmap_fragment>
                float s1_m = uSliders[0];
                float s2_m = uSliders[1];
                float intenOcean_m = (s1_m > 0.5) ? (s1_m - 0.5) * 2.0 : 0.0;
                float intenVolcano_m = (s2_m > 0.5) ? (s2_m - 0.5) * 2.0 : 0.0;
                vec3 p1_m = vec3(0.0, 1.0, 0.0);
                vec3 p2_m = vec3(0.8, -0.5, 0.3);
                float alphaOcean_m = getGrowthAlpha(vOriginalPos, p1_m, intenOcean_m);
                float alphaVolcan_m = getGrowthAlpha(vOriginalPos, p2_m, intenVolcano_m);
                
                if (alphaOcean_m > 0.01) metalnessFactor = mix(metalnessFactor, 0.3, alphaOcean_m);
                if (alphaVolcan_m > 0.01) metalnessFactor = mix(metalnessFactor, 0.0, alphaVolcan_m);
    `;
            shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', metalnessLogic);

            const roughnessLogic = `
    #include <roughnessmap_fragment>
                float s1_r = uSliders[0];
                float s2_r = uSliders[1];
                float intenDesert_r = (s1_r < 0.5) ? (0.5 - s1_r) * 2.0 : 0.0;
                float intenOcean_r = (s1_r > 0.5) ? (s1_r - 0.5) * 2.0 : 0.0;
                float intenVolcano_r = (s2_r > 0.5) ? (s2_r - 0.5) * 2.0 : 0.0;
                vec3 p1_r = vec3(0.0, 1.0, 0.0);
                vec3 p2_r = vec3(0.8, -0.5, 0.3);
                float alphaDesert_r = getGrowthAlpha(vOriginalPos, p1_r, intenDesert_r);
                float alphaOcean_r = getGrowthAlpha(vOriginalPos, p1_r, intenOcean_r);
                float alphaVolcan_r = getGrowthAlpha(vOriginalPos, p2_r, intenVolcano_r);
                
                if (alphaDesert_r > 0.01) roughnessFactor = mix(roughnessFactor, 1.0, alphaDesert_r);
                if (alphaOcean_r > 0.01) roughnessFactor = mix(roughnessFactor, 0.02, alphaOcean_r);
                if (alphaVolcan_r > 0.01) roughnessFactor = mix(roughnessFactor, 1.0, alphaVolcan_r);
    `;
            shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', roughnessLogic);

            // @ts-ignore
            mat.userData.shader = shader;
        };

        const setupMesh = (obj: any) => {
            obj.traverse((child: any) => {
                if (child.isMesh) {
                    child.material = mat;
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
        };
        // APPLY TO CLONE
        setupMesh(baseMesh);

        // @ts-ignore
        materialRef.current = mat;
    }, [baseMesh, desertMaps, oceanMaps]);

    useFrame((state) => {
        const time = state.clock.getElapsedTime();

        // Update Base Uniforms
        if (materialRef.current && materialRef.current.userData.shader) {
            const sh = materialRef.current.userData.shader;
            sh.uniforms.uSliders.value = values.map(v => v / 100);
            sh.uniforms.uTime.value = time;
        }

        const s1_frame = values[0] / 100;
        const s2_frame = values[1] / 100;

        const activeDesert = (s1_frame < 0.5) ? 1.0 : 0.0;
        const activeOcean = (s1_frame > 0.5) ? 1.0 : 0.0;
        const activeVolcan = (s2_frame > 0.5) ? 1.0 : 0.0;

        // Unified Mesh control
        baseMesh.traverse((child: any) => {
            if (child.isMesh && child.morphTargetInfluences) {
                const dict = child.morphTargetDictionary || {};
                const indices = new Int32Array(8).fill(-1);

                for (const key in dict) {
                    const k = key.toLowerCase();
                    const idx = dict[key];
                    if (k.includes('ocean')) {
                        child.morphTargetInfluences[idx] = activeOcean;
                        if (idx < 8) indices[idx] = 1;
                    } else if (k.includes('desert')) {
                        child.morphTargetInfluences[idx] = activeDesert;
                        if (idx < 8) indices[idx] = 0;
                    } else if (k.includes('volcan')) {
                        child.morphTargetInfluences[idx] = activeVolcan;
                        if (idx < 8) indices[idx] = 2;
                    }
                }

                // Update Indices for the shader
                if (materialRef.current && materialRef.current.userData.shader) {
                    materialRef.current.userData.shader.uniforms.uIndices.value = indices;
                }
            }
        });
    });

    const blueLightInt = (values[0] > 50) ? (values[0] / 100 - 0.5) * 2.0 * 0.8 : 0.0;
    const warmLightInt = (values[0] < 50) ? 0.5 + ((0.5 - values[0] / 100) * 2.0 * 0.5) : 0.5;

    return (
        <group>
            <Environment files="/env_map.hdr" />
            <directionalLight position={[10, 10, 10]} intensity={1.5} castShadow />
            <directionalLight position={[0, -10, 0]} intensity={blueLightInt} color="#0088ff" />
            <directionalLight position={[-10, 5, 10]} intensity={warmLightInt} color={(values[0] < 50) ? "#ffaa00" : "#ffffff"} />
            <directionalLight position={[-10, -5, -10]} intensity={0.5} color="#ffd4a3" />
            <ambientLight intensity={0.15} />

            <ambientLight intensity={0.15} />

            <primitive object={baseMesh} material={materialRef.current} scale={0.004} />
            {/* FOREST DISABLED FOR NOW */}
            {/* <primitive object={forestMesh} material={forestMaterialRef.current} scale={0.004} /> */}
        </group>
    );
};
