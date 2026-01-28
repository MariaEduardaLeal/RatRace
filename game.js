import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- CONFIGURAÇÕES GLOBAIS ---
const TOTAL_GAME_TIME = 120; 
let timeLeft = TOTAL_GAME_TIME;
let gameActive = false;
let clock = new THREE.Clock();

// Variáveis de Cena
let scene, camera, renderer;
let playerGroup, playerMesh; 
let plane;
let obstacles = [];
let cheeses = [];
let finishLine = null;
let mixer; 

// Modelos 3D Carregados
let cheeseModelOriginal = null;
let ctpsModelOriginal = null; 

// Variáveis de Gameplay
let currentLane = 0; 
const laneWidth = 2.5;
let speed = 0.25;
let score = 0;
let frameCount = 0;
let isFinishLineSpawned = false;

// Física do Pulo
let verticalVelocity = 0;
const gravity = 0.015;
const jumpStrength = 0.35;
let isJumping = false;

// Elementos DOM
const scoreEl = document.getElementById('score-board');
const timerEl = document.getElementById('timer-board');
const screenEl = document.getElementById('game-over-screen');
const titleEl = document.getElementById('end-title');
const reasonEl = document.getElementById('end-reason');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 10, 60);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 4, 7);
    camera.lookAt(0, 0, -5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    createFloor();
    loadPlayerModel();
    loadCheeseModel();
    loadCtpsModel(); 

    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown, false);
    restartBtn.addEventListener('click', resetGame);

    animate();
}

function createFloor() {
    const planeGeometry = new THREE.PlaneGeometry(40, 1000);
    const planeMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.z = -450;
    plane.receiveShadow = true;
    scene.add(plane);
}

// --- CARREGAMENTO DOS MODELOS ---

function loadPlayerModel() {
    playerGroup = new THREE.Group();
    scene.add(playerGroup);

    const textureLoader = new THREE.TextureLoader();
    const ratTexture = textureLoader.load('textures/CH_Rat_diffuse.png');
    ratTexture.flipY = false; 

    const loader = new GLTFLoader();
    loader.load('./rat.gltf', function (gltf) {
        playerMesh = gltf.scene;
        playerMesh.scale.set(1.5, 1.5, 1.5); 
        playerMesh.rotation.y = 0; 
        playerMesh.position.y = 0; 

        playerMesh.traverse(function (node) {
            if (node.isMesh) {
                node.castShadow = true;
                if (node.material) {
                    node.material.map = ratTexture;
                    node.material.needsUpdate = true;
                }
            }
        });

        playerGroup.add(playerMesh);

        mixer = new THREE.AnimationMixer(playerMesh);
        const clips = gltf.animations;
        const runClip = THREE.AnimationClip.findByName(clips, 'RatAll_Scamper');

        if (runClip) mixer.clipAction(runClip).play();
        else if (clips.length > 0) mixer.clipAction(clips[0]).play();

        resetGame();
    }, undefined, function (error) { console.error('Erro Rato:', error); });
}

function loadCheeseModel() {
    const loader = new GLTFLoader();
    loader.load('cheese/cheese.gltf', function (gltf) {
        cheeseModelOriginal = gltf.scene;
        cheeseModelOriginal.scale.set(1.5, 1.5, 1.5); 
        cheeseModelOriginal.traverse(function (node) {
            if (node.isMesh) {
                node.castShadow = true;
                if(node.material) node.material.emissive = new THREE.Color(0x222200);
            }
        });
    }, undefined, function (error) { console.error('Erro Queijo:', error); });
}

function loadCtpsModel() {
    const loader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();
    
    // Carrega a textura da CAPA
    const ctpsTexture = textureLoader.load('carteira_trabalho/textures/ctps_capa.png');
    ctpsTexture.colorSpace = THREE.SRGBColorSpace; 
    
    // --- CORREÇÃO DE TEXTURA ---
    // Giramos a textura 90 graus (-Math.PI/2) para ficar em pé na capa
    ctpsTexture.center.set(0.5, 0.5); 
    ctpsTexture.rotation = -Math.PI / 2; 
    ctpsTexture.flipY = false;

    loader.load('carteira_trabalho/scene.gltf', function (gltf) {
        ctpsModelOriginal = gltf.scene;
        
        // Escala Gigante
        ctpsModelOriginal.scale.set(25.0, 25.0, 25.0); 
        
        ctpsModelOriginal.traverse(function (node) {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                if(node.material) {
                    // Aplica a textura girada diretamente no modelo
                    node.material.map = ctpsTexture; 
                    node.material.needsUpdate = true;
                    // Tira o brilho pra parecer papel
                    node.material.roughness = 0.9; 
                    node.material.metalness = 0.0;
                }
            }
        });

        console.log("Carteira carregada em pé com textura corrigida!");
    }, undefined, function (error) { console.error('Erro CTPS:', error); });
}

// --- SPAWNERS ---

function spawnObstacle(lane) {
    let obstacle;

    if (ctpsModelOriginal) {
        obstacle = ctpsModelOriginal.clone();
        
        // --- CORREÇÃO FINAL DE ROTAÇÃO ---
        // Aqui voltamos para a rotação que deixou o livro EM PÉ (VERTICAL)
        obstacle.rotation.set(0, 0, 0); 
        obstacle.rotation.x = 0;         // Mantém em pé
        obstacle.rotation.y = Math.PI;   // Vira a capa para a câmera
        obstacle.rotation.z = 0; 

        // Posição no chão
        obstacle.position.set(lane * laneWidth, 1.5, -80);
        
    } else {
        obstacle = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshPhongMaterial({ color: 0x000088 }));
        obstacle.position.set(lane * laneWidth, 0.75, -80);
    }

    obstacle.castShadow = true;
    scene.add(obstacle);
    obstacles.push(obstacle);
}

function spawnCheese(lane) {
    let cheese;
    if (cheeseModelOriginal) {
        cheese = cheeseModelOriginal.clone();
        cheese.position.set(lane * laneWidth, 0.5, -80);
    } else {
        cheese = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshPhongMaterial({ color: 0xFFD700 }));
        cheese.position.set(lane * laneWidth, 0.5, -80);
    }
    scene.add(cheese);
    cheeses.push(cheese);
}

function spawnFinishLine() {
    isFinishLineSpawned = true;
    finishLine = new THREE.Group();
    const pillarMat = new THREE.MeshPhongMaterial({ color: 0xFFFFFF });
    const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), pillarMat); leftPillar.position.set(-4, 2, 0);
    const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), pillarMat); rightPillar.position.set(4, 2, 0);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(9, 1, 0.2), new THREE.MeshPhongMaterial({ color: 0x00FF00 })); banner.position.set(0, 3.5, 0);
    finishLine.add(leftPillar); finishLine.add(rightPillar); finishLine.add(banner);
    finishLine.position.set(0, 0, -100); scene.add(finishLine);
}

// --- LÓGICA ---

function onKeyDown(event) {
    if (!gameActive) return;
    if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') if (currentLane > -1) currentLane--;
    if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') if (currentLane < 1) currentLane++;
    if ((event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') && !isJumping) {
        verticalVelocity = jumpStrength;
        isJumping = true;
    }
}

function update() {
    const delta = clock.getDelta(); 
    if (mixer) mixer.update(delta);

    if (!gameActive) return;
    
    if (timeLeft > 0) {
        timeLeft -= delta;
        let minutes = Math.floor(timeLeft / 60);
        let seconds = Math.floor(timeLeft % 60);
        timerEl.innerText = `⏱️ Tempo: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    } else {
        timeLeft = 0; timerEl.innerText = "⏱️ Tempo: 0:00";
    }

    if(playerGroup) playerGroup.position.x += (currentLane * laneWidth - playerGroup.position.x) * 0.1;

    if (playerGroup) {
        playerGroup.position.y += verticalVelocity;
        verticalVelocity -= gravity;
        if (playerGroup.position.y <= 0) {
            playerGroup.position.y = 0;
            isJumping = false;
            verticalVelocity = 0;
        }
    }

    if (timeLeft > 0 && !isFinishLineSpawned) {
        frameCount++;
        if (frameCount % 50 === 0) {
            const lane = Math.floor(Math.random() * 3) - 1;
            if (Math.random() > 0.4) spawnObstacle(lane); else spawnCheese(lane);
        }
        if (frameCount % 600 === 0) speed += 0.02;
    } else if (timeLeft <= 0 && !isFinishLineSpawned) spawnFinishLine();

    moveObjects();
}

function moveObjects() {
    const playerX = playerGroup ? playerGroup.position.x : 0;
    const playerY = playerGroup ? playerGroup.position.y : 0;

    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obj = obstacles[i]; obj.position.z += speed;
        if (obj.position.z > -1 && obj.position.z < 1) {
            if (Math.abs(obj.position.x - playerX) < 0.8 && playerY < 2.5) {
                endGame(false);
            }
        }
        if (obj.position.z > 10) { scene.remove(obj); obstacles.splice(i, 1); }
    }

    for (let i = cheeses.length - 1; i >= 0; i--) {
        let obj = cheeses[i]; obj.position.z += speed; obj.rotation.y += 0.05;
        if (obj.position.z > -1 && obj.position.z < 1) {
            if (Math.abs(obj.position.x - playerX) < 0.8 && Math.abs(obj.position.y - playerY) < 1.5) { 
                scene.remove(obj); cheeses.splice(i, 1); score++; scoreEl.innerText = "🧀 Queijos: " + score; 
            }
        }
        if (obj.position.z > 10) { scene.remove(obj); cheeses.splice(i, 1); }
    }

    if (finishLine) { finishLine.position.z += speed; if (finishLine.position.z > 0) endGame(true); }
}

function endGame(win) {
    gameActive = false; screenEl.style.display = 'block'; finalScoreEl.innerText = "Pontuação Final: " + score;
    if (win) { titleEl.innerText = "PARABÉNS! 🎉"; titleEl.style.color = "#00FF00"; reasonEl.innerText = "Você conquistou a aposentadoria!"; }
    else { titleEl.innerText = "CLT NA VEIA! 💥"; titleEl.style.color = "#FF0000"; reasonEl.innerText = "O rato pegou a carteira de trabalho."; }
}

function resetGame() {
    obstacles.forEach(o => scene.remove(o)); cheeses.forEach(c => scene.remove(c));
    if (finishLine) { scene.remove(finishLine); finishLine = null; }
    obstacles = []; cheeses = []; score = 0; timeLeft = TOTAL_GAME_TIME; speed = 0.25; currentLane = 0; frameCount = 0; isFinishLineSpawned = false;
    scoreEl.innerText = "🧀 Queijos: 0"; screenEl.style.display = 'none';
    if (playerGroup) { playerGroup.position.x = 0; playerGroup.position.y = 0; }
    gameActive = true; verticalVelocity = 0;
}

function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }
function animate() { requestAnimationFrame(animate); update(); renderer.render(scene, camera); }

init();