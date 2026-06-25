// src/engine/shaders/phongShader.js

export const vertexShaderSource = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec2 aTexCoord;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;
uniform vec2 uTexTiling; // repetição de textura (ex: 4.0, 4.0 para paredes/chão)

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vTexCoord;

void main() {
    vec4 worldPosition = uModelMatrix * vec4(aPosition, 1.0);
    vWorldPosition = worldPosition.xyz;

    // Usa a normal matrix para transformar normais corretamente
    vNormal = uNormalMatrix * aNormal;
    vTexCoord = aTexCoord * uTexTiling;

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

// Luz secundária (muzzle flash da escopeta)
uniform vec3  uFlashPosition;
uniform vec3  uFlashColor;
uniform float uFlashIntensity; // 0 = apagado

uniform bool uTriplanar;
uniform float uTriplanarScale; // tamanho do tile em unidades do mundo

out vec4 fragColor;

void main() {
    vec3 norm = normalize(vNormal);

    // --- Luz principal (dinâmica, animada) ---
    vec3 lightDir = normalize(uLightPosition - vWorldPosition);
    float diff    = max(dot(norm, lightDir), 0.0);
    vec3 diffuse  = diff * uLightColor;

    vec3 viewDir    = normalize(uViewPosition - vWorldPosition);
    vec3 reflectDir = reflect(-lightDir, norm);
    float spec      = pow(max(dot(viewDir, reflectDir), 0.0), uShininess);
    vec3 specular   = uSpecularStrength * spec * uLightColor;

    // --- Muzzle flash (luz pontual extra, decai com distância) ---
    vec3 flashDir = uFlashPosition - vWorldPosition;
    float flashDist = length(flashDir);
    flashDir = normalize(flashDir);
    float flashDiff = max(dot(norm, flashDir), 0.0);
    float attenuation = 1.0 / (1.0 + 0.15 * flashDist + 0.05 * flashDist * flashDist);
    vec3 flashLight = flashDiff * uFlashColor * uFlashIntensity * attenuation;

    // --- Ambiente ---
    vec3 ambient = uAmbientStrength * uLightColor;

    // --- Cor base: sólida ou textura ---
    vec3 baseColor;
        if (uUseTexture) {
            if (uTriplanar) {
                // Triplanar: blends 3 projeções pesadas pela normal absoluta
                vec3 blendWeights = abs(norm);
                blendWeights = max(blendWeights - 0.2, 0.0);
                blendWeights /= (blendWeights.x + blendWeights.y + blendWeights.z);

                vec3 col_x = texture(uTextureSampler, vWorldPosition.yz * uTriplanarScale).rgb;
                vec3 col_y = texture(uTextureSampler, vWorldPosition.xz * uTriplanarScale).rgb;
                vec3 col_z = texture(uTextureSampler, vWorldPosition.xy * uTriplanarScale).rgb;

                baseColor = col_x * blendWeights.x + col_y * blendWeights.y + col_z * blendWeights.z;
            } else {
                baseColor = texture(uTextureSampler, vTexCoord).rgb;
            }
        } else {
            baseColor = uObjectColor;
        }

    vec3 finalColor = (ambient + diffuse + specular + flashLight) * baseColor;
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
        uTexTiling:        gl.getUniformLocation(program, 'uTexTiling'),
        uFlashPosition:    gl.getUniformLocation(program, 'uFlashPosition'),
        uFlashColor:       gl.getUniformLocation(program, 'uFlashColor'),
        uFlashIntensity:   gl.getUniformLocation(program, 'uFlashIntensity'),
        uTriplanar:      gl.getUniformLocation(program, 'uTriplanar'),
        uTriplanarScale: gl.getUniformLocation(program, 'uTriplanarScale'),
    };
}
