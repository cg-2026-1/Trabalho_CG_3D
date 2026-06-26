// src/game/core/MapCollider.js
// Colisão precisa contra a geometria do mapa OBJ.
//
// ESTRATÉGIA:
//   1. Extrai todos os triângulos do OBJ parseado.
//   2. Constrói uma grade espacial (spatial grid) para evitar testar o mapa inteiro a cada frame.
//   3. Para cada query de colisão, testa apenas os triângulos das células vizinhas ao player.
//   4. Usa dois testes:
//      a) Cilindro vertical do player vs. cada triângulo (para paredes/obstáculos verticais)
//      b) Piso: raio descendo de Y do player vs. triângulos horizontais (para chão/rampa)
//
// O player é aproximado por uma cápsula simplificada: cilindro de raio PLAYER_RADIUS
// e altura PLAYER_HEIGHT centrado em playerPos (que é a posição dos olhos).

const PLAYER_RADIUS  = 0.35;   // raio horizontal do cilindro do player
const PLAYER_HEIGHT  = 1.7;    // altura total (dos pés ao topo da cabeça)
const PLAYER_EYE_Y   = 1.7;    // offset Y de playerPos (olhos) acima dos pés
const STEP_HEIGHT    = 0.4;    // altura máxima de degrau que o player pode subir suavemente
const SKIN_WIDTH     = 0.02;   // pequena folga para evitar z-fighting na colisão

const CELL_SIZE      = 2.0;    // tamanho da célula da grade espacial (unidades do mundo)

/**
 * Constrói o collider a partir dos dados parseados pelo ModelLoader.
 * @param {object} objData - { positions: Float32Array, normals, texCoords, vertexCount }
 * @param {Float32Array} [modelMatrix] - matrix 4x4 column-major caso o OBJ não esteja em origin
 *                                        (deixe null para usar a identity — caso do map.obj em (0,0,0))
 */
export class MapCollider {
    constructor(objData, modelMatrix = null) {
        this._triangles = [];
        this._grid      = new Map();

        this._buildTriangles(objData, modelMatrix);
        this._buildGrid();

        console.log(`✅ MapCollider: ${this._triangles.length} triângulos indexados em grade ${CELL_SIZE}u`);
    }

    // ─── Build ────────────────────────────────────────────────────────────────

    _buildTriangles(objData, modelMatrix) {
        const pos = objData.positions;
        const count = objData.vertexCount; // número de vértices (3 por triângulo)

        for (let i = 0; i < count; i += 3) {
            const a = this._getVertex(pos, i + 0, modelMatrix);
            const b = this._getVertex(pos, i + 1, modelMatrix);
            const c = this._getVertex(pos, i + 2, modelMatrix);

            // Normal da face (não normalizada ainda)
            const nx = (b[1]-a[1])*(c[2]-a[2]) - (b[2]-a[2])*(c[1]-a[1]);
            const ny = (b[2]-a[2])*(c[0]-a[0]) - (b[0]-a[0])*(c[2]-a[2]);
            const nz = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
            const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
            if (nLen < 1e-8) continue; // triângulo degenerado, ignora

            // AABB do triângulo para a grade
            const minX = Math.min(a[0], b[0], c[0]);
            const maxX = Math.max(a[0], b[0], c[0]);
            const minY = Math.min(a[1], b[1], c[1]);
            const maxY = Math.max(a[1], b[1], c[1]);
            const minZ = Math.min(a[2], b[2], c[2]);
            const maxZ = Math.max(a[2], b[2], c[2]);

            this._triangles.push({
                a, b, c,
                nx: nx/nLen, ny: ny/nLen, nz: nz/nLen, // normal normalizada
                minX, maxX, minY, maxY, minZ, maxZ,
                // identifica se é majoritariamente horizontal (chão/teto) ou vertical (parede)
                isFloor: Math.abs(ny/nLen) > 0.7,
                isWall:  Math.abs(ny/nLen) < 0.4,
            });
        }
    }

    _getVertex(pos, idx, mat) {
        const x = pos[idx*3 + 0];
        const y = pos[idx*3 + 1];
        const z = pos[idx*3 + 2];
        if (!mat) return [x, y, z];
        // Transforma pelo modelMatrix (column-major)
        return [
            mat[0]*x + mat[4]*y + mat[8]*z  + mat[12],
            mat[1]*x + mat[5]*y + mat[9]*z  + mat[13],
            mat[2]*x + mat[6]*y + mat[10]*z + mat[14],
        ];
    }

    _cellKey(cx, cz) {
        return `${cx},${cz}`;
    }

    _buildGrid() {
        for (let ti = 0; ti < this._triangles.length; ti++) {
            const tri = this._triangles[ti];
            // Células que o AABB do triângulo toca no plano XZ
            const cx0 = Math.floor(tri.minX / CELL_SIZE);
            const cx1 = Math.floor(tri.maxX / CELL_SIZE);
            const cz0 = Math.floor(tri.minZ / CELL_SIZE);
            const cz1 = Math.floor(tri.maxZ / CELL_SIZE);

            for (let cx = cx0; cx <= cx1; cx++) {
                for (let cz = cz0; cz <= cz1; cz++) {
                    const key = this._cellKey(cx, cz);
                    if (!this._grid.has(key)) this._grid.set(key, []);
                    this._grid.get(key).push(ti);
                }
            }
        }
    }

    // ─── Query ────────────────────────────────────────────────────────────────

    /**
     * Retorna os índices de triângulos nas células vizinhas à posição (x, z).
     * Inclui a célula atual e as 8 vizinhas para evitar pop nos bordos.
     */
    _getNearbyTriangles(x, z) {
        const cx = Math.floor(x / CELL_SIZE);
        const cz = Math.floor(z / CELL_SIZE);
        const result = new Set();

        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const key = this._cellKey(cx + dx, cz + dz);
                const cell = this._grid.get(key);
                if (cell) cell.forEach(ti => result.add(ti));
            }
        }
        return result;
    }

    // ─── Colisão Principal ────────────────────────────────────────────────────

    /**
     * Resolve a colisão do player contra o mapa e retorna a posição corrigida.
     *
     * @param {number[]} proposedPos - [x, y, z] posição NOVA proposta (antes de aplicar)
     * @param {number[]} prevPos     - [x, y, z] posição ANTERIOR (garantidamente segura)
     * @returns {{ pos: number[], onGround: boolean, groundY: number }}
     */
    resolve(proposedPos, prevPos) {
        let [px, py, pz] = proposedPos;

        // Y dos pés e topo do cilindro do player
        const feetY  = py - PLAYER_EYE_Y;
        const topY   = feetY + PLAYER_HEIGHT;

        const nearby = this._getNearbyTriangles(px, pz);

        let onGround  = false;
        let groundY   = feetY;   // menor chão colidível encontrado

        // ── 1. Colisão com paredes (triângulos verticais) ──────────────────────
        for (const ti of nearby) {
            const tri = this._triangles[ti];
            if (!tri.isWall) continue;

            // Broad phase: bounding box XZ
            if (px + PLAYER_RADIUS < tri.minX - SKIN_WIDTH) continue;
            if (px - PLAYER_RADIUS > tri.maxX + SKIN_WIDTH) continue;
            if (pz + PLAYER_RADIUS < tri.minZ - SKIN_WIDTH) continue;
            if (pz - PLAYER_RADIUS > tri.maxZ + SKIN_WIDTH) continue;

            // Broad phase: Y do cilindro vs Y do triângulo
            if (feetY > tri.maxY + SKIN_WIDTH) continue;
            if (topY  < tri.minY - SKIN_WIDTH) continue;

            // Narrow phase: push-back pelo plano do triângulo (só componente XZ)
            const pen = this._cylinderVsTriangleWall(px, pz, feetY, topY, tri);
            if (pen) {
                px += pen.nx * pen.depth;
                pz += pen.nz * pen.depth;
            }
        }

        // ── 2. Colisão com chão (triângulos horizontais) ───────────────────────
        let highestFloor = -Infinity;

        for (const ti of nearby) {
            const tri = this._triangles[ti];
            if (!tri.isFloor) continue;
            if (tri.ny < 0) continue; // apenas chão, não teto

            // Broad phase XZ
            if (px < tri.minX - PLAYER_RADIUS) continue;
            if (px > tri.maxX + PLAYER_RADIUS) continue;
            if (pz < tri.minZ - PLAYER_RADIUS) continue;
            if (pz > tri.maxZ + PLAYER_RADIUS) continue;

            // Ponto de interseção: raio vertical descendo da posição XZ do player
            const floorHit = this._rayVsTriangleY(px, pz, feetY + PLAYER_HEIGHT, tri);
            if (floorHit === null) continue;

            // Apenas chão abaixo do player (com tolerância de step height)
            if (floorHit > feetY + STEP_HEIGHT) continue;
            if (floorHit < tri.minY - 0.1) continue;

            if (floorHit > highestFloor) highestFloor = floorHit;
        }

        // Aplica o chão mais alto encontrado
        if (highestFloor > -Infinity) {
            const desiredFeetY = highestFloor;
            if (feetY <= desiredFeetY + STEP_HEIGHT && py - PLAYER_EYE_Y < desiredFeetY + SKIN_WIDTH) {
                py = desiredFeetY + PLAYER_EYE_Y;
                groundY = desiredFeetY;
                onGround = true;
            }
        }

        return { pos: [px, py, pz], onGround, groundY };
    }

    // ─── Helpers de Geometria ─────────────────────────────────────────────────

    /**
     * Empurra o cilindro para fora de um triângulo vertical.
     * Retorna { nx, nz, depth } ou null se não há penetração.
     */
    _cylinderVsTriangleWall(cx, cz, feetY, topY, tri) {
        // Testa os 3 segmentos do triângulo no plano XZ
        const edges = [
            [tri.a, tri.b],
            [tri.b, tri.c],
            [tri.c, tri.a],
        ];

        let minDepth = Infinity;
        let pushX = 0, pushZ = 0;

        for (const [p0, p1] of edges) {
            // Closest point on segment [p0,p1] to center (cx, cz) in XZ plane
            const ex = p1[0] - p0[0];
            const ez = p1[2] - p0[2];
            const len2 = ex*ex + ez*ez;
            if (len2 < 1e-8) continue;

            const t = Math.max(0, Math.min(1, ((cx - p0[0])*ex + (cz - p0[2])*ez) / len2));
            const closestX = p0[0] + t * ex;
            const closestZ = p0[2] + t * ez;

            const dxc = cx - closestX;
            const dzc = cz - closestZ;
            const dist2 = dxc*dxc + dzc*dzc;

            if (dist2 < PLAYER_RADIUS * PLAYER_RADIUS) {
                const dist = Math.sqrt(dist2) || 1e-6;
                const depth = PLAYER_RADIUS - dist;
                if (depth < minDepth) {
                    minDepth = depth;
                    pushX = (dxc / dist);
                    pushZ = (dzc / dist);
                }
            }
        }

        if (minDepth === Infinity) return null;
        return { nx: pushX, nz: pushZ, depth: minDepth + SKIN_WIDTH };
    }

    /**
     * Interseção de um raio vertical descendente (cx, cz) com um triângulo.
     * Retorna a altura Y do ponto de interseção, ou null se fora do triângulo.
     */
    _rayVsTriangleY(cx, cz, startY, tri) {
        const { a, b, c, nx, ny, nz } = tri;

        if (Math.abs(ny) < 1e-6) return null; // triângulo vertical — ignora

        // Plano: dot(normal, P - a) = 0  →  Y = (dot(n, a) - nx*cx - nz*cz) / ny
        const d = nx*a[0] + ny*a[1] + nz*a[2];
        const hitY = (d - nx*cx - nz*cz) / ny;

        // Verifica se o ponto (cx, hitY, cz) está dentro do triângulo
        // usando coordenadas baricêntricas no plano do triângulo (projetado em XZ pois ny≠0)
        if (!this._pointInTriangleXZ(cx, cz, a, b, c)) return null;

        return hitY;
    }

    /**
     * Testa se o ponto (px, pz) está dentro do triângulo (a, b, c) no plano XZ.
     * Método de produto cruzado com sinal.
     */
    _pointInTriangleXZ(px, pz, a, b, c) {
        const d1 = this._cross2D(px, pz, a[0], a[2], b[0], b[2]);
        const d2 = this._cross2D(px, pz, b[0], b[2], c[0], c[2]);
        const d3 = this._cross2D(px, pz, c[0], c[2], a[0], a[2]);

        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

        return !(hasNeg && hasPos);
    }

    _cross2D(px, pz, ax, az, bx, bz) {
        return (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
    }

    /**
     * Verifica se a posição proposta colide com algum elemento do mapa.
     * API simplificada para uso no Camera.js como gate antes de aplicar movimento.
     * Retorna true se o movimento deve ser bloqueado (sem resolução).
     */
    isBlocked(x, z, y) {
        const feetY = y - PLAYER_EYE_Y;
        const topY  = feetY + PLAYER_HEIGHT;
        const nearby = this._getNearbyTriangles(x, z);

        for (const ti of nearby) {
            const tri = this._triangles[ti];
            if (!tri.isWall) continue;
            if (x + PLAYER_RADIUS < tri.minX) continue;
            if (x - PLAYER_RADIUS > tri.maxX) continue;
            if (z + PLAYER_RADIUS < tri.minZ) continue;
            if (z - PLAYER_RADIUS > tri.maxZ) continue;
            if (feetY > tri.maxY) continue;
            if (topY  < tri.minY) continue;

            const pen = this._cylinderVsTriangleWall(x, z, feetY, topY, tri);
            if (pen) return true;
        }
        return false;
    }
}