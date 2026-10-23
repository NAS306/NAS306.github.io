
    let frameCount = 0;
    let lastTime = performance.now();
    const fpsDisplay = document.getElementById("fps");

    function loop() {
      frameCount++;
      const now = performance.now();
      const delta = now - lastTime;

      if (delta >= 1000) {
        fpsDisplay.textContent = `FPS: ${frameCount}`;
        frameCount = 0;
        lastTime = now;
      }

      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  