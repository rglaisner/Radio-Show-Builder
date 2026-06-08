p.setup = () => {
  p.createCanvas(400, 400);
  p.colorMode(p.HSB, 360, 100, 100, 1);
  p.noFill();
  p.strokeCap(p.ROUND);
};

p.draw = () => {
  p.clear();
  p.translate(p.width / 2, p.height / 2);

  const t = p.millis() * 0.002;
  const numRings = 3;

  for (let i = 0; i < numRings; i++) {
    p.push();
    const dir = i % 2 === 0 ? 1 : -1;
    p.rotate(t * (0.8 + i * 0.5) * dir);

    const hueVal = (180 + i * 40 + p.sin(t * 0.5) * 60) % 360;
    const ringSize = 320 - i * 80;
    const arcLength = p.HALF_PI + p.sin(t + i) * p.QUARTER_PI;

    // Deep Glow Layer
    p.strokeWeight(50);
    p.stroke(hueVal, 100, 50, 0.2);
    p.arc(0, 0, ringSize, ringSize, 0, arcLength);

    // Primary Neon Stroke
    p.strokeWeight(30);
    p.stroke(hueVal, 100, 100, 1);
    p.arc(0, 0, ringSize, ringSize, 0, arcLength);

    // Leading Edge Tip
    p.strokeWeight(30);
    p.stroke(0, 0, 100, 1);
    p.arc(0, 0, ringSize, ringSize, arcLength - 0.2, arcLength);
    p.pop();
  }

  // Central Kinetic Aperture
  p.push();
  p.rotate(-t * 2);
  const pulse = p.sin(t * 4) * 20;
  const innerSize = 60 + pulse;
  
  p.strokeWeight(20);
  p.stroke(0, 0, 100, 1);
  for (let j = 0; j < 4; j++) {
    p.rotate(p.HALF_PI);
    p.line(innerSize * 0.5, -innerSize * 0.5, innerSize * 0.5, innerSize * 0.5);
  }
  
  p.noStroke();
  p.fill(0, 0, 100, 1);
  p.circle(0, 0, 20 + p.abs(pulse));
  p.pop();
};