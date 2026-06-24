// src/engine/math/mat4.js
// Biblioteca de matrizes 4x4 em column-major (compatível com WebGL/GLSL)

export function createIdentity() {
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]);
}

// Multiplica duas matrizes 4x4 (column-major): out = a * b
export function multiply(a, b) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            let sum = 0;
            for (let i = 0; i < 4; i++) {
                sum += a[i * 4 + row] * b[col * 4 + i];
            }
            out[col * 4 + row] = sum;
        }
    }
    return out;
}

// Projeção perspectiva manual
export function perspective(fovy, aspect, near, far) {
    const out = new Float32Array(16);
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1.0 / (near - far);

    out[0]  = f / aspect;
    out[5]  = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = (2 * far * near) * nf;
    out[15] = 0;
    return out;
}

// View matrix lookAt manual
export function lookAt(eye, center, up) {
    const out = new Float32Array(16);

    let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
    let len = Math.sqrt(z0*z0 + z1*z1 + z2*z2) || 1;
    z0 /= len; z1 /= len; z2 /= len;

    let x0 = up[1]*z2 - up[2]*z1;
    let x1 = up[2]*z0 - up[0]*z2;
    let x2 = up[0]*z1 - up[1]*z0;
    len = Math.sqrt(x0*x0 + x1*x1 + x2*x2) || 1;
    x0 /= len; x1 /= len; x2 /= len;

    const y0 = z1*x2 - z2*x1;
    const y1 = z2*x0 - z0*x2;
    const y2 = z0*x1 - z1*x0;

    out[0]  = x0; out[4] = x1; out[8]  = x2; out[12] = -(x0*eye[0] + x1*eye[1] + x2*eye[2]);
    out[1]  = y0; out[5] = y1; out[9]  = y2; out[13] = -(y0*eye[0] + y1*eye[1] + y2*eye[2]);
    out[2]  = z0; out[6] = z1; out[10] = z2; out[14] = -(z0*eye[0] + z1*eye[1] + z2*eye[2]);
    out[3]  = 0;  out[7] = 0;  out[11] = 0;  out[15] = 1;
    return out;
}

// Translação aplicada sobre matriz existente
export function translate(m, v) {
    const out = new Float32Array(m);
    out[12] = m[0]*v[0] + m[4]*v[1] + m[8] *v[2] + m[12];
    out[13] = m[1]*v[0] + m[5]*v[1] + m[9] *v[2] + m[13];
    out[14] = m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14];
    out[15] = m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15];
    return out;
}

// Rotação em Y (para billboard / NPC lookAt no plano XZ)
export function rotateY(m, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const rot = new Float32Array([
         c, 0, s, 0,
         0, 1, 0, 0,
        -s, 0, c, 0,
         0, 0, 0, 1
    ]);
    return multiply(m, rot);
}

// Rotação em X
export function rotateX(m, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const rot = new Float32Array([
        1,  0, 0, 0,
        0,  c, s, 0,
        0, -s, c, 0,
        0,  0, 0, 1
    ]);
    return multiply(m, rot);
}

// Rotação em Z
export function rotateZ(m, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const rot = new Float32Array([
         c, s, 0, 0,
        -s, c, 0, 0,
         0, 0, 1, 0,
         0, 0, 0, 1
    ]);
    return multiply(m, rot);
}

// Escala uniforme ou não-uniforme
export function scale(m, v) {
    const out = new Float32Array(m);
    out[0]  *= v[0]; out[1]  *= v[0]; out[2]  *= v[0]; out[3]  *= v[0];
    out[4]  *= v[1]; out[5]  *= v[1]; out[6]  *= v[1]; out[7]  *= v[1];
    out[8]  *= v[2]; out[9]  *= v[2]; out[10] *= v[2]; out[11] *= v[2];
    return out;
}

// Cria matrix de translação pura
export function fromTranslation(v) {
    const out = createIdentity();
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    return out;
}

// ─────────────────────────────────────────────────────────────
// Extensões (Sprint dungeon/monstros/escopeta)
// ─────────────────────────────────────────────────────────────

// Cria matriz de escala pura (sem precisar de identity + scale)
export function fromScale(v) {
    const out = createIdentity();
    out[0]  = v[0];
    out[5]  = v[1];
    out[10] = v[2];
    return out;
}

/**
 * Ângulo de rotação em Y para um objeto em selfPos "olhar" em direção
 * a targetPos, apenas no plano XZ (usado pelos monstros mirarem o player).
 */
export function yawTowards(selfPos, targetPos) {
    const dx = targetPos[0] - selfPos[0];
    const dz = targetPos[2] - selfPos[2];
    return Math.atan2(dx, dz);
}

// Transforma um ponto [x,y,z] por uma matriz 4x4 (column-major)
export function transformPoint(m, p) {
    const x = p[0], y = p[1], z = p[2];
    return [
        m[0]*x + m[4]*y + m[8]*z  + m[12],
        m[1]*x + m[5]*y + m[9]*z  + m[13],
        m[2]*x + m[6]*y + m[10]*z + m[14],
    ];
}

// Cria matriz de modelo para objetos atrelados à câmera (arma/mão)
// Transforma coordenadas do espaço local da câmera para o espaço do mundo
export function createCameraModelMatrix(eye, pitch, yaw) {
    const out = createIdentity();
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

    // Vetor Forward (Frente da câmera, -Z local)
    const f = [cosY * cosP, sinP, sinY * cosP];
    
    // Vetor Right (Direita da câmera, +X local) - Produto vetorial de Forward com Up global [0,1,0]
    const r = [-sinY, 0, cosY]; // Simplificado matematicamente
    
    // Vetor Up (Cima da câmera, +Y local) - Produto vetorial de Right com Forward
    const u = [
        r[1]*f[2] - r[2]*f[1],
        r[2]*f[0] - r[0]*f[2],
        r[0]*f[1] - r[1]*f[0]
    ];

    // Colunas da matriz (Base ortogonal)
    out[0] = r[0]; out[1] = r[1]; out[2] = r[2]; out[3] = 0;
    out[4] = u[0]; out[5] = u[1]; out[6] = u[2]; out[7] = 0;
    out[8] = -f[0]; out[9] = -f[1]; out[10] = -f[2]; out[11] = 0;
    out[12] = eye[0]; out[13] = eye[1]; out[14] = eye[2]; out[15] = 1;

    return out;
}