// src/engine/utils/TextureGenerator.js
// Texturas proceduais simples (canvas 2D off-screen → WebGL texture).
// Servem como placeholder estilo "pedra de dungeon" enquanto os PNGs
// definitivos não chegam. Basta trocar por TextureLoader.load(url) depois.

function uploadCanvasAsTexture(gl, canvas) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
}

function make2DCanvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
}

/** Pedra de parede: blocos irregulares com ruído de tom escuro/avermelhado. */
export function createStoneWallTexture(gl, size = 256) {
    const c = make2DCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2b2622';
    ctx.fillRect(0, 0, size, size);

    const blockW = size / 4, blockH = size / 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;

    for (let row = 0; row < 4; row++) {
        const offset = (row % 2) * (blockW / 2);
        for (let col = -1; col < 5; col++) {
            const x = col * blockW + offset;
            const y = row * blockH;
            const shade = 35 + Math.random() * 25;
            ctx.fillStyle = `rgb(${shade + 10}, ${shade}, ${shade - 6})`;
            ctx.fillRect(x + 2, y + 2, blockW - 4, blockH - 4);
            ctx.strokeRect(x, y, blockW, blockH);
        }
    }

    // ruído fino para dar textura
    for (let i = 0; i < size * size * 0.04; i++) {
        const x = Math.random() * size, y = Math.random() * size;
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
        ctx.fillRect(x, y, 2, 2);
    }

    return uploadCanvasAsTexture(gl, c);
}

/** Chão: pedra cinza mais uniforme, com leve sujeira/manchas. */
export function createStoneFloorTexture(gl, size = 256) {
    const c = make2DCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a362f';
    ctx.fillRect(0, 0, size, size);

    const tile = size / 6;
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            const shade = 45 + Math.random() * 20;
            ctx.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 10})`;
            ctx.fillRect(col * tile + 1, row * tile + 1, tile - 2, tile - 2);
        }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 6; i++) {
        ctx.beginPath(); ctx.moveTo(i * tile, 0); ctx.lineTo(i * tile, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * tile); ctx.lineTo(size, i * tile); ctx.stroke();
    }

    return uploadCanvasAsTexture(gl, c);
}

/** Teto: tom mais escuro e uniforme, com vigas sutis. */
export function createCeilingTexture(gl, size = 256) {
    const c = make2DCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1c1a18';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const beamWidth = size / 8;
    for (let i = 0; i < 4; i++) {
        ctx.fillRect(i * (size / 4) + (size/4 - beamWidth)/2, 0, beamWidth, size);
    }

    for (let i = 0; i < size * size * 0.02; i++) {
        const x = Math.random() * size, y = Math.random() * size;
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
        ctx.fillRect(x, y, 1, 1);
    }

    return uploadCanvasAsTexture(gl, c);
}
