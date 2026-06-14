// src/engine/renderer/webglSetup.js

export function initWebGL(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error("Erro: Canvas não encontrado!");
        return null;
    }

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const gl = canvas.getContext("webgl2");
    if (!gl) {
        console.error("Erro: WebGL 2 não suportado pelo navegador.");
        return null;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);

    // Z-Buffer
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // Back-face Culling (obrigatório pelo projeto)
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);

    console.log("✅ WebGL 2 inicializado:", gl.getParameter(gl.VERSION));
    return { gl, canvas };
}

export function resizeCanvas(gl, canvas) {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}