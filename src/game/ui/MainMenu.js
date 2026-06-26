let menu;

function setHUDVisible(visible) {
  const display = visible ? "block" : "none";

  document.getElementById("crosshair").style.display = display;
  document.getElementById("info").style.display = display;
  document.getElementById("lightInfo").style.display = display;
  document.getElementById("doorPrompt").style.display = "none";
  document.getElementById("playerStats").style.display = visible
    ? "flex"
    : "none";

  document.getElementById("hudBottom").style.display = visible
    ? "flex"
    : "none";
}

export function initMainMenu(onPlay) {
  menu = document.getElementById("mainMenu");

  const playBtn = document.getElementById("playBtn");
  const howBtn = document.getElementById("howBtn");
  const configBtn = document.getElementById("configBtn");
  const modal = document.getElementById("howToPlay");
  
  // Novo botão da tela de vitória
  const restartBtn = document.getElementById("restartBtn");

  playBtn.addEventListener("click", () => {
    hideMenu();
    setHUDVisible(true);
    onPlay();
  });

  restartBtn.addEventListener("click", () => {
    hideVictoryMenu();
    setHUDVisible(true);
    onPlay(); // Reaproveita a mesma função de resetar o jogo
  });

  howBtn.addEventListener("click", () => {
    modal.classList.remove("hidden");
  });

  document.getElementById("closeHowBtn").addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  configBtn.addEventListener("click", () => {
    alert("Configurações ainda não implementadas");
  });
}

export function showMenu() {
  menu.style.display = "flex";
  setHUDVisible(false);
}

export function hideMenu() {
  menu.style.display = "none";
  setHUDVisible(true);
}

export function showVictoryMenu() {
  document.getElementById("victoryMenu").classList.remove("hidden");
  document.getElementById("victoryMenu").style.display = "flex";
  setHUDVisible(false);
}

export function hideVictoryMenu() {
  document.getElementById("victoryMenu").style.display = "none";
  document.getElementById("victoryMenu").classList.add("hidden");
}