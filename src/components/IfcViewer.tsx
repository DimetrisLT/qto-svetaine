import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATEGORY_INFO, CATEGORY_ORDER, type ElementCategory } from '@/types/qto';
import type { ViewerGeometry } from '@/lib/ifc/parseIfc';

interface Props {
  geometries: ViewerGeometry[];
}

/** 3D IFC modelio peržiūra su spalvų koduote pagal elementų tipus */
export default function IfcViewer({ geometries }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ groups: Map<ElementCategory, THREE.Group> } | null>(null);
  const [visible, setVisible] = useState<Record<ElementCategory, boolean>>(() => {
    const v = {} as Record<ElementCategory, boolean>;
    for (const c of CATEGORY_ORDER) v[c] = true;
    return v;
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || geometries.length === 0) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(1, 2, 3);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dir2.position.set(-2, 1, -2);
    scene.add(dir2);

    // Centro paskaičiavimas (koordinačių normalizavimas)
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const g of geometries) {
      for (let i = 0; i < g.positions.length; i += 3) {
        v.set(g.positions[i], g.positions[i + 1], g.positions[i + 2]);
        box.expandByPoint(v);
      }
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1);

    const groups = new Map<ElementCategory, THREE.Group>();
    for (const g of geometries) {
      let group = groups.get(g.category);
      if (!group) {
        group = new THREE.Group();
        groups.set(g.category, group);
        scene.add(group);
      }
      const geo = new THREE.BufferGeometry();
      // web-ifc koordinatės jau Y-up metrais – tik sucentravimas
      const pos = new Float32Array(g.positions.length);
      for (let i = 0; i < g.positions.length; i += 3) {
        pos[i] = g.positions[i] - center.x;
        pos[i + 1] = g.positions[i + 1] - center.y;
        pos[i + 2] = g.positions[i + 2] - center.z;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({
        color: CATEGORY_INFO[g.category].color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: g.category === 'window' ? 0.55 : 1,
      });
      group.add(new THREE.Mesh(geo, mat));
    }
    sceneRef.current = { groups };

    const grid = new THREE.GridHelper(radius * 2, 20, 0x334155, 0x1e293b);
    grid.position.y = -size.y / 2 - 0.01;
    scene.add(grid);

    camera.position.set(radius * 0.9, radius * 0.7, radius * 0.9);
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [geometries]);

  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    for (const [cat, group] of ctx.groups) {
      group.visible = visible[cat];
    }
  }, [visible, geometries]);

  const presentCats = CATEGORY_ORDER.filter((c) => geometries.some((g) => g.category === c));

  return (
    <div className="space-y-2">
      <div className="relative h-[420px] w-full overflow-hidden rounded-xl border bg-slate-900">
        <div ref={mountRef} className="h-full w-full" />
        <p className="absolute bottom-2 left-2 text-[11px] text-slate-400">
          Vilkite – sukti · ratukas – artinti · dešinysis – slinkti
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {presentCats.map((c) => (
          <label key={c} className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
            <input
              type="checkbox"
              checked={visible[c]}
              onChange={(e) => setVisible((s) => ({ ...s, [c]: e.target.checked }))}
              className="accent-current"
            />
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_INFO[c].color }} />
            {CATEGORY_INFO[c].lt}
          </label>
        ))}
      </div>
    </div>
  );
}
