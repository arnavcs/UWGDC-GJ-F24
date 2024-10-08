console.log("loaded raycaster")

/**************************/
/* global cache variables */
/**************************/
let wallHeightScales = [];
let colourStrings = [];

/********************/
/* vector functions */
/********************/
function svtimes (scalar, vector) {
  return vector.map(a => scalar * a);
}

function vvplus (vector1, vector2) {
  return vector1.map((a, i) => (a + vector2[i]));
}

function vdot (vector1, vector2) {
  return vector1.map((a, i) => (a * vector2[i])).reduce((acc, val) => (acc + val), 0);
}

function vmagnitude (vector) {
  return Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1])
}

function vnormalize (vector) {
  return svtimes(1/vmagnitude(vector), vector);
}

function vrotate (vector, angle) {
  angle = Math.PI * -angle / 180;
  return [vector[0] * Math.cos(angle) - vector[1] * Math.sin(angle)
         ,vector[0] * Math.sin(angle) + vector[1] * Math.cos(angle)];
}

function vvproj (vector, proj) {
  return svtimes(vdot(vector, proj) / vmagnitude(proj), proj);
}

function vvequal (vector1, vector2) {
  return vector1.map((a, i) => (a == vector2[i])).reduce((acc, val) => (acc && val), true);
}

/*****************/
/* map functions */
/*****************/
function mapHas (map, idx) {
  return 0 <= idx[1] && idx[1] < map.length
      && 0 <= idx[0] && idx[0] < map[map.length - 1 - idx[1]].length;
}

function mapAt (map, idx) {
  return map[map.length - 1 - idx[1]][idx[0]];
}

function mapSet (map, idx, value) {
  map[map.length - 1 - idx[1]][idx[0]] = value;
}

function safeMapAt (map, idx) {
  if (!mapHas(map, idx)) return 0;
  return map[map.length - 1 - idx[1]][idx[0]];
}

function getTile (pos) {
  return safeMapAt(map, pos.map(Math.floor));
}

function comfortablyOutside (tile, position) {
  return ((position[0] <= tile[0] - CHAR_RADIUS) ||
          (position[0] >= tile[0] + 1 + CHAR_RADIUS) ||
          (position[1] <= tile[1] - CHAR_RADIUS) ||
          (position[1] >= tile[1] + 1 + CHAR_RADIUS));
}

/********************/
/* colour functions */
/********************/
function addAlpha (colour) {
  return [colour[0], colour[1], colour[2], 255];
}

function precomputeColourStrings(options) {
  colourStrings.push(options.zeroColour);
  options.wallColours.forEach((c) => colourStrings.push(c));
}

function ditherAlpha (xr, yr, alpha) {
  let thresholdMat = [[-0.46875, 0.03125, -0.34375, 0.15625],
                      [0.28125, -0.21875, 0.40625, -0.09375],
                      [-0.28125, 0.21875, -0.40625, 0.09375],
                      [0.46875, -0.03125, 0.34375, -0.15625]];
  return (thresholdMat[yr][xr] + alpha > 0.5) ? 1 : 0;
}

/*******************/
/* output function */
/*******************/
function putPixel (ctx, x, y, idx) {
  ctx.fillStyle = colourStrings[idx];
  ctx.fillRect(x, y, 1, 1);
}

/*************************************/
/* ray - wall collision calculations */
/*************************************/
// digital differential analysis
// returns [distance to collision or Infinity, direction of wall collided, collision wall type]
function dda (map, pos, ray) {
  let currentSquare = [Math.floor(pos[0]), Math.floor(pos[1])];

  // all of the following are using units of rays
  // need to multiply by the length of the ray at the end to get length
  let nextX = ray[0] < 0
            ? (pos[0] - currentSquare[0]) / (- ray[0])
            : (currentSquare[0] + 1 - pos[0]) / (ray[0]);
  let nextY = ray[1] < 0
            ? (pos[1] - currentSquare[1]) / (- ray[1])
            : (currentSquare[1] + 1 - pos[1]) / (ray[1]);
  let stepX = 1 / Math.abs(ray[0]);
  let stepY = 1 / Math.abs(ray[1]);
  let squareStepX = ray[0] < 0 ? -1 : 1;
  let squareStepY = ray[1] < 0 ? -1 : 1;

  let distance = 0;
  let direction = [0, 0];

  while (true) {
    if (!mapHas(map, currentSquare)) {
      return [Infinity, 0, 0];
    }

    if (mapAt(map, currentSquare) > 0) {
      return [vmagnitude(ray) * distance, direction, mapAt(map, currentSquare)];
    }

    if (nextX < nextY) {
      distance = nextX;
      nextX += stepX;
      direction = 1;
      currentSquare[0] += squareStepX;
    } else {
      distance = nextY;
      nextY += stepY;
      direction = 0;
      currentSquare[1] += squareStepY;
    }
  }
}

/*************/
/* rendering */
/*************/
function renderCol (ctx, col, map, camera, screen, screenWidth, screenHeight, options) {
  let cameraX = 2 * col / (screenWidth - 1) - 1; // in [-1, 1]

  let ray = vvplus(camera.dir, svtimes(cameraX, camera.plane));

  if (cameraX <= 0 && wallHeightScales.length == col) {
    wallHeightScales.push(0.6 * screenHeight * Math.abs(vmagnitude(ray) / vdot(ray, camera.dir)));
  }
  let wallHeightScale = wallHeightScales[(cameraX <= 0) ? col : screenWidth - 1 - col];

  let collision = dda(map, camera.pos, ray);
  let wallHeight = wallHeightScale / collision[0];

  let alpha = (1 - collision[0] / options.viewDist) * (0.7 + 0.3 * collision[1]);

  let halfScreen = (screenHeight - 1) / 2;
  let halfWall = wallHeight / 2;
  for (let row = 0; row < screenHeight; row++) {
    let yoffset = Math.abs(row - halfScreen);
    if (collision[0] > options.viewDist || yoffset >= halfWall) 
      putPixel(ctx, col, row, 0);
    else
      putPixel(ctx, col, row, ditherAlpha(col % 4, row % 4, alpha) ? collision[2] : 0);
  }
}

// camera has pos: vector, dir: vector, and fov: angle
function render (map, camera, screen, options) {
  const ctx = screen.getContext("2d");
  let k = Math.max(1, Math.floor(Math.sqrt(screen.width * screen.height / options.pixels)));
  ctx.setTransform(k, 0, 0, k, 0, 0);
  camera.plane = svtimes(Math.tan(Math.PI * camera.fov / 360), vrotate(camera.dir, 90));
  precomputeColourStrings(options);

  let screenWidth = Math.floor(screen.width / k);
  let screenHeight = Math.floor(screen.height / k);

  for (let col = 0; col < screenWidth; col++) {
    renderCol(ctx, col, map, camera, screen, screenWidth, screenHeight, options);
  }
}

