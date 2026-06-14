// src/main.js — Cena de Teste: Sprint 1-4
import { initWebGL, resizeCanvas }          from './engine/renderer/webglSetup.js';
import { vertexShaderSource, fragmentShaderSource,
         createShaderProgram, getUniformLocations } from './engine/shaders/phongShader.js';
import { perspective, createIdentity, multiply,
         fromTranslation, rotateY, rotateX, scale } from './engine/math/mat4.js';
import { parseOBJ, createMesh, loadOBJ }    from './game/loader/ModelLoader.js';
import { initCameraControls, updateCamera,
         getViewMatrix, cameraState }        from './game/core/Camera.js';

// ────────── Estado Global ──────────
let gl, canvas, program, uniforms;
let meshCube, meshPlane, meshSphere, meshCharacter;
let lastTime = 0;
let totalTime = 0;

// ────────── OBJs embutidos para teste sem servidor ──────────
// (substitua por fetch() de arquivos .obj reais depois)

const CUBE_OBJ = `
# Cubo unitário centrado na origem
v -0.5 -0.5  0.5
v  0.5 -0.5  0.5
v  0.5  0.5  0.5
v -0.5  0.5  0.5
v -0.5 -0.5 -0.5
v  0.5 -0.5 -0.5
v  0.5  0.5 -0.5
v -0.5  0.5 -0.5

vt 0 0
vt 1 0
vt 1 1
vt 0 1

vn  0  0  1
vn  0  0 -1
vn  1  0  0
vn -1  0  0
vn  0  1  0
vn  0 -1  0

# Frente
f 1/1/1 2/2/1 3/3/1
f 1/1/1 3/3/1 4/4/1
# Trás
f 6/1/2 5/2/2 8/3/2
f 6/1/2 8/3/2 7/4/2
# Direita
f 2/1/3 6/2/3 7/3/3
f 2/1/3 7/3/3 3/4/3
# Esquerda
f 5/1/4 1/2/4 4/3/4
f 5/1/4 4/3/4 8/4/4
# Topo
f 4/1/5 3/2/5 7/3/5
f 4/1/5 7/3/5 8/4/5
# Base
f 5/1/6 6/2/6 2/3/6
f 5/1/6 2/3/6 1/4/6
`;

// Plano chão 10x10
const PLANE_OBJ = `
v -5 0 -5
v  5 0 -5
v  5 0  5
v -5 0  5
vt 0 0
vt 5 0
vt 5 5
vt 0 5
vn 0 1 0
f 1/1/1 2/2/1 3/3/1
f 1/1/1 3/3/1 4/4/1
`;

// Esfera aproximada (icosaedro subdividido uma vez) — gerada proceduralmente
function generateSphereOBJ(rings = 12, slices = 18, radius = 0.5) {
    const lines = [];
    for (let r = 0; r <= rings; r++) {
        const theta = (r / rings) * Math.PI;
        for (let s = 0; s <= slices; s++) {
            const phi = (s / slices) * 2 * Math.PI;
            const x = radius * Math.sin(theta) * Math.cos(phi);
            const y = radius * Math.cos(theta);
            const z = radius * Math.sin(theta) * Math.sin(phi);
            lines.push(`v ${x} ${y} ${z}`);
        }
    }
    for (let r = 0; r <= rings; r++) {
        for (let s = 0; s <= slices; s++) {
            const nx = Math.sin((r/rings)*Math.PI)*Math.cos((s/slices)*2*Math.PI);
            const ny = Math.cos((r/rings)*Math.PI);
            const nz = Math.sin((r/rings)*Math.PI)*Math.sin((s/slices)*2*Math.PI);
            lines.push(`vn ${nx} ${ny} ${nz}`);
            lines.push(`vt ${s/slices} ${r/rings}`);
        }
    }
    const w = slices + 1;
    for (let r = 0; r < rings; r++) {
        for (let s = 0; s < slices; s++) {
            const a = r*w + s + 1, b = r*w + s + 2;
            const c = (r+1)*w + s + 2, d = (r+1)*w + s + 1;
            lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
            lines.push(`f ${a}/${a}/${a} ${c}/${c}/${c} ${d}/${d}/${d}`);
        }
    }
    return lines.join('\n');
}

// ────────── Textura xadrez procedural ──────────
function createCheckerTexture(gl, size = 64) {
    const data = new Uint8Array(size * size * 3);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 3;
            const check = ((x >> 3) + (y >> 3)) & 1;
            data[i]   = check ? 200 : 60;
            data[i+1] = check ? 200 : 60;
            data[i+2] = check ? 200 : 60;
        }
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, size, size, 0, gl.RGB, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
}

// ────────── Matriz Normal (inversa transposta da model 3x3) ──────────
function normalMatrix3x3(modelMatrix) {
    // Extrai a sub-matriz 3x3 e calcula inversa transposta manualmente
    const m = modelMatrix;
    const a00=m[0],a01=m[1],a02=m[2];
    const a10=m[4],a11=m[5],a12=m[6];
    const a20=m[8],a21=m[9],a22=m[10];

    const det = a00*(a11*a22-a12*a21) - a01*(a10*a22-a12*a20) + a02*(a10*a21-a11*a20);
    if (Math.abs(det) < 1e-8) return new Float32Array([1,0,0, 0,1,0, 0,0,1]);
    const inv = 1/det;

    // Inversa transposta
    return new Float32Array([
        (a11*a22-a12*a21)*inv, (a12*a20-a10*a22)*inv, (a10*a21-a11*a20)*inv,
        (a02*a21-a01*a22)*inv, (a00*a22-a02*a20)*inv, (a01*a20-a00*a21)*inv,
        (a01*a12-a02*a11)*inv, (a02*a10-a00*a12)*inv, (a00*a11-a01*a10)*inv
    ]);
}

// ────────── Desenha um mesh com os uniforms do Phong ──────────
function drawMesh(mesh, modelMatrix, color, useTexture, texture) {
    gl.uniformMatrix4fv(uniforms.uModelMatrix, false, modelMatrix);
    gl.uniformMatrix3fv(uniforms.uNormalMatrix, false, normalMatrix3x3(modelMatrix));
    gl.uniform3fv(uniforms.uObjectColor, color);
    gl.uniform1i(uniforms.uUseTexture, useTexture ? 1 : 0);

    if (useTexture && texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(uniforms.uTextureSampler, 0);
    }

    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
    gl.bindVertexArray(null);
}

// ────────── Update ──────────
function update(dt) {
    totalTime += dt;
    updateCamera(dt);
}

// ────────── Render ──────────
let checkerTex;

function render() {
    gl.clearColor(0.08, 0.08, 0.12, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);

    // --- Projeção perspectiva ---
    const aspect = canvas.width / canvas.height;
    const proj   = perspective(Math.PI / 3, aspect, 0.1, 200.0);
    gl.uniformMatrix4fv(uniforms.uProjectionMatrix, false, proj);

    // --- View matrix da câmera ---
    const view = getViewMatrix();
    gl.uniformMatrix4fv(uniforms.uViewMatrix, false, view);

    // --- Posição da câmera para especular ---
    gl.uniform3fv(uniforms.uViewPosition, cameraState.position);

    // --- Luz animada (orbita em volta da cena) ---
    const lightRadius = 4.0;
    const lightHeight = 3.0;
    const lightPos = [
        Math.cos(totalTime * 0.8) * lightRadius,
        lightHeight,
        Math.sin(totalTime * 0.8) * lightRadius
    ];
    gl.uniform3fv(uniforms.uLightPosition, lightPos);
    gl.uniform3fv(uniforms.uLightColor,    [1.0, 0.95, 0.85]);  // luz quente

    // Material padrão
    gl.uniform1f(uniforms.uAmbientStrength,  0.15);
    gl.uniform1f(uniforms.uSpecularStrength, 0.6);
    gl.uniform1f(uniforms.uShininess,        32.0);

    // --- Chão (com textura xadrez) ---
    const planeModel = createIdentity();
    drawMesh(meshPlane, planeModel, [1,1,1], true, checkerTex);

    // --- Cubo central animado (cor sólida vermelha) ---
    let cubeModel = fromTranslation([0, 0.5, 0]);
    cubeModel = rotateY(cubeModel, totalTime * 1.2);
    cubeModel = rotateX(cubeModel, totalTime * 0.7);
    drawMesh(meshCube, cubeModel, [0.9, 0.2, 0.2], false, null);

    // --- Esfera com textura (orbita ao redor do cubo) ---
    const sx = Math.cos(totalTime * 0.5) * 2.5;
    const sz = Math.sin(totalTime * 0.5) * 2.5;
    const sphereModel = fromTranslation([sx, 1.0, sz]);
    drawMesh(meshSphere, sphereModel, [1,1,1], true, checkerTex);

    // --- Cubo estático (cor sólida azul) ---
    const cube2Model = fromTranslation([-3, 0.5, -2]);
    drawMesh(meshCube, cube2Model, [0.2, 0.4, 0.9], false, null);

    // --- Personagem carregado do OBJ ---
    if (meshCharacter) {
        let charModel = fromTranslation([0, 0, 0]);
        drawMesh(meshCharacter, charModel, [0.8, 0.75, 0.7], false, null);
    }

    // --- HUD ---
    const p = cameraState.position;
    document.getElementById('camPos').textContent =
        `(${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)})`;
    document.getElementById('lightPos').textContent =
        `(${lightPos[0].toFixed(1)}, ${lightPos[1].toFixed(1)}, ${lightPos[2].toFixed(1)})`;
}

// ────────── Game Loop ──────────
function gameLoop(currentTime) {
    const t  = currentTime * 0.001;
    const dt = Math.min(t - lastTime, 0.05); // cap 50ms para evitar saltos
    lastTime = t;

    update(dt);
    render();
    requestAnimationFrame(gameLoop);
}

// ────────── Init ──────────
async function init() {
    const setup = initWebGL('gameCanvas');
    if (!setup) return;
    gl     = setup.gl;
    canvas = setup.canvas;

    window.addEventListener('resize', () => resizeCanvas(gl, canvas));

    // Compila shaders
    program = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
    if (!program) return;

    uniforms = getUniformLocations(gl, program);

    // Meshes procedurais/embutidos
    meshCube   = createMesh(gl, program, parseOBJ(CUBE_OBJ));
    meshPlane  = createMesh(gl, program, parseOBJ(PLANE_OBJ));
    meshSphere = createMesh(gl, program, parseOBJ(generateSphereOBJ()));

    // Textura procedural
    checkerTex = createCheckerTexture(gl);

    // Câmera
    initCameraControls(canvas);

    // Carrega personagem do arquivo OBJ
    try {
        const charData = await loadOBJ('assets/obj/characters/FinalBaseMesh.obj');
        meshCharacter = createMesh(gl, program, charData);
        console.log(`✅ Personagem carregado: ${charData.vertexCount} vértices`);
    } catch (e) {
        console.warn('⚠️ Não foi possível carregar o personagem:', e.message);
        console.warn('   Certifique-se de rodar via servidor HTTP (ex: npx serve .)');
    }

    console.log("🎮 Cena inicializada! WASD para mover, clique no canvas para capturar o mouse.");

    requestAnimationFrame((t) => {
        lastTime = t * 0.001;
        gameLoop(t);
    });
}

window.onload = init;
