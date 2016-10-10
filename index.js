"use strict";

const ramda = window.R;

const width  = 500;
const height = 500;

const putPixel = (image, x, y, { r, g, b }) => {
  const pixelIndex = 4 * ((height - y) * width + x);

  image.data[pixelIndex]     = r;
  image.data[pixelIndex + 1] = g;
  image.data[pixelIndex + 2] = b;
};

const canvasElement = document.querySelector("canvas");

const vectorFrom = ({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }) => ({
  x: x2 - x1,
  y: y2 - y1,
  z: z2 - z1
});

const crossProduct = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - b.z * a.x,
  z: a.x * b.y - a.y * b.x
});

const dotProduct = (v1, v2) => {
  return v1.x * v2.x + v1.y * v2.y + (v1.z * v2.z || 0);
};

const norm = v => {
  return Math.sqrt(Math.pow(v.x, 2) + Math.pow(v.y, 2) + Math.pow(v.z, 2));
}

const normalize = v => {
  const length = norm(v);

  return {
    x: v.x / length,
    y: v.y / length,
    z: v.z / length
  };
};

// Relies on barycentric coordinates calculations.
const pointInTriangle = (p, a, b, c) => {
  const ab = vectorFrom(a, b);
  const ac = vectorFrom(a, c);
  const pa = vectorFrom(p, a);

  const zCoordinates = crossProduct(
    {
      x: ab.x,
      y: ac.x,
      z: pa.x
    },
    {
      x: ab.y,
      y: ac.y,
      z: pa.y
    }
  );

  return (
    1 - (zCoordinates.x + zCoordinates.y) / zCoordinates.z >= 0
    && zCoordinates.x / zCoordinates.z >= 0
    && zCoordinates.y / zCoordinates.z >= 0
  );
};

const triangle = (image, color, { a, b, c }) => {
  const [minX, minY, maxX, maxY] = [
    Math.max(Math.min(a.x, b.x, c.x), 0),
    Math.max(Math.min(a.y, b.y, c.y), 0),
    Math.min(Math.max(a.x, b.x, c.x), width),
    Math.min(Math.max(a.y, b.y, c.y), height)
  ];

  for (var x = minX; x <= maxX; x++) {
    for (var y = minY; y <= maxY; y++) {
      if (pointInTriangle({ x, y }, a, b, c)) {
        putPixel(image, x, y, color);
      }
    }
  }
};

let context = canvasElement.getContext('2d');

context.imageSmoothingEnabled = false;

let image = context.createImageData(width, height);

for (let it = 0; it < width * height * 4; it += 4) {
  image.data[it + 3] = 255;
}

const triangleColor = { r: 255, g: 255, b: 255 };

const readIn = R.flip(R.prop);

const range = function * (start, end) {
  let i = start;

  while (i < end) {
    yield i;

    i++;
  }
};

const readModel = file => {
  const nbVerticesLine = file.indexOf("#") + 1;
  const nbFacesLine    = file.lastIndexOf("#") + 1;

  const verticesWordPosition = file.slice(nbVerticesLine).indexOf("vertices\n");
  const facesWordPosition    = file.slice(nbFacesLine).indexOf("faces\n");

  const nbVertices = parseInt(file.substr(nbVerticesLine, verticesWordPosition).trim());
  const nbFaces    = parseInt(file.substr(nbFacesLine, facesWordPosition).trim());

  const lines = file.trim().split("\n");

  const verticesLines = lines;
  const facesLines    = lines.slice(-(nbFaces + 1));

  const preformatLine = R.pipe(R.trim, R.split(" "), R.drop(1));

  const parseNumbersLine = R.pipe(
    // Trims the line, removes the leading "v"/"vn"/"vt".
    preformatLine,

    // Converts number strings to numbers.
    R.map(parseFloat),

    // Transform the numbers list into a 3D vector object.
    ([x, y, z]) => ({ x, y, z })
  );

  const parseFaceLine = R.pipe(
    // Trims the line, removes the leading "f".
    preformatLine,

    // Discards normals/texture info.
    R.map(R.pipe(
      // Split normals, vertices, and textures.
      R.split("/"),

      // Extracts 3 points out of the vertices string.
      R.head,

      // Converts the index string into a number.
      R.unary(parseInt)
    )),

    // Returns a triangle object.
    ([a, b, c]) => ({ a, b, c })
  );

  const readNumbersLine = source => R.compose(
    R.take(nbVertices),
    R.map(readIn(source)),
    R.map(parseNumbersLine)
  );

  const getVertices = readNumbersLine(verticesLines);

  const getFaces = R.compose(
    R.take(nbFaces),
    R.map(readIn(facesLines)),
    R.map(parseFaceLine)
  );

  return {
    vertices: R.into([], getVertices, range(0, nbVertices)),
    faces:    R.into([], getFaces, range(0, nbFaces))
  };
}

const model = readModel(document.querySelector("#model").textContent);

const scaleX = width;
const scaleY = height;

const toScreenCoordinate = R.curry((resolution, coordinate) => {
  return Math.round((coordinate + 1) * (resolution / 2));
});

const lightVector = { x: 0, y: 0, z: 1 };

const drawTriangles = model => model.faces.map(face => {
  // Assumes things are 1-indexed in the model.
  const a = model.vertices[face.a - 1];
  const b = model.vertices[face.b - 1];
  const c = model.vertices[face.c - 1];

  const ab = vectorFrom(a, b);
  const ac = vectorFrom(a, c);

  const triangleNormal = normalize(crossProduct(ab, ac));

  const lightIntensity = dotProduct(triangleNormal, lightVector);

  const toScreenCoordinateX = toScreenCoordinate(width);
  const toScreenCoordinateY = toScreenCoordinate(height);

  if (lightIntensity > 0) {
    triangle(
      image,

      {
        r: Math.round(lightIntensity * 40),
        g: Math.round(lightIntensity * 100),
        b: Math.round(lightIntensity * 200)
      },

      {
        a: { x: toScreenCoordinateX(a.x), y: toScreenCoordinateY(a.y) },
        b: { x: toScreenCoordinateX(b.x), y: toScreenCoordinateY(b.y) },
        c: { x: toScreenCoordinateX(c.x), y: toScreenCoordinateY(c.y) }
      }
    );
  }
});

drawTriangles(model);

context.putImageData(image, 0, 0);
