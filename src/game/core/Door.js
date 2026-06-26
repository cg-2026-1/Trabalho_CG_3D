// src/game/core/Door.js
// Portas posicionadas nos vãos reais do map.obj + física de bloqueio.
// O mesh do cubo usado pelas portas é criado e cacheado AQUI DENTRO —
// não depende mais de receber meshCube de fora (evita bugs de ordenação
// entre módulos / undefined.vao).

import { createIdentity } from '../../engine/math/mat4.js';
import { createMesh, parseOBJ } from '../loader/ModelLoader.js';

// ─── Mesh próprio da porta (cubo unitário, criado e cacheado uma única vez) ───
const DOOR_CUBE_OBJ = `
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
f 1/1/1 2/2/1 3/3/1
f 1/1/1 3/3/1 4/4/1
f 6/1/2 5/2/2 8/3/2
f 6/1/2 8/3/2 7/4/2
f 2/1/3 6/2/3 7/3/3
f 2/1/3 7/3/3 3/4/3
f 5/1/4 1/2/4 4/3/4
f 5/1/4 4/3/4 8/4/4
f 4/1/5 3/2/5 7/3/5
f 4/1/5 7/3/5 8/4/5
f 5/1/6 6/2/6 2/3/6
f 5/1/6 2/3/6 1/4/6
`;

let _doorMesh = null;

function getDoorMesh(gl, program) {
    if (!_doorMesh) {
        _doorMesh = createMesh(gl, program, parseOBJ(DOOR_CUBE_OBJ));
        console.log('🚪 Mesh de porta criado:', _doorMesh);
    }
    return _doorMesh;
}

// ─── Dimensões da porta (calibradas com o map.obj) ────────────────────────────
// Cada vão do map.obj mede exatamente 2 unidades de largura e vai do piso
// (y=0) até y=4. Acima disso (y=4 → y=5) já existe uma verga sólida que faz
// parte da própria geometria do mapa — por isso a porta não precisa (e não
// deve) passar de 4 unidades de altura.
const DOOR_WIDTH  = 1.9;  // levemente menor que o vão (2.0) pra não cravar na parede
const DOOR_HEIGHT = 4.0;  // = altura real do vão no map.obj
const DOOR_DEPTH  = 0.2;  // espessura da folha da porta

const DOOR_COST       = 2;   // moedas para destrancar
const OPEN_AUTO_DIST  = 2.2;
const CLOSE_AUTO_DIST = 3.2;
const INTERACT_DIST   = 2.6;
const SLIDE_SPEED     = 2.6; // unidades/seg ao abrir/fechar

// Aproximação do player usada só para a física da porta (independente do
// MapCollider, que cuida das paredes "fixas" do map.obj).
const PLAYER_RADIUS     = 0.4;
const PLAYER_EYE_HEIGHT = 1.7; // = cameraState.baseHeight
const PLAYER_HEIGHT     = 1.8;

// ─── Centros das salas, extraídos diretamente dos vértices do map.obj ────────
const COLS = [-45.331474, -23.331474, -1.331472, 20.668528]; // X, oeste → leste
const ROWS = [-22, 0, 22, 44, 66];                            // Z, sul → norte

// Quais células (linha, coluna) realmente têm sala construída no map.obj
//                          col:  -45.3   -23.3    -1.3    20.7
const ROOM_EXISTS = [
    [ false,  false,  false,  true  ], // row -22  (Plane.016)
    [ true,   true,   true,   true  ], // row   0  (Plane.015/014/013/012)
    [ true,   true,   true,   true  ], // row  22  (Plane.008/007/006/011)
    [ true,   true,   true,   true  ], // row  44  (Plane.001/Plane/Plane.005/Plane.010)
    [ true,   true,   true,   true  ], // row  66  (Plane.003/002/004/009)
];

/**
 * Gera as portas com base no layout real do map.obj.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLProgram} program - o programa Phong já linkado (precisa pra
 *                                  criar o mesh interno da porta)
 * @param {object} bounds - aceito por compatibilidade, não é usado: as
 *                           posições vêm direto da geometria do mapa.
 */
export function createDoors(gl, program, bounds) {
    const mesh = getDoorMesh(gl, program);
    const doors = [];
    let nextId = 1;

    const makeDoor = (x, z, axis) => ({
        id:    `door_${nextId++}`,
        label: axis === 'z' ? 'Norte-Sul' : 'Leste-Oeste',
        cost:  DOOR_COST,
        position: [x, 0, z],
        axis,            // 'z' = porta larga em X (liga salas na vertical/Z)
                         // 'x' = porta larga em Z (liga salas na horizontal/X)
        mesh,

        color:       [0.55, 0.35, 0.15],
        lockedColor: [0.70, 0.18, 0.12],
        unlockColor: [0.55, 0.35, 0.15],

        locked:     true,
        open:       false,
        slideY:     0,
        targetY:    0,
        playerNear: false,

        promptVisible: false,
        promptText:    '',
    });

    // ── Portas Norte-Sul: ligam salas vizinhas na mesma coluna ───────────────
    for (let c = 0; c < COLS.length; c++) {
        for (let r = 0; r < ROWS.length - 1; r++) {
            if (ROOM_EXISTS[r][c] && ROOM_EXISTS[r + 1][c]) {
                doors.push(makeDoor(COLS[c], (ROWS[r] + ROWS[r + 1]) / 2, 'z'));
            }
        }
    }
    // Vão extra na parede sul da Plane.016 (não leva a nenhuma sala no mapa
    // atual, mas existe fisicamente no map.obj — por isso entra na lista).
    doors.push(makeDoor(COLS[3], -33, 'z'));

    // ── Portas Leste-Oeste: ligam salas vizinhas na mesma linha ──────────────
    for (let r = 0; r < ROWS.length; r++) {
        for (let c = 0; c < COLS.length - 1; c++) {
            if (ROOM_EXISTS[r][c] && ROOM_EXISTS[r][c + 1]) {
                doors.push(makeDoor((COLS[c] + COLS[c + 1]) / 2, ROWS[r], 'x'));
            }
        }
    }

    console.log(
        `🚪 ${doors.length} portas posicionadas ` +
        `(${doors.filter(d => d.axis === 'z').length} N-S, ${doors.filter(d => d.axis === 'x').length} L-O)`
    );
    return doors;
}

// ─── Update ────────────────────────────────────────────────────────────────────

export function updateDoors(doors, dt, playerPos, tryPay) {
    for (const door of doors) {
        const dist = doorDist(door, playerPos);

        door.promptVisible = false;
        door.promptText    = '';

        if (door.locked) {
            if (dist < INTERACT_DIST) {
                door.promptVisible = true;
                door.promptText = `[E] Abrir porta (${door.label}) — ${door.cost} moedas`;
            }
            door.targetY = 0; // trancada = sempre parede
        } else {
            if (dist < OPEN_AUTO_DIST) door.playerNear = true;
            else if (dist > CLOSE_AUTO_DIST) door.playerNear = false;

            door.targetY = door.playerNear ? DOOR_HEIGHT : 0;
        }

        const diff = door.targetY - door.slideY;
        if (Math.abs(diff) > 0.001) {
            const step = SLIDE_SPEED * dt;
            door.slideY += Math.sign(diff) * Math.min(step, Math.abs(diff));
        }

        door.open = door.slideY >= DOOR_HEIGHT - 0.05;
    }
}

export function tryInteractDoor(doors, playerPos, tryPay) {
    for (const door of doors) {
        if (!door.locked) continue;
        const dist = doorDist(door, playerPos);
        if (dist < INTERACT_DIST) {
            const success = tryPay(door.cost);
            if (success) {
                door.locked = false;
                door.color  = door.unlockColor;
                return `Porta desbloqueada!`;
            } else {
                return `Moedas insuficientes! Precisa de ${door.cost}.`;
            }
        }
    }
    return null;
}

// ─── Draw ──────────────────────────────────────────────────────────────────────

export function drawDoors(gl, uniforms, doors, normalMatrix3x3Fn) {
    for (const door of doors) {
        if (!door.mesh || !door.mesh.vao) {
            console.warn('⚠️ Porta sem mesh válido, pulando:', door.id);
            continue;
        }

        const baseY = DOOR_HEIGHT / 2;
        const px = door.position[0];
        const pz = door.position[2];

        let modelMatrix = createIdentity();
        modelMatrix = applyTranslation(modelMatrix, px, baseY + door.slideY, pz);

        if (door.axis === 'z') {
            modelMatrix = applyScale(modelMatrix, DOOR_WIDTH, DOOR_HEIGHT, DOOR_DEPTH);
        } else {
            modelMatrix = applyScale(modelMatrix, DOOR_DEPTH, DOOR_HEIGHT, DOOR_WIDTH);
        }

        const color = door.locked ? door.lockedColor : door.unlockColor;

        gl.uniformMatrix4fv(uniforms.uModelMatrix, false, modelMatrix);
        gl.uniformMatrix3fv(uniforms.uNormalMatrix, false, normalMatrix3x3Fn(modelMatrix));
        gl.uniform2fv(uniforms.uTexTiling, [1, 1]);
        gl.uniform1i(uniforms.uUseTexture, 0);
        gl.uniform3fv(uniforms.uObjectColor, color);

        gl.bindVertexArray(door.mesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, door.mesh.vertexCount);
        gl.bindVertexArray(null);

        drawDoorFrame(gl, uniforms, door, normalMatrix3x3Fn);
    }
}

function drawDoorFrame(gl, uniforms, door, normalMatrix3x3Fn) {
    if (!door.mesh || !door.mesh.vao) return;

    const frameColor = [0.28, 0.20, 0.12];
    const frameThick = 0.12;
    const px = door.position[0];
    const pz = door.position[2];

    const segments = door.axis === 'z'
        ? [
            { tx: px - DOOR_WIDTH / 2 - frameThick / 2, ty: DOOR_HEIGHT / 2, tz: pz, sx: frameThick, sy: DOOR_HEIGHT + frameThick * 2, sz: DOOR_DEPTH + 0.04 },
            { tx: px + DOOR_WIDTH / 2 + frameThick / 2, ty: DOOR_HEIGHT / 2, tz: pz, sx: frameThick, sy: DOOR_HEIGHT + frameThick * 2, sz: DOOR_DEPTH + 0.04 },
            { tx: px, ty: DOOR_HEIGHT + frameThick / 2, tz: pz, sx: DOOR_WIDTH + frameThick * 2, sy: frameThick, sz: DOOR_DEPTH + 0.04 },
          ]
        : [
            { tx: px, ty: DOOR_HEIGHT / 2, tz: pz - DOOR_WIDTH / 2 - frameThick / 2, sx: DOOR_DEPTH + 0.04, sy: DOOR_HEIGHT + frameThick * 2, sz: frameThick },
            { tx: px, ty: DOOR_HEIGHT / 2, tz: pz + DOOR_WIDTH / 2 + frameThick / 2, sx: DOOR_DEPTH + 0.04, sy: DOOR_HEIGHT + frameThick * 2, sz: frameThick },
            { tx: px, ty: DOOR_HEIGHT + frameThick / 2, tz: pz, sx: DOOR_DEPTH + 0.04, sy: frameThick, sz: DOOR_WIDTH + frameThick * 2 },
          ];

    for (const seg of segments) {
        let m = createIdentity();
        m = applyTranslation(m, seg.tx, seg.ty, seg.tz);
        m = applyScale(m, seg.sx, seg.sy, seg.sz);

        gl.uniformMatrix4fv(uniforms.uModelMatrix, false, m);
        gl.uniformMatrix3fv(uniforms.uNormalMatrix, false, normalMatrix3x3Fn(m));
        gl.uniform3fv(uniforms.uObjectColor, frameColor);

        gl.bindVertexArray(door.mesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, door.mesh.vertexCount);
        gl.bindVertexArray(null);
    }
}

// ─── Física / Colisão ──────────────────────────────────────────────────────────

/**
 * Verifica se a posição (x,y,z) do player colide com alguma porta no seu
 * estado ATUAL (fechada/trancada bloqueia; aberta o suficiente não bloqueia).
 */
export function isDoorBlocking(doors, pos) {
    const feetY = pos[1] - PLAYER_EYE_HEIGHT;
    const headY = feetY + PLAYER_HEIGHT;

    for (const door of doors) {
        const doorBottom = door.slideY;
        const doorTop    = door.slideY + DOOR_HEIGHT;

        // Sem overlap vertical → a essa altura o vão já está livre
        if (headY <= doorBottom || feetY >= doorTop) continue;

        const halfWidth = DOOR_WIDTH / 2 + PLAYER_RADIUS;
        const halfDepth = DOOR_DEPTH / 2 + PLAYER_RADIUS;
        const hx = door.axis === 'z' ? halfWidth : halfDepth;
        const hz = door.axis === 'z' ? halfDepth : halfWidth;

        const dx = Math.abs(pos[0] - door.position[0]);
        const dz = Math.abs(pos[2] - door.position[2]);

        if (dx < hx && dz < hz) return true;
    }
    return false;
}

/**
 * Resolve o movimento do player contra as portas: se a posição proposta
 * está bloqueada, tenta "deslizar" eixo a eixo; se não houver saída,
 * mantém a posição anterior (a porta funciona como parede sólida).
 */
export function resolveDoorCollision(doors, proposedPos, prevPos) {
    if (!isDoorBlocking(doors, proposedPos)) return proposedPos;

    const tryX = [proposedPos[0], proposedPos[1], prevPos[2]];
    if (!isDoorBlocking(doors, tryX)) return tryX;

    const tryZ = [prevPos[0], proposedPos[1], proposedPos[2]];
    if (!isDoorBlocking(doors, tryZ)) return tryZ;

    return [prevPos[0], proposedPos[1], prevPos[2]];
}

// ─── HUD ────────────────────────────────────────────────────────────────────────

export function updateDoorHUD(doors) {
    const el = document.getElementById('doorPrompt');
    if (!el) return;

    const active = doors.find(d => d.promptVisible);
    if (active) {
        el.textContent = active.promptText;
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
}

// ─── Helpers internos ───────────────────────────────────────────────────────────

function applyTranslation(m, tx, ty, tz) {
    const out = new Float32Array(m);
    out[12] = m[0]*tx + m[4]*ty + m[8]*tz  + m[12];
    out[13] = m[1]*tx + m[5]*ty + m[9]*tz  + m[13];
    out[14] = m[2]*tx + m[6]*ty + m[10]*tz + m[14];
    out[15] = m[3]*tx + m[7]*ty + m[11]*tz + m[15];
    return out;
}

function applyScale(m, sx, sy, sz) {
    const out = new Float32Array(16);
    out[0]  = m[0]*sx;  out[1]  = m[1]*sx;  out[2]  = m[2]*sx;  out[3]  = m[3]*sx;
    out[4]  = m[4]*sy;  out[5]  = m[5]*sy;  out[6]  = m[6]*sy;  out[7]  = m[7]*sy;
    out[8]  = m[8]*sz;  out[9]  = m[9]*sz;  out[10] = m[10]*sz; out[11] = m[11]*sz;
    out[12] = m[12];    out[13] = m[13];    out[14] = m[14];    out[15] = m[15];
    return out;
}

function doorDist(door, playerPos) {
    const dx = playerPos[0] - door.position[0];
    const dz = playerPos[2] - door.position[2];
    return Math.sqrt(dx*dx + dz*dz);
}