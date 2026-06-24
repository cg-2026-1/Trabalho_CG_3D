// src/game/core/Monster.js
// Monstro placeholder (cubo). No futuro será substituído por sprite billboard
// estilo DOOM, mas a lógica de mira (yaw em direção ao player) já fica pronta
// para reaproveitar quando trocar para billboard.

import { fromTranslation, rotateY, scale, yawTowards } from '../../engine/math/mat4.js';

let nextId = 1;

export class Monster {
    constructor({ position, color = [0.7, 0.1, 0.1], scaleSize = 0.8, health = 100, speed = 1.0 }) {
        this.id        = nextId++;
        this.position  = [...position];
        this.color     = color;
        this.scaleSize = scaleSize;
        this.health    = health;
        this.speed     = speed;
        this.alive     = true;

        // raio de colisão (usado pelo hit-scan da escopeta)
        this.hitRadius = scaleSize * 0.9;
    }

    /**
     * Persegue lentamente o player no plano XZ e sempre vira de frente
     * para ele (eixo Z do monstro aponta para o player).
     */
    update(deltaTime, playerPosition) {
        if (!this.alive) return;

        const dx = playerPosition[0] - this.position[0];
        const dz = playerPosition[2] - this.position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Para de perseguir se já estiver bem próximo (evita "abraçar" o player)
        const stopDistance = 0.6;
        if (dist > stopDistance) {
            const step = this.speed * deltaTime;
            this.position[0] += (dx / dist) * step;
            this.position[2] += (dz / dist) * step;
        }
    }

    /** Aplica dano; retorna true se o monstro morreu com este hit. */
    takeDamage(amount) {
        if (!this.alive) return false;
        this.health -= amount;
        if (this.health <= 0) {
            this.alive = false;
            return true;
        }
        return false;
    }

    /**
     * Monta a model matrix do monstro: translação + yaw em direção ao player + escala.
     * (Requisito: NPCs miram o eixo Z deles em direção ao player via lookAt manual)
     */
    getModelMatrix(playerPosition) {
        const angle = yawTowards(this.position, playerPosition);
        let m = fromTranslation(this.position);
        m = rotateY(m, angle);
        m = scale(m, [this.scaleSize, this.scaleSize, this.scaleSize]);
        return m;
    }
}

/**
 * Spawna um conjunto de monstros distribuídos na arena, evitando o centro
 * (onde o player nasce) para não começar a partida já encurralado.
 */
export function spawnMonsters(count, bounds, opts = {}) {
    const monsters = [];
    const margin = 1.5;
    const safeRadius = opts.safeRadius ?? 3.0; // distância mínima do spawn do player

    for (let i = 0; i < count; i++) {
        let x, z;
        let attempts = 0;
        do {
            x = bounds.minX + margin + Math.random() * (bounds.maxX - bounds.minX - 2 * margin);
            z = bounds.minZ + margin + Math.random() * (bounds.maxZ - bounds.minZ - 2 * margin);
            attempts++;
        } while (Math.sqrt(x * x + z * z) < safeRadius && attempts < 20);

        monsters.push(new Monster({
            position: [x, 0.8, z],
            color: [0.65 + Math.random() * 0.2, 0.08, 0.08],
            scaleSize: 0.75 + Math.random() * 0.3,
            health: 1,
            speed: 0.5 + Math.random() * 0.4,
        }));
    }
    return monsters;
}
