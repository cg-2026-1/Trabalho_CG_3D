// src/game/core/Camera.js
import { lookAt } from '../../engine/math/mat4.js';

export const cameraState = {
    position:    [0, 1.7, 5],
    yaw:         -Math.PI / 2,  // aponta para -Z inicialmente
    pitch:       0,
    speed:       4.0,
    sensitivity: 0.002
};

const keys = {};

export function initCameraControls(canvas) {
    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        // Previne scroll da página com WASD/espaço
        if (['w','a','s','d',' '].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup',   (e) => { keys[e.key.toLowerCase()] = false; });

    canvas.addEventListener('click', () => canvas.requestPointerLock());

    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== canvas) return;
        cameraState.yaw   += e.movementX * cameraState.sensitivity;
        cameraState.pitch -= e.movementY * cameraState.sensitivity;

        const limit = Math.PI / 2 - 0.01;
        cameraState.pitch = Math.max(-limit, Math.min(limit, cameraState.pitch));
    });
}

export function updateCamera(deltaTime) {
    const { yaw, pitch, speed } = cameraState;

    // Direção frontal projetada no plano XZ (sem voo, estilo FPS)
    const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
    const moveFront = [cosYaw,  0, sinYaw];
    const moveRight = [sinYaw,  0, -cosYaw]; // perpendicular no plano XZ

    const step = speed * deltaTime;

    if (keys['w']) { cameraState.position[0] += moveFront[0]*step; cameraState.position[2] += moveFront[2]*step; }
    if (keys['s']) { cameraState.position[0] -= moveFront[0]*step; cameraState.position[2] -= moveFront[2]*step; }
    if (keys['d']) { cameraState.position[0] -= moveRight[0]*step; cameraState.position[2] -= moveRight[2]*step; }
    if (keys['a']) { cameraState.position[0] += moveRight[0]*step; cameraState.position[2] += moveRight[2]*step; }
}

export function getViewMatrix() {
    const { position, yaw, pitch } = cameraState;
    const target = [
        position[0] + Math.cos(yaw) * Math.cos(pitch),
        position[1] + Math.sin(pitch),
        position[2] + Math.sin(yaw) * Math.cos(pitch)
    ];
    return lookAt(position, target, [0, 1, 0]);
}