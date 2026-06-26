// src/main.js — Dungeon FPS: arena texturizada + monstros-cubo + escopeta
import { playSound, updateMovementSound, startSoundtrack, stopSoundtrack} from "./game/audio/AudioManager.js";
import { initWebGL, resizeCanvas } from "./engine/renderer/webglSetup.js";
import {
  createDoors,
  updateDoors,
  drawDoors,
  tryInteractDoor,
  updateDoorHUD,
  isDoorBlocking,
  resolveDoorCollision,
} from "./game/core/Door.js";

import {
  vertexShaderSource,
  fragmentShaderSource,
  createShaderProgram,
  getUniformLocations,
  uploadLights,
  MAX_LIGHTS,
} from "./engine/shaders/phongShader.js";
import {
  createIdentity,
  fromTranslation,
  perspective,
  createCameraModelMatrix,
  scale,
  translate,
  rotateY,
} from "./engine/math/mat4.js";
import { parseOBJ, createMesh, loadOBJ } from "./game/loader/ModelLoader.js";
import {
  initCameraControls,
  updateCamera,
  getViewMatrix,
  getViewDirection,
  setArenaBounds,
  cameraState,
  keys,
} from "./game/core/Camera.js";
import { initMainMenu, showMenu, showVictoryMenu } from "./game/ui/MainMenu.js";
import {
  createDungeonArena,
  drawDungeonArena,
} from "./game/scenes/DungeonMap.js";
import { spawnMonsters } from "./game/core/Monster.js";
import { Weapon } from "./game/core/Weapon.js";
import {
  createStoneWallTexture,
  createStoneFloorTexture,
  createCeilingTexture,
} from "./engine/utils/TextureGenerator.js";
import { MapCollider } from "./game/core/MapCollider.js";

// ────────── Estado Global ──────────
let gl, canvas, program, uniforms;
let meshCube, meshCharacter, meshMonster;
let dungeonArena, dungeonTextures;
let mapCollider = null; // colisão precisa do OBJ do mapa
let monsters = [];
let pickups = [];
let coins = [];
let doors = [];
let weapon;
let lastTime = 0;
let totalTime = 0;
let paused = true;
let gameWon = false;
const exitZone = {
  position: [20.668528, 2.0, -34.5], // Centro (Y = 2 para encostar no chão sendo H=4)
  scale: [4, 4.0, 2.5],            // Largura, Altura, Profundidade
  color: [0.8, 1.0, 0.8]             // Tom esverdeado claro/brilhante
};
let score = 0;
let wasGrounded = true;
let prevCameraPos = [0, 1.7, 5];

// ────────── Estado do Jogador ──────────
const playerState = {
  hp: 100,
  maxHp: 100,
  stamina: 100,
  maxStamina: 100,
  iFrames: 0,
  dead: false,
  coins: 0,
};

// ────────── OBJ embutido do monstro (Fantasma/Espectro) ──────────
const MONSTER_OBJ = `
# Fantasma / Espectro de 8 lados (Octaedro alongado)
v 0.0 0.8 0.0
v -0.4 0.2 0.4
v 0.4 0.2 0.4
v 0.4 0.2 -0.4
v -0.4 0.2 -0.4
v 0.0 -0.8 0.0

vn -0.6 0.6 0.6
vn 0.6 0.6 0.6
vn 0.6 0.6 -0.6
vn -0.6 0.6 -0.6
vn -0.6 -0.6 0.6
vn 0.6 -0.6 0.6
vn 0.6 -0.6 -0.6
vn -0.6 -0.6 -0.6

# Metade de cima
f 1//1 2//1 3//1
f 1//2 3//2 4//2
f 1//3 4//3 5//3
f 1//4 5//4 2//4
# Metade de baixo
f 6//5 3//5 2//5
f 6//6 4//6 3//6
f 6//7 5//7 4//7
f 6//8 2//8 5//8
`;

// ────────── OBJ embutido do cubo ──────────
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

// ─────────────────────────────────────────────────────────────────────────────
// SISTEMA DE LUZES POR SALA + LUZ DA CÂMERA
// ─────────────────────────────────────────────────────────────────────────────
//
// Todas as luzes são passadas como array para o shader (uploadLights).
// Slot 0 = luz orbital animada principal (centro da arena)
// Slots 1..N-2 = luzes estáticas por sala/área do mapa
// Slot N-1 = luz da lanterna da câmera (segue o player, sempre o último slot)
//
// Se o mapa tiver salas definidas, edite ROOM_LIGHTS com as posições corretas.
// A luz da câmera é adicionada dinamicamente a cada frame.

/**
 * Luzes estáticas de sala. Cada entrada define uma tocha/lamparina num ponto do mapa.
 * Ajuste as posições conforme a geometria real do seu map.obj.
 * range: raio de influência em unidades do mundo (0 = infinito, não recomendado)
 */
const ROOM_LIGHTS = [
  // Corredores / salas — distribua conforme o layout do mapa
  // Formato: { position: [x, y, z], color: [r, g, b], range: N }
  { position: [-5,  3.0, -5 ], color: [1.0, 0.55, 0.20], range: 8  }, // sala NW
  { position: [ 5,  3.0, -5 ], color: [1.0, 0.55, 0.20], range: 8  }, // sala NE
  { position: [-5,  3.0,  5 ], color: [1.0, 0.55, 0.20], range: 8  }, // sala SW
  { position: [ 5,  3.0,  5 ], color: [1.0, 0.55, 0.20], range: 8  }, // sala SE
  { position: [ 0,  3.0,  0 ], color: [1.0, 0.70, 0.30], range: 10 }, // centro
  { position: [-8,  3.0,  0 ], color: [0.6, 0.40, 0.90], range: 6  }, // corredor W (tom roxo)
  { position: [ 8,  3.0,  0 ], color: [0.6, 0.40, 0.90], range: 6  }, // corredor E (tom roxo)
  // Slot MAX_LIGHTS-1 é reservado para a luz da câmera — não adicione mais que MAX_LIGHTS-1 aqui
];

/**
 * Constrói o array de luzes para o frame atual.
 * Inclui a luz orbital animada, as luzes de sala e a lanterna da câmera.
 *
 * @param {number} t           - tempo total (para animação)
 * @param {number[]} camPos    - posição da câmera [x, y, z]
 * @param {number[]} camDir    - direção de visão normalizada [x, y, z]
 * @returns {Array} array de luzes para uploadLights()
 */
function buildLightArray(t, camPos, camDir) {
  const lights = [];

  // ── Luz orbital animada (tocha flutuante no centro da arena) ──────────────
  const orbitRadius = 4.0;
  const orbitHeight = 3.0;
  lights.push({
    position: [
      Math.cos(t * 0.5) * orbitRadius,
      orbitHeight,
      Math.sin(t * 0.5) * orbitRadius,
    ],
    color: [1.0, 0.75, 0.45], // tom quente de antorcha
    range: 14,
  });

  // ── Luzes estáticas de sala ───────────────────────────────────────────────
  for (const rl of ROOM_LIGHTS) {
    if (lights.length >= MAX_LIGHTS - 1) break; // reserva slot final para câmera
    lights.push(rl);
  }

  // ── Luz da lanterna da câmera (sempre o último slot) ─────────────────────
  // Posicionada levemente na frente e abaixo da câmera para simular uma lanterna.
  const cameraLightOffset = 0.5; // metros na frente do player
  lights.push({
    position: [
      camPos[0] + camDir[0] * cameraLightOffset,
      camPos[1] + camDir[1] * cameraLightOffset - 0.15,
      camPos[2] + camDir[2] * cameraLightOffset,
    ],
    color: [0.85, 0.90, 1.0], // tom ligeiramente azulado (LED)
    range: 9,
  });

  return lights;
}

// ────────── Normal matrix 3x3 a partir da model matrix 4x4 ──────────
function normalMatrix3x3(modelMatrix) {
  const m = modelMatrix;
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];

  const det =
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20);
  if (Math.abs(det) < 1e-8)
    return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const inv = 1 / det;

  return new Float32Array([
    (a11 * a22 - a12 * a21) * inv,
    (a12 * a20 - a10 * a22) * inv,
    (a10 * a21 - a11 * a20) * inv,
    (a02 * a21 - a01 * a22) * inv,
    (a00 * a22 - a02 * a20) * inv,
    (a01 * a20 - a00 * a21) * inv,
    (a01 * a12 - a02 * a11) * inv,
    (a02 * a10 - a00 * a12) * inv,
    (a00 * a11 - a01 * a10) * inv,
  ]);
}

// ────────── Desenha uma mesh com cor sólida ou textura ──────────
function drawMesh(mesh, modelMatrix, color, useTexture, texture) {
  gl.uniformMatrix4fv(uniforms.uModelMatrix, false, modelMatrix);
  gl.uniformMatrix3fv(
    uniforms.uNormalMatrix,
    false,
    normalMatrix3x3(modelMatrix),
  );
  gl.uniform2fv(uniforms.uTexTiling, [1, 1]);
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

// ────────── HUD ──────────
function updateHUD(lights) {
  const p = cameraState.position;
  document.getElementById("camPos").textContent =
    `(${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)})`;

  // Mostra a posição da luz orbital (primeira luz) no HUD
  const orbitPos = lights[0]?.position ?? [0, 0, 0];
  document.getElementById("lightPos").textContent =
    `(${orbitPos[0].toFixed(1)}, ${orbitPos[1].toFixed(1)}, ${orbitPos[2].toFixed(1)})`;

  const coinEl = document.getElementById("coinCount");
  if (coinEl) coinEl.textContent = coins;
  const ammoEl = document.getElementById("ammoCount");
  if (ammoEl)
    ammoEl.textContent = weapon._reloading
      ? "recarregando..."
      : `${weapon.ammo} / ${weapon.maxAmmo}`;

  const aliveCount = monsters.filter((m) => m.alive).length;
  const monstersEl = document.getElementById("monsterCount");
  if (monstersEl) monstersEl.textContent = aliveCount;

  const scoreEl = document.getElementById("scoreCount");
  if (scoreEl) scoreEl.textContent = score;
  document.getElementById("hpBar").style.width =
    `${(playerState.hp / playerState.maxHp) * 100}%`;
  document.getElementById("spBar").style.width =
    `${(playerState.stamina / playerState.maxStamina) * 100}%`;
}

// ────────── Update ──────────
function update(dt) {
  if (paused || playerState.dead) return;
  totalTime += dt;

  prevCameraPos = [...cameraState.position];

  let isSprinting = false;

  // --- Mecânica de Estamina e Corrida ---
  if (
    keys["shift"] &&
    playerState.stamina > 0 &&
    cameraState.isMoving &&
    cameraState.isGrounded
  ) {
    cameraState.speed = cameraState.sprintSpeed;
    playerState.stamina -= 30 * dt;
    isSprinting = true;
  } else {
    cameraState.speed = cameraState.walkSpeed;
    if (playerState.stamina < playerState.maxStamina && !keys["shift"]) {
      playerState.stamina += 15 * dt;
    }
  }
  playerState.stamina = Math.max(0, Math.min(playerState.maxStamina, playerState.stamina));

  // --- Câmera + colisão do mapa OBJ ---
  updateCamera(dt, doors);
  resolveMapCollision();

  weapon.update(dt);

  // --- Lógica de Áudio: Pulo e Aterrissagem ---
  // Se estava no chão, a câmera não está mais, e a velocidade Y é positiva = Pulou
  if (wasGrounded && !cameraState.isGrounded && cameraState.velocityY > 0) {
      playSound('jump');
  } 
  // Se não estava no chão e agora a câmera está = Aterrissou
  else if (!wasGrounded && cameraState.isGrounded) {
      playSound('jump'); // Você pode usar o mesmo som pra bater no chão
  }

  // Atualiza a memória pro próximo frame
  wasGrounded = cameraState.isGrounded;

  updateDoors(doors, dt, cameraState.position, (cost) => {
    if (coins >= cost) {
      coins -= cost;
      return true;
    }
    return false;
  });
  updateDoorHUD(doors);

  // --- I-Frames ---
  if (playerState.iFrames > 0) {
    playerState.iFrames -= dt;
    if (playerState.iFrames <= 0)
      document.getElementById("damageOverlay").classList.remove("flash-red");
  }

  // --- Monstros ---
  const collisionDist = 1.2;
  for (const monster of monsters) {
    monster.update(dt, cameraState.position);
    if (!monster.alive) continue;

    const dx = cameraState.position[0] - monster.position[0];
    const dz = cameraState.position[2] - monster.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    const dy = Math.abs(cameraState.position[1] - monster.position[1]);

    if (dist < collisionDist && dy < 1.5 && playerState.iFrames <= 0) {
      playerState.hp -= 20;

      playSound('damage'); 
      
      playerState.iFrames = 1.5;
      document.getElementById("damageOverlay").classList.add("flash-red");

      if (playerState.hp <= 0) {
        playerState.hp = 0;
        playerState.dead = true;
        stopSoundtrack();
        document.getElementById("mainMenu").querySelector("h1").innerText = "VOCÊ MORREU";
        showMenu();
        document.exitPointerLock?.();
      }
    }
  }

  if (playerState.hp <= 0) {
        playerState.hp = 0;
        playerState.dead = true;

        stopSoundtrack(); 
        
        document.getElementById("mainMenu").querySelector("h1").innerText = "VOCÊ MORREU";
        showMenu();
        document.exitPointerLock?.();
      }

  // --- Pickups ---
  const pickupRadius = 1.2;
  for (let i = 0; i < pickups.length; i++) {
    let p = pickups[i];
    if (!p.active) continue;

    const dx = cameraState.position[0] - p.position[0];
    const dz = cameraState.position[2] - p.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < pickupRadius) {
      p.active = false;

      if (p.type === "health") {
        playerState.hp = Math.min(playerState.hp + 30, playerState.maxHp);
        console.log("Coletou Vida! HP: " + playerState.hp);
        playSound('life');
        
      } else if (p.type === "coin") {
        coins++;
        playSound('coin');
      }
    }
  }

  if (!gameWon) {
    const ex = exitZone.position[0];
    const ez = exitZone.position[2];
    const hx = exitZone.scale[0] / 2; // Metade da largura
    const hz = exitZone.scale[2] / 2; // Metade da profundidade

    const px = cameraState.position[0];
    const pz = cameraState.position[2];

    // Checagem de colisão AABB simples no eixo X e Z
    if (Math.abs(px - ex) < hx + 0.3 && Math.abs(pz - ez) < hz + 0.3) {
      gameWon = true;
      paused = true;
      stopSoundtrack();
      document.exitPointerLock?.();
      showVictoryMenu();
    }

  }

  // --- Lógica de Áudio: Passos ---
  updateMovementSound(cameraState.isMoving, isSprinting, cameraState.isGrounded);
}

// ─────────────────────────────────────────────────────────────────────────────
// COLISÃO DO MAPA OBJ — resolve a posição do player contra a geometria importada
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Aplica o MapCollider após updateCamera() mover o player.
 * Se o collider ainda não foi criado (mapa não carregado), não faz nada.
 *
 * O Camera.js já aplica colisão com a AABB da arena (paredes externas).
 * Este passo complementa com a geometria INTERNA do map.obj (paredes de salas,
 * pilares, rampas, etc.) que não é representada pela bounding box simples.
 */
function resolveMapCollision() {
  // 1) Portas: A colisão de portas JÁ É FEITA no updateCamera() do Camera.js!
  // Removemos a chamada duplicada e invertida daqui para não travar o jogador.

  // 2) Geometria do map.obj (paredes internas, pilares, chão real)
  if (!mapCollider) return;

  const pos = cameraState.position;
  
  // Enviamos a posição atual e a posição anterior corretamente
  const { pos: corrected, onGround, groundY } = mapCollider.resolve(pos, prevCameraPos);

  cameraState.position[0] = corrected[0];
  cameraState.position[1] = corrected[1];
  cameraState.position[2] = corrected[2];

  if (onGround && cameraState.velocityY <= 0) {
    cameraState.velocityY = 0;
    cameraState.isGrounded = true;
  }
}

// ────────── Disparo da escopeta ──────────
function tryFire() {
  if (paused) return;

  const origin = cameraState.position;
  const direction = getViewDirection();
  const result = weapon.fire(origin, direction, monsters);

  if (result.fired && result.killed) {
    score += 1;
    pickups.push({
      id: Date.now() + Math.random(),
      type: "coin",
      position: [result.hit.position[0], 0.4, result.hit.position[2]],
      active: true,
      baseY: 0.4,
      color: [1.0, 0.85, 0.0],
    });
  }

  if (result.fired) {
    playSound('shotgun');
    cameraState.pitch += 0.015;
  }
}

// Função procedural para criar itens espalhados pelo mapa
function spawnPickups(count, bounds) {
  const newPickups = [];
  const margin = 1.5;

  for (let i = 0; i < count; i++) {
    const x =
      bounds.minX +
      margin +
      Math.random() * (bounds.maxX - bounds.minX - 2 * margin);
    const z =
      bounds.minZ +
      margin +
      Math.random() * (bounds.maxZ - bounds.minZ - 2 * margin);

    // 100% de chance de ser vida
    const type = "health";

    newPickups.push({
      id: i,
      type,
      position: [x, 0.4, z],
      active: true,
      baseY: 0.4,
      color: [0.2, 0.8, 0.2]
    });
  }
  return newPickups;
}

// ────────── Render ──────────
function render() {
  gl.clearColor(0.04, 0.03, 0.05, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(program);

  const aspect = canvas.width / canvas.height;
  const proj = perspective(Math.PI / 3, aspect, 0.1, 200.0);
  gl.uniformMatrix4fv(uniforms.uProjectionMatrix, false, proj);

  const view = getViewMatrix();
  gl.uniformMatrix4fv(uniforms.uViewMatrix, false, view);
  gl.uniform3fv(uniforms.uViewPosition, cameraState.position);

  // ── Monta e envia array de luzes ──────────────────────────────────────────
  const camDir = getViewDirection();
  const lights = buildLightArray(totalTime, cameraState.position, camDir);
  uploadLights(gl, uniforms, lights);

  // ── Material Phong global ─────────────────────────────────────────────────
  gl.uniform1f(uniforms.uAmbientStrength,  0.10);
  gl.uniform1f(uniforms.uSpecularStrength, 0.45);
  gl.uniform1f(uniforms.uShininess,        24.0);

  // ── Muzzle flash ──────────────────────────────────────────────────────────
  const flashPos = [
    cameraState.position[0] + camDir[0] * 0.6,
    cameraState.position[1] + camDir[1] * 0.6 - 0.1,
    cameraState.position[2] + camDir[2] * 0.6,
  ];
  gl.uniform3fv(uniforms.uFlashPosition, flashPos);
  gl.uniform3fv(uniforms.uFlashColor,    [1.0, 0.6, 0.2]);
  gl.uniform1f(uniforms.uFlashIntensity, weapon.getFlashIntensity());

  // ── Triplanar: desligado por padrão ──────────────────────────────────────
  gl.uniform1i(uniforms.uTriplanar,    0);
  gl.uniform1f(uniforms.uTriplanarScale, 0.5);

  // ── Arena (chão + teto) ───────────────────────────────────────────────────
  drawDungeonArena(gl, uniforms, dungeonArena, createIdentity(), dungeonTextures);
  drawDoors(gl, uniforms, doors, normalMatrix3x3);

  // ── Monstros ──────────────────────────────────────────────────────────────
  // getModelMatrix usa yawTowards() corrigido → face +Z do cubo aponta para o player
  for (const monster of monsters) {
    if (!monster.alive) continue;
    const model = monster.getModelMatrix(cameraState.position);
    const darkBloodColor = [0.4, 0.02, 0.05];
    drawMesh(meshMonster, model, monster.color, false, null);
  }

  // ── Bloco da Zona de Saída ────────────────────────────────────────────────
  let exitMatrix = createIdentity();
  exitMatrix = translate(exitMatrix, exitZone.position);
  exitMatrix = scale(exitMatrix, exitZone.scale);
  drawMesh(meshCube, exitMatrix, exitZone.color, false, null);

  // ── Mapa OBJ externo (com triplanar) ─────────────────────────────────────
  if (meshCharacter) {
    const charModel = fromTranslation([0, 0, 0]);
    gl.uniformMatrix4fv(uniforms.uModelMatrix,  false, charModel);
    gl.uniformMatrix3fv(uniforms.uNormalMatrix, false, normalMatrix3x3(charModel));
    gl.uniform2fv(uniforms.uTexTiling,   [1, 1]);
    gl.uniform1i(uniforms.uUseTexture,   1);
    gl.uniform1i(uniforms.uTriplanar,    1);
    gl.uniform1f(uniforms.uTriplanarScale, 0.5);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dungeonTextures.wall);
    gl.uniform1i(uniforms.uTextureSampler, 0);

    gl.bindVertexArray(meshCharacter.vao);
    gl.drawArrays(gl.TRIANGLES, 0, meshCharacter.vertexCount);
    gl.bindVertexArray(null);

    gl.uniform1i(uniforms.uTriplanar, 0); // reseta para os outros objetos
  }

  // ── Arma (mão direita da câmera) ─────────────────────────────────────────
  let gunMatrix = createCameraModelMatrix(
    cameraState.position,
    cameraState.pitch,
    cameraState.yaw,
  );
  gunMatrix = translate(gunMatrix, [0.35, -0.25, -0.5]);
  gunMatrix = scale(gunMatrix, [0.08, 0.08, 0.4]);
  drawMesh(meshCube, gunMatrix, [0.2, 0.2, 0.2], false, null);

  // ── Muzzle Flash Visual ───────────────────────────────────────────────────
  if (weapon.flashTimer > 0) {
    let flashMatrix = createCameraModelMatrix(
      cameraState.position,
      cameraState.pitch,
      cameraState.yaw,
    );
    flashMatrix = translate(flashMatrix, [0.35, -0.25, -0.75]);
    const fs = 0.05 + weapon.flashTimer * 0.5;
    flashMatrix = scale(flashMatrix, [fs, fs, fs]);
    drawMesh(meshCube, flashMatrix, [1.0, 0.8, 0.2], false, null);
  }

  // ── Pickups ───────────────────────────────────────────────────────────────
  for (let i = 0; i < pickups.length; i++) {
    let p = pickups[i];
    if (!p.active) continue;

    let model = createIdentity();
    const floatOffset = Math.sin(totalTime * 3.0 + p.id) * 0.15;
    model = translate(model, [p.position[0], p.baseY + floatOffset, p.position[2]]);
    model = rotateY(model, totalTime * 1.5 + p.id);
    model = scale(model, [0.3, 0.3, 0.3]);
    drawMesh(meshCube, model, p.color, false, null);
  }

  updateHUD(lights);
}

// ────────── Game Loop ──────────
function gameLoop(currentTime) {
  const t = currentTime * 0.001;
  const dt = Math.min(t - lastTime, 0.05);
  lastTime = t;

  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

// ────────── Reset ──────────
function resetGame() {
  gameWon = false;
  playerState.hp = 100;
  playerState.stamina = 100;
  playerState.iFrames = 0;
  playerState.dead = false;
  score = 0;
  coins = 0;

  cameraState.position = [0, 1.7, 5];
  cameraState.yaw = -Math.PI / 2;
  cameraState.pitch = 0;
  cameraState.velocityY = 0;
  cameraState.isGrounded = true;

  if (weapon) {
    weapon.ammo = weapon.maxAmmo;
    weapon._reloading = false;
    weapon._cooldown = 0;
  }

  document.getElementById("damageOverlay").classList.remove("flash-red");
  document.getElementById("mainMenu").querySelector("h1").innerText =
    "Dungeon Escape";

  monsters = spawnMonsters(100, dungeonArena.bounds, { safeRadius: 3.5 });
  pickups = spawnPickups(500, dungeonArena.bounds);
  doors = createDoors(gl, program, dungeonArena.bounds);
}

// ────────── Init ──────────
async function init() {
  const setup = initWebGL("gameCanvas");
  if (!setup) return;
  gl = setup.gl;
  canvas = setup.canvas;

  window.addEventListener("resize", () => resizeCanvas(gl, canvas));

  program = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
  if (!program) return;

  uniforms = getUniformLocations(gl, program);

  // Mesh do cubo (monstros, arma, pickups)
  meshCube = createMesh(gl, program, parseOBJ(CUBE_OBJ));

  // Mesh do monstro (fantasma/espectro)
  meshMonster = createMesh(gl, program, parseOBJ(MONSTER_OBJ));

  // Arena da dungeon
  dungeonArena = createDungeonArena(gl, program, {
    halfX: 60,
    halfZ: 80,
    height: 4,
    wallTiling:  [8, 2],
    floorTiling: [64, 64],
    ceilTiling:  [64, 64],
  });
  dungeonTextures = {
    wall:  createStoneWallTexture(gl),
    floor: createStoneFloorTexture(gl),
    ceil:  createCeilingTexture(gl),
  };

  // Limites da arena para colisão de parede (AABB simples da arena externa)
  setArenaBounds(dungeonArena.bounds);

  // Escopeta
  weapon = new Weapon({
    damage: 1,
    fireRate: 0.55,
    maxAmmo: 8,
    reloadTime: 1.6,
    range: 60,
  });

  initCameraControls(canvas);

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0 && document.pointerLockElement === canvas) {
      tryFire();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r") {
      if (!weapon._reloading && weapon.ammo < weapon.maxAmmo) {
            weapon.startReload();
            playSound('reload');
        }
    }
    if (e.key === "Escape") {
      paused = true;
      showMenu();
      document.exitPointerLock?.();
      stopSoundtrack();
    }
    if (e.key.toLowerCase() === "e") {
      const msg = tryInteractDoor(doors, cameraState.position, (cost) => {
        if (coins >= cost) {
          coins -= cost;
          return true;
        }
        return false;
      });
      
      if (msg) {
          console.log(msg); 
          if (msg.includes("desbloqueada")) {
              playSound('door');
          }
      }
    }
  });

  // ── Carrega o mapa OBJ externo + constrói o collider ─────────────────────
  try {
    const charData = await loadOBJ("assets/obj/map/map.obj");
    meshCharacter = createMesh(gl, program, charData);
    console.log(`✅ Mapa carregado: ${charData.vertexCount} vértices`);

    // COLISÃO PRECISA: constrói o MapCollider a partir dos triângulos do OBJ.
    // O mapa é desenhado com model matrix identity (posição [0,0,0]), então
    // passamos null para usar os vértices no espaço do mundo diretamente.
    mapCollider = new MapCollider(charData, null);

  } catch (e) {
    console.warn("⚠️ Mapa OBJ não carregado:", e.message);
    mapCollider = null;
  }

  monsters = spawnMonsters(100, dungeonArena.bounds, { safeRadius: 3.5 });
  doors = createDoors(gl, program, dungeonArena.bounds);
  pickups = spawnPickups(500, dungeonArena.bounds);

  initMainMenu(() => {
    resetGame();

    startSoundtrack();

    paused = false;
    requestAnimationFrame((t) => {
      lastTime = t * 0.001;
      gameLoop(t);
    });
  });
}

window.onload = init;