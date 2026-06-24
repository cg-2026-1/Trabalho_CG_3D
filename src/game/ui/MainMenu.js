let menu;

export function initMainMenu(onPlay) {

    menu = document.getElementById('mainMenu');

    const playBtn = document.getElementById('playBtn');
    const howBtn = document.getElementById('howBtn');
    const configBtn = document.getElementById('configBtn');
    const modal = document.getElementById('howToPlay');

    playBtn.addEventListener('click', () => {

        hideMenu();

        document.getElementById('crosshair').style.display = 'block';
        document.getElementById('info').style.display = 'block';
        document.getElementById('lightInfo').style.display = 'block';
        document.getElementById('hudBottom').style.display = 'flex';

        onPlay();
    });

    howBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });

    document.getElementById('closeHowBtn')
        .addEventListener('click', () => {
            modal.classList.add('hidden');
        });

    configBtn.addEventListener('click', () => {
        alert('Configurações ainda não implementadas');
    });
}

export function showMenu() {
    menu.style.display = 'flex';
}

export function hideMenu() {
    menu.style.display = 'none';
}