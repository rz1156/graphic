const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Inisialisasi MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

hands.onResults(onResults);

// Gunakan Utility Camera bawaan MediaPipe secara tunggal agar tidak bentrok akses hardware
const camera = new Camera(video, {
    onFrame: async () => {
        await hands.send({
            image: video
        });
    },
    width: 1280,
    height: 720
});

camera.start();

function onResults(results) {
    // FIX SINKRONISASI: Paksa resolusi koordinat canvas 100% mengikuti ukuran tampilan visual video di layar
    if (video.clientWidth && video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
    } else {
        canvas.width = 900;
        canvas.height = 506;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            
            // 1. Menggambar Garis Rangka Tangan (Putih)
            drawConnectors(
                ctx,
                landmarks,
                HAND_CONNECTIONS,
                {
                    color: "#ffffff",
                    lineWidth: 2
                }
            );

            // 2. Menggambar Titik Sendi Jari (Cyan)
            drawLandmarks(
                ctx,
                landmarks,
                {
                    color: "#00ffff",
                    fillColor: "#ffffff",
                    radius: 5
                }
            );

            // 3. LOGIKA KOTAK BLUR SELEKSI (BISA DI-STRETCH DINAMIS & MEMANJANG)
            // Mengambil titik ujung jempol (landmark 4) dan ujung telunjuk (landmark 8)
            const thumb = landmarks[4];
            const index = landmarks[8];

            // Konversi nilai normalisasi (0 ke 1) murni ke ukuran pixel canvas saat ini
            const x1 = thumb.x * canvas.width;
            const y1 = thumb.y * canvas.height;
            const x2 = index.x * canvas.width;
            const y2 = index.y * canvas.height;

            // Hitung bounding box berdasarkan rentang murni kedua ujung jari
            const boxLeft = Math.min(x1, x2);
            const boxTop = Math.min(y1, y2);
            const boxWidth = Math.abs(x1 - x2);
            const boxHeight = Math.abs(y1 - y2);

            // Kotak hanya digambar jika jari diregangkan atau ditarik memanjang
            if (boxWidth > 5 && boxHeight > 5) {
                ctx.save();
                
                // Efek Visual Blur & Cyber Overlay di dalam kotak regangan jari
                ctx.fillStyle = "rgba(0, 255, 255, 0.15)";
                ctx.fillRect(boxLeft, boxTop, boxWidth, boxHeight);

                // Garis Pinggir Kotak Seleksi
                ctx.strokeStyle = "#00ffff";
                ctx.lineWidth = 2;
                ctx.strokeRect(boxLeft, boxTop, boxWidth, boxHeight);
                
                ctx.restore();
            }
        }
    }
}
