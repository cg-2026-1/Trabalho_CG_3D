// src/game/core/Camera.js
import { lookAt } from '../../engine/math/mat4.js';

export const cameraState = {
    position:    [0, 1.7, 5],
    yaw:         -Math.PI / 2,
    pitch:       0,
    walkSpeed:   4.0,
    sprintSpeed: 7.5,
    speed:       4.0,
    sensitivity: 0.002,
    
    // Física do pulo
    velocityY:   0,
    gravity:     -22.0,
    jumpForce:   8.0,
    isGrounded:  false,
    baseHeight:  1.7 // Altura do olho do jogador no chão
};

let arenaBounds = { minX: -9, maxX: 9, minZ: -9, maxZ: 9, margin: 0.4 };
export const keys = {}; // Exportado para lermos o Shift no main.js

export function initCameraControls(canvas) {
    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key === 'Shift') keys['shift'] = true;
        if (['w','a','s','d',' ', 'e'].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { 
        keys[e.key.toLowerCase()] = false; 
        if (e.key === 'Shift') keys['shift'] = false;
    });

    canvas.addEventListener('click', () => canvas.requestPointerLock());

    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== canvas) return;
        cameraState.yaw   += e.movementX * cameraState.sensitivity;
        cameraState.pitch -= e.movementY * cameraState.sensitivity;

        const limit = Math.PI / 2 - 0.01;
        cameraState.pitch = Math.max(-limit, Math.min(limit, cameraState.pitch));
    });
}

export function setArenaBounds(bounds) {
    arenaBounds = { ...arenaBounds, ...bounds };
}

export function updateCamera(deltaTime) {
    const { yaw, speed } = cameraState;

    const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
    const moveFront = [cosYaw,  0, sinYaw];
    const moveRight = [sinYaw,  0, -cosYaw];

    const step = speed * deltaTime;
    let dx = 0, dz = 0;
    
    // Verifica se está tentando se mover para drenar estamina depois
    cameraState.isMoving = false;

    if (keys['w']) { dx += moveFront[0]*step; dz += moveFront[2]*step; cameraState.isMoving = true;}
    if (keys['s']) { dx -= moveFront[0]*step; dz -= moveFront[2]*step; cameraState.isMoving = true;}
    if (keys['d']) { dx -= moveRight[0]*step; dz -= moveRight[2]*step; cameraState.isMoving = true;}
    if (keys['a']) { dx += moveRight[0]*step; dz += moveRight[2]*step; cameraState.isMoving = true;}

    // Aplica pulo e gravidade
    if (keys[' '] && cameraState.isGrounded) {
        cameraState.velocityY = cameraState.jumpForce;
        cameraState.isGrounded = false;
    }

    cameraState.velocityY += cameraState.gravity * deltaTime;
    cameraState.position[1] += cameraState.velocityY * deltaTime;

    // Colisão com o chão
    if (cameraState.position[1] <= cameraState.baseHeight) {
        cameraState.position[1] = cameraState.baseHeight;
        cameraState.velocityY = 0;
        cameraState.isGrounded = true;
    }

    // Colisão com paredes
    const m = arenaBounds.margin;
    const nx = cameraState.position[0] + dx;
    const nz = cameraState.position[2] + dz;

    cameraState.position[0] = Math.max(arenaBounds.minX + m, Math.min(arenaBounds.maxX - m, nx));
    cameraState.position[2] = Math.max(arenaBounds.minZ + m, Math.min(arenaBounds.maxZ - m, nz));
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

export function getViewDirection() {
    const { yaw, pitch } = cameraState;
    return [
        Math.cos(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.sin(yaw) * Math.cos(pitch),
    ];
}