// src/game/audio/AudioManager.js

export const sounds = {
    shotgun: new Audio('assets/audio/shotgun.mp3'),
    reload:  new Audio('assets/audio/reload_sound.mp3'),
    walk:    new Audio('assets/audio/walking-sound.mp3'),
    run:     new Audio('assets/audio/running.mp3'),
    jump:    new Audio('assets/audio/jump-landing.mp3'),
    door:    new Audio('assets/audio/door-openning.mp3'),
    coin:    new Audio('assets/audio/coin.mp3'),
    life:    new Audio('assets/audio/one_beep_life.mp3'),
    damage:  new Audio('assets/audio/damage.mp3'),
    soundtrack: new Audio('assets/audio/soundtrack.mp3')
};

// Configura os sons de movimento para repetirem (loop) enquanto a tecla estiver pressionada
sounds.walk.loop = true;
sounds.run.loop = true;

// Abaixa um pouco o volume dos passos para não ensurdecer o jogador
sounds.walk.volume = 0.5;
sounds.run.volume = 0.7;

// Configurações da Música
sounds.soundtrack.loop = true;
sounds.soundtrack.volume = 0.3;

export function playSound(name) {
    const audio = sounds[name];
    if (!audio) return;
    audio.currentTime = 0; 
    audio.play().catch(() => {}); 
}

export function startSoundtrack() {
    sounds.soundtrack.play().catch(() => {});
}

export function stopSoundtrack() {
    sounds.soundtrack.pause();
    sounds.soundtrack.currentTime = 0;
}

export function updateMovementSound(isMoving, isSprinting, isGrounded) {
    // Se o player parou de andar ou está no ar, pausa os sons de passos
    if (!isMoving || !isGrounded) {
        sounds.walk.pause();
        sounds.run.pause();
        return;
    }

    if (isSprinting) {
        sounds.walk.pause(); // Para a caminhada
        if (sounds.run.paused) sounds.run.play().catch(()=>{}); // Inicia a corrida
    } else {
        sounds.run.pause(); // Para a corrida
        if (sounds.walk.paused) sounds.walk.play().catch(()=>{}); // Inicia a caminhada
    }
}