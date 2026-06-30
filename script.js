// ===== TRACKING NODES & CORE ELEMENTS =====
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// ===== PERFORMANCE OPTIMIZATION (Caches & States) =====
let lastTime = performance.now();
let fps = 0;
let pulseScale = 1.0;
let pulseDirection = 1;
let scanLineY = 0;

const smoothState = {
    hands: [
        { active: false, fade: 0, landmarks: Array.from({length: 21}, () => ({x:0, y:0, z:0})), label: 'LEFT', confidence: 0, gesture: 'NONE' },
        { active: false, fade: 0, landmarks: Array.from({length: 21}, () => ({x:0, y:0, z:0})), label: 'RIGHT', confidence: 0, gesture: 'NONE' }
    ],
    selectionBox: { active: false, fade: 0, left: 0, top: 0, right: 0, bottom: 0 }
};

// ===== MEDIAPIPE HANDS INITIALIZATION =====
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.75,
    minTrackingConfidence: 0.75
});

let latestHandResults = null;
hands.onResults((results) => { 
    latestHandResults = results; 
});

// Menggunakan Utility Camera Bawaan MediaPipe secara Tunggal (Tanpa startCamera manual)
const camera = new Camera(video, {
    onFrame: async () => {
        try {
            await hands.send({ image: video });
        } catch(e) {}
    },
    width: 1280,
    height: 720
});
camera.start();

// ===== GESTURE DETECTION LOGIC =====
function recognizeGesture(lm) {
    const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const thumbTip = lm[4], indexTip = lm[8], middleTip = lm[12], ringTip = lm[16], pinkyTip = lm[20];
    const indexMcp = lm[5], middleMcp = lm[9], ringMcp = lm[13], pinkyMcp = lm[17];

    const isIndexUp = indexTip.y < indexMcp.y;
    const isMiddleUp = middleTip.y < middleMcp.y;
    const isRingUp = ringTip.y < ringMcp.y;
    const isPinkyUp = pinkyTip.y < pinkyMcp.y;

    const pinchDist = dist(thumbTip, indexTip);

    if (isIndexUp && isMiddleUp && isRingUp && isPinkyUp) return "Open Palm";
    if (!isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp) return "Closed Fist";
    if (pinchDist < 0.04) return "Pinch/Stretch";
    
    return "Tracking";
}

// ===== REALTIME RENDER LOOP (ANIMATION FRAME) =====
function processAndRender(timestamp) {
    fps = Math.round(1000 / (timestamp - lastTime));
    lastTime = timestamp;

    // Animasi Pulse & Scanline
    scanLineY = (scanLineY + 2.5) % canvas.height;
    if (pulseDirection === 1) {
        pulseScale += 0.005;
        if (pulseScale >= 1.05) pulseDirection = -1;
    } else {
        pulseScale -= 0.005;
        if (pulseScale <= 0.95) pulseDirection = 1;
    }

    // LOCK INTEGRATION: Paksa resolusi piksel internal canvas 100% sama dengan ukuran display kotak kamera di monitor Anda
    if (video.clientWidth && video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
    } else {
        canvas.width = 900;
        canvas.height = 506;
    }
    
    // Bersihkan canvas di setiap frame agar tidak menumpuk gambar lama
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. CYBER GRID BACKGROUND (Digambar langsung pas di atas video kamera)
    ctx.strokeStyle = "rgba(0, 255, 128, 0.03)";
    ctx.lineWidth = 1;
    const gridSize = 45;
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Tampilkan Informasi Sistem FPS
    ctx.fillStyle = "rgba(0, 255, 128, 0.8)";
    ctx.font = "bold 13px monospace";
    ctx.fillText(`SYS_FPS: ${fps} | TARGET_LOCK: ACTIVE`, 20, 30);

    // 2. PROCESSING DATA KOORDINAT JARI TANGAN
    let detectedIndices = new Set();
    if (latestHandResults && latestHandResults.multiHandLandmarks) {
        latestHandResults.multiHandLandmarks.forEach((landmarks, idx) => {
            const classification = latestHandResults.multiHandedness[idx];
            const sideLabel = classification.label === "Left" ? "LEFT" : "RIGHT";

            let state = smoothState.hands[idx] || smoothState.hands[0];
            state.active = true;
            state.label = sideLabel;
            state.confidence = classification.score;
            state.gesture = recognizeGesture(landmarks);
            detectedIndices.add(idx);

            // LERP Smoothing untuk menghilangkan getaran (jitter) pada garis tangan
            for (let i = 0; i < 21; i++) {
                state.landmarks[i].x += (landmarks[i].x - state.landmarks[i].x) * 0.25;
                state.landmarks[i].y += (landmarks[i].y - state.landmarks[i].y) * 0.25;
            }
            state.fade = Math.min(1, state.fade + 0.15);
        });
    }

    // Efek Fade-out jika tangan disembunyikan dari kamera
    for (let i = 0; i < smoothState.hands.length; i++) {
        if (!detectedIndices.has(i)) {
            smoothState.hands[i].fade = Math.max(0, smoothState.hands[i].fade - 0.1);
            if (smoothState.hands[i].fade === 0) smoothState.hands[i].active = false;
        }
    }

    // 3. DRAWING SKELETON TANGAN (Menimpa presisi di atas jari asli)
    smoothState.hands.forEach((hand) => {
        if (!hand.active) return;

        ctx.save();
        ctx.globalAlpha = hand.fade;

        // Gambar Garis Sambungan Tulang Jari (Neon Hijau)
        ctx.strokeStyle = "rgba(0, 255, 128, 0.85)";
        ctx.lineWidth = 3;
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(0, 255, 128, 0.5)";
        
        HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
            const p1 = hand.landmarks[startIdx];
            const p2 = hand.landmarks[endIdx];
            ctx.beginPath();
            ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
            ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
            ctx.stroke();
        });

        // Gambar Titik Landmark Sendi Jari (Neon Merah)
        ctx.shadowBlur = 10;
        ctx.shadowColor = "rgba(255, 50, 50, 0.8)";
        hand.landmarks.forEach((lm) => {
            ctx.fillStyle = "rgba(255, 51, 51, 0.95)";
            ctx.beginPath();
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4.5 * pulseScale, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Tampilkan HUD Informasi Tangan di dekat pergelangan (Wrist)
        const wristPos = hand.landmarks[0];
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0, 255, 128, 0.9)";
        ctx.font = "bold 10px monospace";
        const hX = wristPos.x * canvas.width + 15;
        let hY = wristPos.y * canvas.height;

        ctx.fillText(`// ${hand.label} HAND`, hX, hY);
        ctx.fillText(`GESTURE : ${hand.gesture}`, hX, hY + 12);
        ctx.fillText(`CONF    : ${Math.round(hand.confidence * 100)}%`, hX, hY + 24);

        // ===== LOGIKA KOTAK SELEKSI YANG BISA DI-STRETCH DYNAMIC =====
        const thumb = hand.landmarks[4];
        const index = hand.landmarks[8];
        
        const targetLeft = Math.min(thumb.x, index.x) * canvas.width;
        const targetRight = Math.max(thumb.x, index.x) * canvas.width;
        const targetTop = Math.min(thumb.y, index.y) * canvas.height;
        const targetBottom = Math.max(thumb.y, index.y) * canvas.height;

        const sb = smoothState.selectionBox;
        sb.left += (targetLeft - sb.left) * 0.3;
        sb.right += (targetRight - sb.right) * 0.3;
        sb.top += (targetTop - sb.top) * 0.3;
        sb.bottom += (targetBottom - sb.bottom) * 0.3;
        sb.active = true;
        sb.fade = Math.min(1, sb.fade + 0.1);

        ctx.restore();
    });

    let handStillActive = smoothState.hands.some(h => h.active);
    if (!handStillActive) {
        smoothState.selectionBox.fade = Math.max(0, smoothState.selectionBox.fade - 0.1);
        if (smoothState.selectionBox.fade === 0) smoothState.selectionBox.active = false;
    }

    // 4. RENDERING STRETCH BLUR BOX HUD
    if (smoothState.selectionBox.active) {
        ctx.save();
        ctx.globalAlpha = smoothState.selectionBox.fade;
        
        const sb = smoothState.selectionBox;
        const boxWidth = sb.right - sb.left;
        const boxHeight = sb.bottom - sb.top;

        if (boxWidth > 5 && boxHeight > 5) {
            // A. DYNAMIC BLUR (Hanya memburamkan area di dalam rentang jempol & telunjuk)
            ctx.save();
            ctx.fillStyle = "rgba(0, 255, 128, 0.12)"; // Menggunakan overlay transparan cyber untuk efek visual blur stabil
            ctx.fillRect(sb.left, sb.top, boxWidth, boxHeight);
            ctx.restore();
            
            // B. SCAN LINE EFFECT INTERNAL KOTAK
            ctx.strokeStyle = "rgba(0, 255, 128, 0.4)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const currentScanY = sb.top + (scanLineY % boxHeight);
            ctx.moveTo(sb.left, currentScanY);
            ctx.lineTo(sb.right, currentScanY);
            ctx.stroke();

            // C. HUD SIKU POJOK KOTAK SECARA REAL-TIME MENGANUT BESAR/KECIL STRETCH
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 3;
            ctx.shadowBlur = 8;
            ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
            const lineLen = Math.min(15, boxWidth * 0.25, boxHeight * 0.25);

            // Kiri Atas
            ctx.beginPath(); ctx.moveTo(sb.left, sb.top + lineLen); ctx.lineTo(sb.left, sb.top); ctx.lineTo(sb.left + lineLen, sb.top); ctx.stroke();
            // Kanan Atas
            ctx.beginPath(); ctx.moveTo(sb.right, sb.top + lineLen); ctx.lineTo(sb.right, sb.top); ctx.lineTo(sb.right - lineLen, sb.top); ctx.stroke();
            // Kiri Bawah
            ctx.beginPath(); ctx.moveTo(sb.left, sb.bottom - lineLen); ctx.lineTo(sb.left, sb.bottom); ctx.lineTo(sb.left + lineLen, sb.bottom); ctx.stroke();
            // Kanan Bawah
            ctx.beginPath(); ctx.moveTo(sb.right, sb.bottom - lineLen); ctx.lineTo(sb.right, sb.bottom); ctx.lineTo(sb.right - lineLen, sb.bottom); ctx.stroke();
            
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 10px monospace";
            ctx.fillText(`AI_STRETCH_TARGET [W:${Math.round(boxWidth)} H:${Math.round(boxHeight)}]`, sb.left, sb.top - 8);
        }
        ctx.restore();
    }

    requestAnimationFrame(processAndRender);
}

// Jalankan loop animasi utama secara berkelanjutan
requestAnimationFrame(processAndRender);
