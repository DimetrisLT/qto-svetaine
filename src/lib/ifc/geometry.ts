// IFC geometrijos skaičiavimai: tūris, paviršiaus plotas, apgaubiantis blokas

export interface MeshStats {
  area_m2: number;
  volume_m3: number;
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  triangles: number;
}

/** Taško transformacija 4x4 matrica (column-major, kaip three.js / web-ifc) */
export function transformPoint(
  m: ArrayLike<number>, x: number, y: number, z: number,
): [number, number, number] {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

/**
 * Iš trikampių tinklelio apskaičiuoja:
 * - paviršiaus plotą (visų trikampių plotų suma)
 * - tūrį (ženklintų tetraedrų metodas; absoliuti reikšmė)
 * - apgaubiantį bloką (AABB)
 *
 * web-ifc viršūnės supakuotos po 6 reikšmes (x,y,z,nx,ny,nz) – žingsnis (stride) = 6.
 * Pritaikius flatTransformation koordinatės jau METRAIS (web-ifc pats konvertuoja).
 */
export function meshStats(
  verts: Float32Array, indices: Uint32Array, matrix?: ArrayLike<number>, stride = 6,
): MeshStats {
  let area = 0;
  let volume = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const nVerts = Math.floor(verts.length / stride);
  const px = new Float64Array(nVerts);
  const py = new Float64Array(nVerts);
  const pz = new Float64Array(nVerts);

  for (let i = 0, j = 0; i + 2 < verts.length; i += stride, j++) {
    let x = verts[i], y = verts[i + 1], z = verts[i + 2];
    if (matrix) {
      [x, y, z] = transformPoint(matrix, x, y, z);
    }
    px[j] = x; py[j] = y; pz[j] = z;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const abx = px[b] - px[a], aby = py[b] - py[a], abz = pz[b] - pz[a];
    const acx = px[c] - px[a], acy = py[c] - py[a], acz = pz[c] - pz[a];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    area += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
    // Ženklintas tetraedro tūris (V = Σ v0 · (v1 × v2) / 6)
    volume += (px[a] * cx + py[a] * cy + pz[a] * cz) / 6;
  }

  if (minX === Infinity) { minX = minY = minZ = maxX = maxY = maxZ = 0; }
  return {
    area_m2: area,
    volume_m3: Math.abs(volume),
    minX, minY, minZ, maxX, maxY, maxZ,
    triangles: indices.length / 3,
  };
}

export function emptyStats(): MeshStats {
  return {
    area_m2: 0, volume_m3: 0,
    minX: Infinity, minY: Infinity, minZ: Infinity,
    maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
    triangles: 0,
  };
}

export function mergeStats(target: MeshStats, add: MeshStats): MeshStats {
  target.area_m2 += add.area_m2;
  target.volume_m3 += add.volume_m3;
  target.triangles += add.triangles;
  target.minX = Math.min(target.minX, add.minX);
  target.minY = Math.min(target.minY, add.minY);
  target.minZ = Math.min(target.minZ, add.minZ);
  target.maxX = Math.max(target.maxX, add.maxX);
  target.maxY = Math.max(target.maxY, add.maxY);
  target.maxZ = Math.max(target.maxZ, add.maxZ);
  return target;
}
