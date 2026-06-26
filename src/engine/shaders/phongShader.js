// src/engine/shaders/phongShader.js

// Número máximo de luzes pontuais simultâneas (salas + câmera).
// Altere MAX_LIGHTS tanto aqui quanto no GLSL juntos.
export const MAX_LIGHTS = 8;

export const vertexShaderSource = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec2 aTexCoord;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;
uniform vec2 uTexTiling;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vTexCoord;

void main() {
    vec4 worldPosition = uModelMatrix * vec4(aPosition, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = uNormalMatrix * aNormal;
    vTexCoord = aTexCoord * uTexTiling;
    gl_Position = uProjectionMatrix * uViewMatrix * worldPosition;
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;

// ── Constante deve bater com MAX_LIGHTS em JS ──
#define MAX_LIGHTS 8

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vTexCoord;

// ── Câmera ──────────────────────────────────────────────────
uniform vec3 uViewPosition;

// ── Material Phong ──────────────────────────────────────────
uniform vec3  uObjectColor;
uniform bool  uUseTexture;
uniform sampler2D uTextureSampler;
uniform float uAmbientStrength;
uniform float uSpecularStrength;
uniform float uShininess;

// ── Textura triplanar ───────────────────────────────────────
uniform bool  uTriplanar;
uniform float uTriplanarScale;

// ── Luzes pontuais (salas + câmera) ────────────────────────
// Cada luz tem: posição, cor e raio de influência (range).
// A intensidade decai com distância via atenuação quadrática.
uniform int   uLightCount;                        // quantas luzes ativas (≤ MAX_LIGHTS)
uniform vec3  uLightPositions[MAX_LIGHTS];        // posições no espaço do mundo
uniform vec3  uLightColors[MAX_LIGHTS];           // cor/intensidade de cada luz
uniform float uLightRanges[MAX_LIGHTS];           // raio de atenuação (0 = sem limite)

// ── Muzzle flash (luz extra pontual do tiro) ────────────────
uniform vec3  uFlashPosition;
uniform vec3  uFlashColor;
uniform float uFlashIntensity;

out vec4 fragColor;

// ── Atenuação quadrática suave ──────────────────────────────
float attenuate(float dist, float range) {
    if (range <= 0.0) return 1.0 / (1.0 + 0.09 * dist + 0.032 * dist * dist);
    // Smoothstep para queda suave no limite do range
    float ratio = dist / range;
    if (ratio >= 1.0) return 0.0;
    float att = 1.0 / (1.0 + 0.14 * dist + 0.07 * dist * dist);
    return att * (1.0 - smoothstep(0.8, 1.0, ratio));
}

void main() {
    vec3 norm    = normalize(vNormal);
    vec3 viewDir = normalize(uViewPosition - vWorldPosition);

    // ── Cor base: sólida, textura UV ou triplanar ───────────
    vec3 baseColor;
    if (uUseTexture) {
        if (uTriplanar) {
            vec3 bw = abs(norm);
            bw = max(bw - 0.2, 0.0);
            bw /= (bw.x + bw.y + bw.z + 1e-6);
            vec3 cx = texture(uTextureSampler, vWorldPosition.yz * uTriplanarScale).rgb;
            vec3 cy = texture(uTextureSampler, vWorldPosition.xz * uTriplanarScale).rgb;
            vec3 cz = texture(uTextureSampler, vWorldPosition.xy * uTriplanarScale).rgb;
            baseColor = cx * bw.x + cy * bw.y + cz * bw.z;
        } else {
            baseColor = texture(uTextureSampler, vTexCoord).rgb;
        }
    } else {
        baseColor = uObjectColor;
    }

    // ── Componente ambiente (global) ────────────────────────
    // Usa a cor da primeira luz como tom ambiente para consistência visual.
    vec3 ambientColor = (uLightCount > 0) ? uLightColors[0] : vec3(1.0);
    vec3 ambient = uAmbientStrength * ambientColor;

    // ── Acumula contribuições de todas as luzes pontuais ───
    vec3 diffuseTotal  = vec3(0.0);
    vec3 specularTotal = vec3(0.0);

    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= uLightCount) break;

        vec3  lDir   = uLightPositions[i] - vWorldPosition;
        float lDist  = length(lDir);
        lDir = normalize(lDir);

        float att    = attenuate(lDist, uLightRanges[i]);
        float diff   = max(dot(norm, lDir), 0.0);

        vec3 reflDir = reflect(-lDir, norm);
        float spec   = pow(max(dot(viewDir, reflDir), 0.0), uShininess);

        diffuseTotal  += diff * uLightColors[i] * att;
        specularTotal += uSpecularStrength * spec * uLightColors[i] * att;
    }

    // ── Muzzle flash extra ──────────────────────────────────
    if (uFlashIntensity > 0.0) {
        vec3  fDir   = uFlashPosition - vWorldPosition;
        float fDist  = length(fDir);
        fDir = normalize(fDir);
        float fAtt   = attenuate(fDist, 8.0);
        float fDiff  = max(dot(norm, fDir), 0.0);
        diffuseTotal += fDiff * uFlashColor * uFlashIntensity * fAtt;
    }

    vec3 finalColor = (ambient + diffuseTotal + specularTotal) * baseColor;
    fragColor = vec4(finalColor, 1.0);
}
`;

// ────────────────────────────────────────────────────────────
// Utilitários de compilação de shader
// ────────────────────────────────────────────────────────────

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const typeName = type === gl.VERTEX_SHADER ? "Vertex" : "Fragment";
        console.error(`❌ Erro no ${typeName} Shader:\n`, gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

export function createShaderProgram(gl, vsSource, fsSource) {
    const vs = compileShader(gl, gl.VERTEX_SHADER,   vsSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("❌ Erro ao linkar programa:", gl.getProgramInfoLog(program));
        return null;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    console.log("✅ Shader Phong multi-luz compilado e linkado.");
    return program;
}

/**
 * Coleta todos os uniform locations do programa Phong.
 * Inclui os arrays de luzes pontuais (MAX_LIGHTS slots cada).
 */
export function getUniformLocations(gl, program) {
    const locs = {
        uModelMatrix:      gl.getUniformLocation(program, 'uModelMatrix'),
        uViewMatrix:       gl.getUniformLocation(program, 'uViewMatrix'),
        uProjectionMatrix: gl.getUniformLocation(program, 'uProjectionMatrix'),
        uNormalMatrix:     gl.getUniformLocation(program, 'uNormalMatrix'),
        uViewPosition:     gl.getUniformLocation(program, 'uViewPosition'),
        uObjectColor:      gl.getUniformLocation(program, 'uObjectColor'),
        uUseTexture:       gl.getUniformLocation(program, 'uUseTexture'),
        uTextureSampler:   gl.getUniformLocation(program, 'uTextureSampler'),
        uAmbientStrength:  gl.getUniformLocation(program, 'uAmbientStrength'),
        uSpecularStrength: gl.getUniformLocation(program, 'uSpecularStrength'),
        uShininess:        gl.getUniformLocation(program, 'uShininess'),
        uTexTiling:        gl.getUniformLocation(program, 'uTexTiling'),
        uTriplanar:        gl.getUniformLocation(program, 'uTriplanar'),
        uTriplanarScale:   gl.getUniformLocation(program, 'uTriplanarScale'),
        // Muzzle flash
        uFlashPosition:    gl.getUniformLocation(program, 'uFlashPosition'),
        uFlashColor:       gl.getUniformLocation(program, 'uFlashColor'),
        uFlashIntensity:   gl.getUniformLocation(program, 'uFlashIntensity'),
        // Multi-luz
        uLightCount:       gl.getUniformLocation(program, 'uLightCount'),
        // Arrays de luz (posição, cor, range por índice)
        uLightPositions: [],
        uLightColors:    [],
        uLightRanges:    [],
    };

    for (let i = 0; i < MAX_LIGHTS; i++) {
        locs.uLightPositions.push(gl.getUniformLocation(program, `uLightPositions[${i}]`));
        locs.uLightColors.push(   gl.getUniformLocation(program, `uLightColors[${i}]`));
        locs.uLightRanges.push(   gl.getUniformLocation(program, `uLightRanges[${i}]`));
    }

    return locs;
}

/**
 * Envia o array de luzes para o shader.
 * @param {WebGL2RenderingContext} gl
 * @param {object} uniforms - retorno de getUniformLocations()
 * @param {Array<{position:[x,y,z], color:[r,g,b], range:number}>} lights
 */
export function uploadLights(gl, uniforms, lights) {
    const count = Math.min(lights.length, MAX_LIGHTS);
    gl.uniform1i(uniforms.uLightCount, count);

    for (let i = 0; i < count; i++) {
        const L = lights[i];
        gl.uniform3fv(uniforms.uLightPositions[i], L.position);
        gl.uniform3fv(uniforms.uLightColors[i],    L.color);
        gl.uniform1f(uniforms.uLightRanges[i],     L.range ?? 0);
    }
    // Zera slots não usados para evitar lixo na GPU
    for (let i = count; i < MAX_LIGHTS; i++) {
        gl.uniform3fv(uniforms.uLightPositions[i], [0, 0, 0]);
        gl.uniform3fv(uniforms.uLightColors[i],    [0, 0, 0]);
        gl.uniform1f(uniforms.uLightRanges[i],     0);
    }
}