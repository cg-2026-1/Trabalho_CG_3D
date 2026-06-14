// src/engine/shaders/phongShader.js

export const vertexShaderSource = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec2 aTexCoord;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vTexCoord;

void main() {
    vec4 worldPosition = uModelMatrix * vec4(aPosition, 1.0);
    vWorldPosition = worldPosition.xyz;

    // Usa a normal matrix para transformar normais corretamente
    vNormal = uNormalMatrix * aNormal;
    vTexCoord = aTexCoord;

    gl_Position = uProjectionMatrix * uViewMatrix * worldPosition;
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vTexCoord;

uniform vec3  uLightPosition;
uniform vec3  uLightColor;
uniform vec3  uViewPosition;
uniform vec3  uObjectColor;
uniform bool  uUseTexture;
uniform sampler2D uTextureSampler;

// Material Phong
uniform float uAmbientStrength;
uniform float uSpecularStrength;
uniform float uShininess;

out vec4 fragColor;

void main() {
    // --- Ambiente ---
    vec3 ambient = uAmbientStrength * uLightColor;

    // --- Difusa ---
    vec3 norm     = normalize(vNormal);
    vec3 lightDir = normalize(uLightPosition - vWorldPosition);
    float diff    = max(dot(norm, lightDir), 0.0);
    vec3 diffuse  = diff * uLightColor;

    // --- Especular (reflexo Phong) ---
    vec3 viewDir    = normalize(uViewPosition - vWorldPosition);
    vec3 reflectDir = reflect(-lightDir, norm);
    float spec      = pow(max(dot(viewDir, reflectDir), 0.0), uShininess);
    vec3 specular   = uSpecularStrength * spec * uLightColor;

    // --- Cor base: sólida ou textura ---
    vec3 baseColor = uUseTexture
        ? texture(uTextureSampler, vTexCoord).rgb
        : uObjectColor;

    vec3 finalColor = (ambient + diffuse + specular) * baseColor;
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

    console.log("✅ Shader Phong compilado e linkado.");
    return program;
}

// Coleta todos os uniform locations do programa Phong
export function getUniformLocations(gl, program) {
    return {
        uModelMatrix:      gl.getUniformLocation(program, 'uModelMatrix'),
        uViewMatrix:       gl.getUniformLocation(program, 'uViewMatrix'),
        uProjectionMatrix: gl.getUniformLocation(program, 'uProjectionMatrix'),
        uNormalMatrix:     gl.getUniformLocation(program, 'uNormalMatrix'),
        uLightPosition:    gl.getUniformLocation(program, 'uLightPosition'),
        uLightColor:       gl.getUniformLocation(program, 'uLightColor'),
        uViewPosition:     gl.getUniformLocation(program, 'uViewPosition'),
        uObjectColor:      gl.getUniformLocation(program, 'uObjectColor'),
        uUseTexture:       gl.getUniformLocation(program, 'uUseTexture'),
        uTextureSampler:   gl.getUniformLocation(program, 'uTextureSampler'),
        uAmbientStrength:  gl.getUniformLocation(program, 'uAmbientStrength'),
        uSpecularStrength: gl.getUniformLocation(program, 'uSpecularStrength'),
        uShininess:        gl.getUniformLocation(program, 'uShininess'),
    };
}
