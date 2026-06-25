// src/main.js — Dungeon FPS: arena texturizada + monstros-cubo + escopeta
import { initWebGL, resizeCanvas } from "./engine/renderer/webglSetup.js";
import {
  createDoors,
  updateDoors,
  drawDoors,
  tryInteractDoor,
  updateDoorHUD,
  isDoorBlocking,
} from "./game/core/Door.js";

import {
  vertexShaderSource,
  fragmentShaderSource,
  createShaderProgram,
  getUniformLocations,
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
import { initMainMenu, showMenu } from "./game/ui/MainMenu.js";
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

// ────────── Estado Global ──────────
let gl, canvas, program, uniforms;
let meshCube, meshCharacter;
let dungeonArena, dungeonTextures;
let monsters = [];
let pickups = [];
let coins = [];
let doors = [];
let weapon;
let lastTime = 0;
let totalTime = 0;
let paused = true;
let score = 0;

// ────────── Estado do Jogador ──────────
const playerState = {
  hp: 100,
  maxHp: 100,
  stamina: 100,
  maxStamina: 100,
  iFrames: 0, // Cooldown de hit
  dead: false,
  coins: 0,
};

// ────────── OBJ embutido do cubo (usado para monstros e props) ──────────
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

// ────────── Normal matrix 3x3 a partir da model matrix 4x4 ──────────
function normalMatrix3x3(modelMatrix) {
  const m = modelMatrix;
  const a00 = m[0],
    a01 = m[1],
    a02 = m[2];
  const a10 = m[4],
    a11 = m[5],
    a12 = m[6];
  const a20 = m[8],
    a21 = m[9],
    a22 = m[10];

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
function updateHUD(lightPos) {
  const p = cameraState.position;
  document.getElementById("camPos").textContent =
    `(${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)})`;
  document.getElementById("lightPos").textContent =
    `(${lightPos[0].toFixed(1)}, ${lightPos[1].toFixed(1)}, ${lightPos[2].toFixed(1)})`;
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

  // --- Mecânica de Estamina e Corrida ---
  if (
    keys["shift"] &&
    playerState.stamina > 0 &&
    cameraState.isMoving &&
    cameraState.isGrounded
  ) {
    cameraState.speed = cameraState.sprintSpeed;
    playerState.stamina -= 30 * dt; // Drena 30 por segundo
  } else {
    cameraState.speed = cameraState.walkSpeed;
    if (playerState.stamina < playerState.maxStamina && !keys["shift"]) {
      playerState.stamina += 15 * dt; // Regenera 15 por segundo
    }
  }
  // Clamp estamina
  playerState.stamina = Math.max(
    0,
    Math.min(playerState.maxStamina, playerState.stamina),
  );

  updateCamera(dt);
  weapon.update(dt);
  updateDoors(doors, dt, cameraState.position, (cost) => {
    if (coins >= cost) {
      coins -= cost;
      return true;
    }
    return false;
  });
  updateDoorHUD(doors);
  // --- I-Frames (Cooldown de Hit) ---
  if (playerState.iFrames > 0) {
    playerState.iFrames -= dt;
    if (playerState.iFrames <= 0)
      document.getElementById("damageOverlay").classList.remove("flash-red");
  }

  // --- Lógica de Monstros e Colisão (Dano) ---
  const collisionDist = 1.2; // Raio do player + Raio do monstro

  for (const monster of monsters) {
    monster.update(dt, cameraState.position);

    if (!monster.alive) continue;

    // Distância no plano XZ
    const dx = cameraState.position[0] - monster.position[0];
    const dz = cameraState.position[2] - monster.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Verifica colisão horizontal e de altura (para não levar dano se pular muito alto)
    const dy = Math.abs(cameraState.position[1] - monster.position[1]);

    if (dist < collisionDist && dy < 1.5 && playerState.iFrames <= 0) {
      playerState.hp -= 20; // Toma dano
      playerState.iFrames = 1.5; // Fica invulnerável por 1.5 segundos

      // Efeito visual de dano na tela
      document.getElementById("damageOverlay").classList.add("flash-red");

      if (playerState.hp <= 0) {
        playerState.hp = 0;
        playerState.dead = true;
        document.getElementById("mainMenu").querySelector("h1").innerText =
          "VOCÊ MORREU";
        showMenu();
        document.exitPointerLock?.();
      }
    }
  }

  const pickupRadius = 1.2; // Distância para pegar o item

  for (let i = 0; i < pickups.length; i++) {
    let p = pickups[i];
    if (!p.active) continue;

    // Distância do jogador para o item (plano XZ)
    const dx = cameraState.position[0] - p.position[0];
    const dz = cameraState.position[2] - p.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Se estiver perto o suficiente, coleta o item
    if (dist < pickupRadius) {
      p.active = false; // Desativa o item do mapa

      if (p.type === "health") {
        playerState.hp = Math.min(playerState.hp + 30, playerState.maxHp);
        console.log("Coletou Vida! HP: " + playerState.hp);
      } else if (p.type === "ammo") {
        weapon.ammo = Math.min(weapon.ammo + 4, weapon.maxAmmo);
        console.log("Coletou Munição! Balas: " + weapon.ammo);
      } else if (p.type === "coin") {
        coins++;
        console.log("Moedas: " + coins);
      }
    }
  }
}

// ────────── Disparo da escopeta (clique esquerdo) ──────────
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
    cameraState.pitch += 0.015;
  }
}

function spawnCoin(position) {
  coins.push({
    position: [...position],
    active: true,
    rotation: 0,
  });
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

    // 50% de chance de ser vida, 50% de ser munição
    const type = Math.random() > 0.5 ? "health" : "ammo";

    newPickups.push({
      id: i,
      type: type,
      position: [x, 0.4, z], // Altura base do chão
      active: true,
      baseY: 0.4, // Usado para a animação de flutuação
      color: type === "health" ? [0.2, 0.8, 0.2] : [0.8, 0.6, 0.1], // Verde (vida) e Dourado (munição)
    });
  }
  return newPickups;
}

// ────────── Render ──────────
function render() {
  gl.clearColor(0.04, 0.03, 0.05, 1.0); // tom roxo-escuro de masmorra
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(program);

  const aspect = canvas.width / canvas.height;
  const proj = perspective(Math.PI / 3, aspect, 0.1, 200.0);
  gl.uniformMatrix4fv(uniforms.uProjectionMatrix, false, proj);

  const view = getViewMatrix();
  gl.uniformMatrix4fv(uniforms.uViewMatrix, false, view);
  gl.uniform3fv(uniforms.uViewPosition, cameraState.position);

  // Luz principal animada (orbital, estilo torch flutuante)
  const lightRadius = 4.0;
  const lightHeight = 3.0;
  const lightPos = [
    Math.cos(totalTime * 0.5) * lightRadius,
    lightHeight,
    Math.sin(totalTime * 0.5) * lightRadius,
  ];
  gl.uniform3fv(uniforms.uLightPosition, lightPos);
  gl.uniform3fv(uniforms.uLightColor, [1.0, 0.75, 0.45]); // tom de antorcha

  gl.uniform1f(uniforms.uAmbientStrength, 0.12);
  gl.uniform1f(uniforms.uSpecularStrength, 0.5);
  gl.uniform1f(uniforms.uShininess, 24.0);

  // Muzzle flash da luz de cena: posiciona a "luz do tiro" um pouco na frente da câmera
  const dir = getViewDirection();
  const flashPos = [
    cameraState.position[0] + dir[0] * 0.6,
    cameraState.position[1] + dir[1] * 0.6 - 0.1,
    cameraState.position[2] + dir[2] * 0.6,
  ];
  gl.uniform3fv(uniforms.uFlashPosition, flashPos);
  gl.uniform3fv(uniforms.uFlashColor, [1.0, 0.6, 0.2]);
  gl.uniform1f(uniforms.uFlashIntensity, weapon.getFlashIntensity());

  // --- Dungeon (chão, teto, paredes) ---
  drawDungeonArena(
    gl,
    uniforms,
    dungeonArena,
    createIdentity(),
    dungeonTextures,
  );
  drawDoors(gl, uniforms, doors, normalMatrix3x3);

  // --- Monstros (cubos virados para o player) ---
  for (const monster of monsters) {
    if (!monster.alive) continue;
    const model = monster.getModelMatrix(cameraState.position);
    drawMesh(meshCube, model, monster.color, false, null);
  }

    // --- Personagem OBJ externo (se carregado) ---
    if (meshCharacter) {
        let charModel = fromTranslation([0, 0, 0]); // ajuste a posição conforme necessário
    
        gl.uniformMatrix4fv(uniforms.uModelMatrix, false, charModel);
        gl.uniformMatrix3fv(uniforms.uNormalMatrix, false, normalMatrix3x3(charModel));
        gl.uniform2fv(uniforms.uTexTiling, [1, 1]);
        gl.uniform1i(uniforms.uUseTexture, 1);
        gl.uniform1i(uniforms.uTriplanar, 1);
        gl.uniform1f(uniforms.uTriplanarScale, 0.5); // ~1 tile a cada 6-7 unidades
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, dungeonTextures.wall);
        gl.uniform1i(uniforms.uTextureSampler, 0);
        
        gl.bindVertexArray(meshCharacter.vao);
        gl.drawArrays(gl.TRIANGLES, 0, meshCharacter.vertexCount);
        gl.bindVertexArray(null);
        
        gl.uniform1i(uniforms.uTriplanar, 0); // reseta para os outros objetos
    }

  // --- Desenho da Arma (Mão Direita da Câmera) ---
  // Cria a matriz baseada na visão do jogador e ajusta a posição local
  let gunMatrix = createCameraModelMatrix(
    cameraState.position,
    cameraState.pitch,
    cameraState.yaw,
  );
  gunMatrix = translate(gunMatrix, [0.35, -0.25, -0.5]);
  gunMatrix = scale(gunMatrix, [0.08, 0.08, 0.4]);
  drawMesh(meshCube, gunMatrix, [0.2, 0.2, 0.2], false, null);

  // --- Muzzle Flash Visual (Cubo incandescente na ponta da arma) ---
  if (weapon.flashTimer > 0) {
    let flashMatrix = createCameraModelMatrix(
      cameraState.position,
      cameraState.pitch,
      cameraState.yaw,
    );
    flashMatrix = translate(flashMatrix, [0.35, -0.25, -0.75]);
    const flashScale = 0.05 + weapon.flashTimer * 0.5;
    flashMatrix = scale(flashMatrix, [flashScale, flashScale, flashScale]);
    drawMesh(meshCube, flashMatrix, [1.0, 0.8, 0.2], false, null);
  }

  for (let i = 0; i < pickups.length; i++) {
    let p = pickups[i];
    if (!p.active) continue;

    // 1. Matriz de Identidade
    let model = createIdentity();

    // 2. Translação: Move para a posição X/Z e adiciona o 'bounce' no Y usando o tempo global
    const floatOffset = Math.sin(totalTime * 3.0 + p.id) * 0.15; // Sobe e desce
    model = translate(model, [
      p.position[0],
      p.baseY + floatOffset,
      p.position[2],
    ]);

    // 3. Rotação: Gira em Y continuamente
    model = rotateY(model, totalTime * 1.5 + p.id);

    // 4. Escala: Deixa o cubo menor
    model = scale(model, [0.3, 0.3, 0.3]);

    // Usa a sua função drawMesh já existente, passando a cor definida no spawn
    drawMesh(meshCube, model, p.color, false, null);
  }

  updateHUD(lightPos);
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

// ────────── Função de Reset do Jogo ──────────
function resetGame() {
  // 1. Restaura estado do jogador
  playerState.hp = 100;
  playerState.stamina = 100;
  playerState.iFrames = 0;
  playerState.dead = false;
  score = 0;

  // 2. Reseta posição e rotação da câmera
  cameraState.position = [0, 1.7, 5];
  cameraState.yaw = -Math.PI / 2;
  cameraState.pitch = 0;
  cameraState.velocityY = 0;
  cameraState.isGrounded = true;

  // 3. Reseta munição da arma
  if (weapon) {
    weapon.ammo = weapon.maxAmmo;
    weapon._reloading = false;
    weapon._cooldown = 0;
  }

  // 4. Limpa o overlay de dano do HTML se tiver ficado ativo
  document.getElementById("damageOverlay").classList.remove("flash-red");

  // 5. Restaura o título do menu original caso tenha morrido antes
  document.getElementById("mainMenu").querySelector("h1").innerText =
    "Cave Game Part. II";

  // 6. Spawna um novo grupo de monstros limpos
  monsters = spawnMonsters(6, dungeonArena.bounds, { safeRadius: 3.5 });

  // 7. Reseta os Pickups
  pickups = spawnPickups(5, dungeonArena.bounds);
  doors = createDoors(dungeonArena.bounds, meshCube);
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

  // Mesh do cubo (monstros)
  meshCube = createMesh(gl, program, parseOBJ(CUBE_OBJ));

  // Arena da dungeon (chão/teto/paredes) + texturas proceduais
  dungeonArena = createDungeonArena(gl, program, {
    halfX: 10,
    halfZ: 10,
    height: 4,
    wallTiling: [8, 2],
    floorTiling: [8, 8],
    ceilTiling: [8, 8],
  });
  dungeonTextures = {
    wall: createStoneWallTexture(gl),
    floor: createStoneFloorTexture(gl),
    ceil: createCeilingTexture(gl),
  };

  // Câmera respeita os limites físicos da arena (não atravessa parede)
  setArenaBounds(dungeonArena.bounds);

  // Escopeta
  weapon = new Weapon({
    damage: 1,
    fireRate: 0.55,
    maxAmmo: 8,
    reloadTime: 1.6,
    range: 60,
  });

  // Inicializa os inputs de teclado/mouse
  initCameraControls(canvas);

  // Disparo: clique esquerdo do mouse (apenas quando pointer lock ativo)
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0 && document.pointerLockElement === canvas) {
      tryFire();
    }
  });

  // Recarga manual (tecla R) e pausa (ESC)
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r") weapon.startReload();
    if (e.key === "Escape") {
      paused = true;
      showMenu();
      document.exitPointerLock?.();
    }
    if (e.key.toLowerCase() === "e") {
      const msg = tryInteractDoor(doors, cameraState.position, (cost) => {
        if (coins >= cost) {
          coins -= cost;
          return true;
        }
        return false;
      });
      if (msg) console.log(msg); // Substituir por feedback visual se quiser
    }
  });

  // Personagem externo opcional
  try {
    const charData = await loadOBJ("assets/obj/map/map.obj");
    meshCharacter = createMesh(gl, program, charData);
    console.log(`✅ Personagem carregado: ${charData.vertexCount} vértices`);
  } catch (e) {
    console.warn("⚠️ Personagem opcional não carregado:", e.message);
  }

  // Spawna monstros placeholder
  monsters = spawnMonsters(6, dungeonArena.bounds, { safeRadius: 3.5 });
  doors = createDoors(dungeonArena.bounds, meshCube);
  // NOVO: Spawna 5 itens aleatórios pelo mapa
  pickups = spawnPickups(5, dungeonArena.bounds);

  // Inicializa o menu principal passando o callback de clique no "Jogar"
  initMainMenu(() => {
    // Chame o reset aqui! Toda vez que clicar em jogar, o jogo limpa o estado anterior
    resetGame();

    paused = false;
    requestAnimationFrame((t) => {
      lastTime = t * 0.001;
      gameLoop(t);
    });
  });
}

window.onload = init;
