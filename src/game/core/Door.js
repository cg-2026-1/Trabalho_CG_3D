
import { createMesh, parseOBJ } from '../loader/ModelLoader.js';
import { createIdentity, fromTranslation, scale } from '../../engine/math/mat4.js';

const DOOR_WIDTH   = 1.8; 
const DOOR_HEIGHT  = 2.8; 
const DOOR_DEPTH   = 0.18; 

const OPEN_AUTO_DIST  = 2.0;
const CLOSE_AUTO_DIST = 3.0; 
const INTERACT_DIST   = 2.5; 

const SLIDE_SPEED = 1.8; 

/**
 * @param {object} bounds  - dungeonArena.bounds {minX,maxX,minZ,maxZ,height}
 * @param {object} meshCube - a mesh de cubo já criada no main.js
 * @returns {Door[]}
 */
export function createDoors(bounds, meshCube) {
    const { minX, maxX, minZ, maxZ, height } = bounds;
    const midX = (minX + maxX) / 2;
    const midZ = (minZ + maxZ) / 2;

  
    const doorDefs = [
        {
            id:       'north',
            label:    'Norte',
            cost:     2,
            position: [midX, 0, minZ],
            axis:     'z',  
            color:    [0.55, 0.35, 0.15],  
            lockedColor:  [0.7,  0.18, 0.12],  
            unlockColor:  [0.55, 0.35, 0.15],  
        },
        {
            id:       'south',
            label:    'Sul',
            cost:     2,
            position: [midX, 0, maxZ],
            axis:     'z',
            color:    [0.55, 0.35, 0.15],
            lockedColor:  [0.7,  0.18, 0.12],
            unlockColor:  [0.55, 0.35, 0.15],
        },
        {
            id:       'east',
            label:    'Leste',
            cost:     3,
            position: [maxX, 0, midZ],
            axis:     'x',  // parede é perpendicular a X → porta larga em Z
            color:    [0.55, 0.35, 0.15],
            lockedColor:  [0.7,  0.18, 0.12],
            unlockColor:  [0.55, 0.35, 0.15],
        },
        {
            id:       'west',
            label:    'Oeste',
            cost:     3,
            position: [minX, 0, midZ],
            axis:     'x',
            color:    [0.55, 0.35, 0.15],
            lockedColor:  [0.7,  0.18, 0.12],
            unlockColor:  [0.55, 0.35, 0.15],
        },
    ];

    return doorDefs.map(def => ({
        ...def,
        mesh: meshCube,

        // Estado
        locked:    true,   // ainda não foi paga
        open:      false,  // aberta (deslizou completamente)
        slideY:    0,      // deslocamento atual em Y (0 = fechada, DOOR_HEIGHT = fora da vista)
        targetY:   0,      // Y alvo para lerp
        playerNear: false, // player está perto (para auto-open depois de desbloqueada)

        // Sinalização para o HUD
        promptVisible: false,
        promptText:    '',
    }));
}

// ─── Update ────────────────────────────────────────────────────────────────────

/**
 * Atualiza o estado de cada porta a cada frame.
 *
 * @param {Door[]} doors
 * @param {number} dt              - delta time
 * @param {number[]} playerPos     - [x,y,z]
 * @param {object}  playerState    - { coins, ... } — NÃO modifica moedas aqui
 * @param {function} tryPay        - (cost: number) => boolean — debita moedas externamente
 */
export function updateDoors(doors, dt, playerPos, tryPay) {
    for (const door of doors) {
        const dist = doorDist(door, playerPos);

        door.promptVisible = false;
        door.promptText    = '';

        if (door.locked) {
            // Mostra prompt se o player estiver perto o suficiente
            if (dist < INTERACT_DIST) {
                door.promptVisible = true;
                door.promptText = `[E] Abrir porta ${door.label} — ${door.cost} moedas`;
            }
            // Porta bloqueada fica parada (targetY = 0)
            door.targetY = 0;
        } else {
            // Desbloqueada: decide abrir/fechar por proximidade
            if (dist < OPEN_AUTO_DIST) {
                door.playerNear = true;
            } else if (dist > CLOSE_AUTO_DIST) {
                door.playerNear = false;
            }

            door.targetY = door.playerNear ? DOOR_HEIGHT : 0;
        }

        // Suaviza o slide (lerp simples com velocidade constante)
        const diff = door.targetY - door.slideY;
        if (Math.abs(diff) > 0.001) {
            const step = SLIDE_SPEED * dt;
            door.slideY += Math.sign(diff) * Math.min(step, Math.abs(diff));
        }

        // Marca como "totalmente aberta" para eventualmente desativar colisão
        door.open = door.slideY >= DOOR_HEIGHT - 0.05;
    }
}

/**
 * Tenta interagir (pagar) com a porta mais próxima que ainda está bloqueada.
 * Chamado quando o player pressiona E.
 *
 * @param {Door[]}   doors
 * @param {number[]} playerPos
 * @param {function} tryPay   - (cost) => boolean
 * @returns {string|null}     - mensagem de feedback ou null
 */
export function tryInteractDoor(doors, playerPos, tryPay) {
    for (const door of doors) {
        if (!door.locked) continue;
        const dist = doorDist(door, playerPos);
        if (dist < INTERACT_DIST) {
            const success = tryPay(door.cost);
            if (success) {
                door.locked = false;
                door.color  = door.unlockColor;
                return `Porta ${door.label} desbloqueada!`;
            } else {
                return `Moedas insuficientes! Precisa de ${door.cost}.`;
            }
        }
    }
    return null;
}

// ─── Draw ──────────────────────────────────────────────────────────────────────

/**
 * Desenha as 4 portas. Chame APÓS drawDungeonArena, antes do HUD.
 * Espera que gl.useProgram e uniforms já estejam configurados.
 */
export function drawDoors(gl, uniforms, doors, normalMatrix3x3Fn) {
    for (const door of doors) {
        // A porta desliza para cima: translate em Y pelo slideY
        // Posição base: centro horizontal na parede, base no chão (Y=0)
        // O cubo vai de -0.5 a +0.5 em cada eixo, então a base do cubo
        // está em Y = scaleY/2 (= DOOR_HEIGHT/2).

        const baseY = DOOR_HEIGHT / 2;  // centro geométrico do cubo no chão
        const px = door.position[0];
        const pz = door.position[2];

        let modelMatrix = createIdentity();

        // Translação: posição na parede + slide vertical
        modelMatrix = applyTranslation(modelMatrix, px, baseY + door.slideY, pz);

        // Escala: largura × altura × espessura dependendo do eixo da parede
        if (door.axis === 'z') {
            // Parede N/S: larga em X, fina em Z
            modelMatrix = applyScale(modelMatrix, DOOR_WIDTH, DOOR_HEIGHT, DOOR_DEPTH);
        } else {
            // Parede L/O: larga em Z, fina em X
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

        // Frame/moldura da porta (cubo fino ao redor, cor mais clara)
        drawDoorFrame(gl, uniforms, door, normalMatrix3x3Fn);
    }
}

/**
 * Desenha a moldura estática da porta (fica na parede mesmo quando a porta sobe).
 */
function drawDoorFrame(gl, uniforms, door, normalMatrix3x3Fn) {
    const frameColor = [0.28, 0.20, 0.12]; // madeira mais escura
    const frameThick = 0.12;
    const px = door.position[0];
    const pz = door.position[2];

    const segments = door.axis === 'z'
        ? [
            // Lateral esquerda
            { tx: px - DOOR_WIDTH / 2 - frameThick / 2, ty: DOOR_HEIGHT / 2, tz: pz, sx: frameThick, sy: DOOR_HEIGHT + frameThick * 2, sz: DOOR_DEPTH + 0.04 },
            // Lateral direita
            { tx: px + DOOR_WIDTH / 2 + frameThick / 2, ty: DOOR_HEIGHT / 2, tz: pz, sx: frameThick, sy: DOOR_HEIGHT + frameThick * 2, sz: DOOR_DEPTH + 0.04 },
            // Topo
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

// ─── Colisão ───────────────────────────────────────────────────────────────────

/**
 * Verifica se a posição do player colide com alguma porta fechada.
 * Use isto em updateCamera antes de aplicar o movimento, ou logo após,
 * para empurrar o player de volta.
 *
 * Retorna o vetor de correção [dx, dz] a subtrair da posição, ou [0,0].
 *
 * Alternativa mais simples (e compatível com a câmera atual):
 * chame isDoorBlocking() nas colisões de parede do Camera.js.
 *
 * @param {Door[]}   doors
 * @param {number[]} pos  - posição nova proposta [x, y, z]
 * @returns {boolean}     - true se está bloqueado por uma porta fechada
 */
export function isDoorBlocking(doors, pos) {
    for (const door of doors) {
        // Porta aberta (deslizou) não bloqueia
        if (door.open) continue;

        const hw = (door.axis === 'z' ? DOOR_WIDTH  : DOOR_DEPTH)  / 2 + 0.1;
        const hd = (door.axis === 'z' ? DOOR_DEPTH  : DOOR_WIDTH)  / 2 + 0.1;
        const hh = DOOR_HEIGHT - door.slideY;

        const dx = Math.abs(pos[0] - door.position[0]);
        const dy = pos[1] - 0;  // base do player
        const dz = Math.abs(pos[2] - door.position[2]);

        if (dx < hw && dz < hd && dy < hh) return true;
    }
    return false;
}

// ─── HUD de prompts ────────────────────────────────────────────────────────────

/**
 * Atualiza o elemento HTML do prompt de interação.
 * Coloque um <div id="doorPrompt"> no index.html, escondido por padrão.
 */
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

// ─── Helpers matemáticos internos ─────────────────────────────────────────────
// (evita importar funções extras de mat4.js — usa as que já estão no contexto)

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