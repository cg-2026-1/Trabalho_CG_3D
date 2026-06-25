// src/game/scenes/DungeonMap.js
// Gera a arena da dungeon: chão, teto e 4 paredes.
// Cada superfície é uma mesh independente (quad com normal própria),
// para poder usar uma textura e tiling diferentes em cada uma.
//
// Convenção: a arena é um retângulo no plano XZ, de halfX a -halfX
// e halfZ a -halfZ, com altura `height`.

import { createMesh } from '../loader/ModelLoader.js';

/**
 * Cria os dados crus (positions/normals/texCoords) de um quad,
 * no mesmo formato que o parseOBJ() devolve, para reusar createMesh().
 */
function buildQuadData(corners, normal, uvRepeat) {
    // corners: 4 pontos [x,y,z] em ordem CCW (visto de fora, de onde a normal aponta)
    const [a, b, c, d] = corners;
    const [nx, ny, nz] = normal;
    const [ru, rv] = uvRepeat;

    // 2 triângulos: a-b-c, a-c-d (fan triangulation, igual ao parser de OBJ)
    const positions = [
        ...a, ...b, ...c,
        ...a, ...c, ...d,
    ];
    const normals = [
        nx,ny,nz, nx,ny,nz, nx,ny,nz,
        nx,ny,nz, nx,ny,nz, nx,ny,nz,
    ];
    const texCoords = [
        0,0,  ru,0,  ru,rv,
        0,0,  ru,rv, 0,rv,
    ];

    return {
        positions:   new Float32Array(positions),
        normals:     new Float32Array(normals),
        texCoords:   new Float32Array(texCoords),
        vertexCount: positions.length / 3,
    };
}

/**
 * Cria a arena completa.
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLProgram} program - o programa Phong já linkado
 * @param {object} opts
 *   halfX, halfZ : metade da largura/profundidade da arena
 *   height       : altura do teto
 *   wallTiling   : repetições de textura nas paredes [u, v]
 *   floorTiling  : repetições de textura no chão [u, v]
 *   ceilTiling   : repetições de textura no teto [u, v]
 */
export function createDungeonArena(gl, program, opts = {}) {
    const halfX = opts.halfX ?? 9;
    const halfZ = opts.halfZ ?? 9;
    const height = opts.height ?? 4;
    const wallTiling  = opts.wallTiling  ?? [6, 2];
    const floorTiling = opts.floorTiling ?? [6, 6];
    const ceilTiling   = opts.ceilTiling  ?? [6, 6];

    const y0 = 0;
    const y1 = height;

    // ---- Chão (normal +Y) ----
    const floorData = buildQuadData(
        [
            [-halfX, y0,  halfZ],
            [ halfX, y0,  halfZ],
            [ halfX, y0, -halfZ],
            [-halfX, y0, -halfZ],
        ],
        [0, 1, 0],
        floorTiling,
    );

    // ---- Teto (normal -Y, ordem invertida p/ ficar CCW visto de baixo) ----
    const ceilData = buildQuadData(
        [
            [-halfX, y1, -halfZ],
            [ halfX, y1, -halfZ],
            [ halfX, y1,  halfZ],
            [-halfX, y1,  halfZ],
        ],
        [0, -1, 0],
        ceilTiling,
    );

    // ---- Parede Norte (Z = -halfZ, normal +Z apontando p/ dentro da arena) ----
    const wallNorth = buildQuadData(
        [
            [-halfX, y0, -halfZ],
            [ halfX, y0, -halfZ],
            [ halfX, y1, -halfZ],
            [-halfX, y1, -halfZ],
        ],
        [0, 0, 1],
        wallTiling,
    );

    // ---- Parede Sul (Z = +halfZ, normal -Z) ----
    const wallSouth = buildQuadData(
        [
            [ halfX, y0,  halfZ],
            [-halfX, y0,  halfZ],
            [-halfX, y1,  halfZ],
            [ halfX, y1,  halfZ],
        ],
        [0, 0, -1],
        wallTiling,
    );

    // ---- Parede Leste (X = +halfX, normal -X) ----
    const wallEast = buildQuadData(
        [
            [ halfX, y0, -halfZ],
            [ halfX, y0,  halfZ],
            [ halfX, y1,  halfZ],
            [ halfX, y1, -halfZ],
        ],
        [-1, 0, 0],
        wallTiling,
    );

    // ---- Parede Oeste (X = -halfX, normal +X) ----
    const wallWest = buildQuadData(
        [
            [-halfX, y0,  halfZ],
            [-halfX, y0, -halfZ],
            [-halfX, y1, -halfZ],
            [-halfX, y1,  halfZ],
        ],
        [1, 0, 0],
        wallTiling,
    );

    return {
        floor:  createMesh(gl, program, floorData),
        ceil:   createMesh(gl, program, ceilData),
        bounds: { minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ, height },
    };
}

/**
 * Desenha a arena completa. Espera que o caller já tenha chamado gl.useProgram
 * e configurado as uniforms de luz/câmera. Aqui setamos apenas model/cor/textura
 * de cada superfície (o tiling já está embutido nos UVs gerados acima).
 *
 * texSet: { floor, ceil, wall } — texturas WebGL já carregadas (gl.TEXTURE_2D),
 * ou null para usar cor sólida de fallback.
 */
export function drawDungeonArena(gl, uniforms, arena, identityMatrix, texSet) {
    const identityNormal = new Float32Array([1,0,0, 0,1,0, 0,0,1]);

    const drawSurface = (mesh, texture, fallbackColor) => {
        gl.uniformMatrix4fv(uniforms.uModelMatrix, false, identityMatrix);
        gl.uniformMatrix3fv(uniforms.uNormalMatrix, false, identityNormal);
        gl.uniform2fv(uniforms.uTexTiling, [1, 1]); // tiling já embutido nos UVs do quad
        gl.uniform1i(uniforms.uUseTexture, texture ? 1 : 0);

        if (texture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(uniforms.uTextureSampler, 0);
        } else {
            gl.uniform3fv(uniforms.uObjectColor, fallbackColor);
        }

        gl.bindVertexArray(mesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
        gl.bindVertexArray(null);
    };

    drawSurface(arena.floor, texSet.floor, [0.25, 0.22, 0.20]);
    drawSurface(arena.ceil,  texSet.ceil,  [0.12, 0.12, 0.14]);
}
