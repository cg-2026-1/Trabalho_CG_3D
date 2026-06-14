// src/game/loader/ModelLoader.js
// Parser OBJ manual: suporta v, vt, vn, f (tri e quad), grupos e comentários

export function parseOBJ(objText) {
    const positions  = [];   // vec3[]
    const texCoords  = [];   // vec2[]
    const normals    = [];   // vec3[]

    const finalPositions  = [];
    const finalTexCoords  = [];
    const finalNormals    = [];

    const lines = objText.split('\n');

    for (let raw of lines) {
        const line  = raw.trim();
        if (!line || line.startsWith('#')) continue;

        const parts = line.split(/\s+/);
        const type  = parts[0];

        if (type === 'v') {
            positions.push([
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            ]);
        }
        else if (type === 'vt') {
            texCoords.push([
                parseFloat(parts[1]),
                parseFloat(parts[2] ?? '0')
            ]);
        }
        else if (type === 'vn') {
            normals.push([
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            ]);
        }
        else if (type === 'f') {
            // Triangula polígonos (fan triangulation para quads/ngons)
            const verts = parts.slice(1);
            for (let i = 1; i < verts.length - 1; i++) {
                pushVertex(verts[0]);
                pushVertex(verts[i]);
                pushVertex(verts[i + 1]);
            }
        }
        // 'g', 'o', 's', 'usemtl', 'mtllib' são ignorados no parser básico
    }

    function pushVertex(token) {
        const sub  = token.split('/');
        const vIdx = parseInt(sub[0]) - 1;

        // Suporte a índices negativos (referência relativa)
        const resolvedV = vIdx < 0 ? positions.length + vIdx + 1 : vIdx;
        finalPositions.push(...positions[resolvedV]);

        if (sub[1] && sub[1] !== '') {
            const tIdx = parseInt(sub[1]) - 1;
            const rt   = tIdx < 0 ? texCoords.length + tIdx + 1 : tIdx;
            finalTexCoords.push(...texCoords[rt]);
        } else {
            finalTexCoords.push(0, 0);
        }

        if (sub[2] && sub[2] !== '') {
            const nIdx = parseInt(sub[2]) - 1;
            const rn   = nIdx < 0 ? normals.length + nIdx + 1 : nIdx;
            finalNormals.push(...normals[rn]);
        } else {
            finalNormals.push(0, 1, 0); // normal up como fallback
        }
    }

    return {
        positions:   new Float32Array(finalPositions),
        texCoords:   new Float32Array(finalTexCoords),
        normals:     new Float32Array(finalNormals),
        vertexCount: finalPositions.length / 3
    };
}

// ────────────────────────────────────────────────────────────
// Carrega um arquivo .obj via fetch e retorna os dados parseados
// ────────────────────────────────────────────────────────────
export async function loadOBJ(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Falha ao carregar OBJ: ${path} (${response.status})`);
    }
    const text = await response.text();
    console.log(`✅ OBJ carregado: ${path}`);
    return parseOBJ(text);
}

// ────────────────────────────────────────────────────────────
// Cria VAO + VBOs no GPU a partir dos dados parseados
// ────────────────────────────────────────────────────────────
export function createMesh(gl, program, objData) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    function uploadBuffer(data, attribName, size) {
        const loc = gl.getAttribLocation(program, attribName);
        if (loc < 0) return; // atributo não usado no shader, ok ignorar
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }

    uploadBuffer(objData.positions, 'aPosition', 3);
    uploadBuffer(objData.normals,   'aNormal',   3);
    uploadBuffer(objData.texCoords, 'aTexCoord', 2);

    gl.bindVertexArray(null);

    return {
        vao,
        vertexCount: objData.vertexCount
    };
}
