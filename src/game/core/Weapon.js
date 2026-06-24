// src/game/core/Weapon.js
// Escopeta hit-scan: dispara um raio instantâneo (sem projétil visível)
// a partir da posição/direção da câmera e testa interseção contra
// a esfera de colisão de cada monstro vivo (ray-sphere intersection manual).

export class Weapon {
    constructor({ damage = 1, fireRate = 0.6, maxAmmo = 8, reloadTime = 1.5, range = 50 } = {}) {
        this.damage     = damage;
        this.fireRate   = fireRate;   // segundos de cooldown entre tiros
        this.maxAmmo    = maxAmmo;
        this.ammo       = maxAmmo;
        this.reloadTime = reloadTime;
        this.range      = range;

        this._cooldown   = 0;
        this._reloading  = false;
        this._reloadTimer = 0;

        // Estado do muzzle flash (consumido pela main.js para a luz extra do shader)
        this.flashTimer = 0;
        this.flashDuration = 0.08;
    }

    canFire() {
        return this._cooldown <= 0 && !this._reloading && this.ammo > 0;
    }

    update(dt) {
        if (this._cooldown > 0) this._cooldown -= dt;
        if (this.flashTimer > 0) this.flashTimer -= dt;

        if (this._reloading) {
            this._reloadTimer -= dt;
            if (this._reloadTimer <= 0) {
                this._reloading = false;
                this.ammo = this.maxAmmo;
            }
        }
    }

    startReload() {
        if (this._reloading || this.ammo === this.maxAmmo) return;
        this._reloading = true;
        this._reloadTimer = this.reloadTime;
    }

    /**
     * Dispara um raio hit-scan a partir de origin na direção direction (ambos
     * arrays [x,y,z], direction já deve estar normalizada) contra a lista de
     * monstros vivos. Retorna o monstro mais próximo atingido, ou null.
     */
    fire(origin, direction, monsters) {
        if (!this.canFire()) return { hit: null, fired: false };

        this._cooldown = this.fireRate;
        this.ammo -= 1;
        this.flashTimer = this.flashDuration;

        let closest = null;
        let closestDist = Infinity;

        for (const monster of monsters) {
            if (!monster.alive) continue;
            // monster.position já representa o centro do cubo (a model matrix
            // faz translate→rotateY→scale a partir da origem do OBJ, que é centrado)
            const dist = raySphereIntersect(origin, direction, monster.position, monster.hitRadius, this.range);
            if (dist !== null && dist < closestDist) {
                closestDist = dist;
                closest = monster;
            }
        }

        if (closest) {
            const killed = closest.takeDamage(this.damage);
            return { hit: closest, fired: true, killed, distance: closestDist };
        }
        return { hit: null, fired: true, killed: false };
    }

    /** Posição da luz do muzzle flash, ligeiramente na frente da câmera. */
    getFlashIntensity() {
        if (this.flashTimer <= 0) return 0;
        return (this.flashTimer / this.flashDuration) * 2.5;
    }
}

/**
 * Interseção raio-esfera manual (álgebra de segundo grau).
 * origin, dir: arrays [x,y,z] (dir deve estar normalizada)
 * center: array [x,y,z] do centro da esfera de colisão (centro de massa do monstro,
 *         não a base — ver chamada em Weapon.fire que soma metade da altura do cubo)
 * radius: raio da esfera
 * maxDist: distância máxima do raio (alcance da arma)
 * Retorna a distância até o ponto de interseção mais próximo, ou null se não houver.
 */
function raySphereIntersect(origin, dir, center, radius, maxDist) {
    const ocx = origin[0] - center[0];
    const ocy = origin[1] - center[1];
    const ocz = origin[2] - center[2];

    const a = dir[0]*dir[0] + dir[1]*dir[1] + dir[2]*dir[2]; // ~1 se normalizado
    const b = 2 * (ocx*dir[0] + ocy*dir[1] + ocz*dir[2]);
    const c = (ocx*ocx + ocy*ocy + ocz*ocz) - radius*radius;

    const discriminant = b*b - 4*a*c;
    if (discriminant < 0) return null; // sem interseção

    const sqrtDisc = Math.sqrt(discriminant);
    const t0 = (-b - sqrtDisc) / (2*a);
    const t1 = (-b + sqrtDisc) / (2*a);

    // Queremos a menor distância positiva (na frente do jogador)
    const t = t0 >= 0 ? t0 : (t1 >= 0 ? t1 : null);
    if (t === null || t > maxDist) return null;
    return t;
}
