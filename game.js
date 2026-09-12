export function initStickGame() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = 550;
    canvas.height = 300;

    let stickY = 220;
    let stickX = 80;
    let velocityY = 0;
    let isJumping = false;
    let gravity = 0.55;
    let obstacles = [];
    let score = 0;
    let highScore = parseInt(localStorage.getItem('stick_high_score') || '0');
    let isGameOver = false;
    let runFrame = 0;
    let speed = 4.5;

    const playSound = (freq, duration) => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {}
    };

    const jump = () => {
        if (!isJumping && !isGameOver) {
            velocityY = -10.5;
            isJumping = true;
            playSound(320, 0.15);
        } else if (isGameOver) {
            reset();
        }
    };

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            jump();
        }
    });

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        jump();
    });

    const reset = () => {
        stickY = 220;
        velocityY = 0;
        isJumping = false;
        obstacles = [];
        score = 0;
        speed = 4.5;
        isGameOver = false;
    };

    const update = () => {
        if (isGameOver) return;

        velocityY += gravity;
        stickY += velocityY;
        if (stickY >= 220) {
            stickY = 220;
            isJumping = false;
        }

        if (Math.random() < 0.015 && (obstacles.length === 0 || obstacles[obstacles.length - 1].x < 400)) {
            obstacles.push({ x: 550, width: 14, height: 25 + Math.random() * 15 });
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
            obstacles[i].x -= speed;

            if (obstacles[i].x < stickX + 15 && obstacles[i].x + obstacles[i].width > stickX - 10) {
                if (stickY + 30 > 250 - obstacles[i].height) {
                    isGameOver = true;
                    playSound(150, 0.4);
                    if (score > highScore) {
                        highScore = score;
                        localStorage.setItem('stick_high_score', highScore);
                    }
                    if (window.logTerminal) window.logTerminal(`[GAMES] Game Over. Stick Figure Score: ${score}`);
                }
            }

            if (obstacles[i].x < -20) {
                obstacles.splice(i, 1);
                score++;
                speed += 0.1;
            }
        }
        runFrame++;
    };

    const draw = () => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 250);
        ctx.lineTo(canvas.width, 250);
        ctx.stroke();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3.5;

        ctx.beginPath();
        ctx.arc(stickX, stickY, 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(stickX, stickY + 6);
        ctx.lineTo(stickX, stickY + 22);
        ctx.stroke();

        const swing = Math.sin(runFrame * 0.25) * 12;
        ctx.beginPath();
        if (isJumping) {
            ctx.moveTo(stickX, stickY + 22);
            ctx.lineTo(stickX - 5, stickY + 28);
            ctx.moveTo(stickX, stickY + 22);
            ctx.lineTo(stickX + 8, stickY + 27);
        } else {
            ctx.moveTo(stickX, stickY + 22);
            ctx.lineTo(stickX + swing, stickY + 32);
            ctx.moveTo(stickX, stickY + 22);
            ctx.lineTo(stickX - swing, stickY + 32);
        }
        ctx.stroke();

        ctx.beginPath();
        if (isJumping) {
            ctx.moveTo(stickX, stickY + 10);
            ctx.lineTo(stickX - 10, stickY + 4);
            ctx.moveTo(stickX, stickY + 10);
            ctx.lineTo(stickX + 10, stickY + 4);
        } else {
            ctx.moveTo(stickX, stickY + 10);
            ctx.lineTo(stickX - swing * 0.7, stickY + 16);
            ctx.moveTo(stickX, stickY + 10);
            ctx.lineTo(stickX + swing * 0.7, stickY + 16);
        }
        ctx.stroke();

        ctx.fillStyle = '#ff3b30';
        for (let o of obstacles) {
            ctx.beginPath();
            ctx.moveTo(o.x, 250);
            ctx.lineTo(o.x + o.width / 2, 250 - o.height);
            ctx.lineTo(o.x + o.width, 250);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = '#fff';
        ctx.font = '14px SF Mono, Courier';
        ctx.fillText(`SCORE: ${score}`, 20, 30);
        ctx.fillText(`BEST: ${highScore}`, 20, 50);

        if (isGameOver) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px SF Mono, Courier';
            ctx.textAlign = 'center';
            ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 10);
            ctx.font = '12px SF Mono, Courier';
            ctx.fillText("TAP OR PRESS SPACE/UP TO RUN AGAIN", canvas.width / 2, canvas.height / 2 + 20);
            ctx.textAlign = 'left';
        }
    };

    const loop = () => {
        update();
        draw();
        requestAnimationFrame(loop);
    };
    loop();
}

