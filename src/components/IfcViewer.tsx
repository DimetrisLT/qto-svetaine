import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nContext';
import { useUnitSystem } from '@/lib/units';
import { fmtQty, uLabel } from '@/lib/format';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MousePointer2, X } from 'lucide-react';
import { CATEGORY_INFO, CATEGORY_ORDER, categoryLabel, type ElementCategory, type QtoItem } from '@/types/qto';
import type { ViewerGeometry } from '@/lib/ifc/parseIfc';

interface Props {
  geometries: ViewerGeometry[];
  items?: QtoItem[];
}

interface SceneCtx {
  groups: Map<ElementCategory, THREE.Group>;
  meshesById: Map<number, THREE.Mesh[]>;
  raycaster: THREE.Raycaster;
  camera: THREE.PerspectiveCamera;
}

/** 3D IFC modelio peržiūra: spalvos pagal tipus, paspaudimas → susieta žiniaraščio pozicija */
export default function IfcViewer({ geometries, items = [] }: Props) {
  const { t } = useI18n();
  const units = useUnitSystem();
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneCtx | null>(null);
  const [visible, setVisible] = useState<Record<ElementCategory, boolean>>(() => {
    const v = {} as Record<ElementCategory, boolean>;
    for (const c of CATEGORY_ORDER) v[c] = true;
    return v;
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedItem = useMemo(
    () => (selectedId !== null ? items.find((i) => i.ifcExpressId === selectedId) ?? null : null),
    [selectedId, items],
  );

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
    const meshesById = new Map<number, THREE.Mesh[]>();
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
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.expressId = g.expressId;
      group.add(mesh);
      const arr = meshesById.get(g.expressId) ?? [];
      arr.push(mesh);
      meshesById.set(g.expressId, arr);
    }
    sceneRef.current = { groups, meshesById, raycaster: new THREE.Raycaster(), camera };

    const grid = new THREE.GridHelper(radius * 2, 20, 0x334155, 0x1e293b);
    grid.position.y = -size.y / 2 - 0.01;
    scene.add(grid);

    camera.position.set(radius * 0.9, radius * 0.7, radius * 0.9);
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);

    // Paspaudimas (click), o ne vilkimas: atskiriame pagal nuvažiuotą atstumą
    let downX = 0, downY = 0;
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const ctx = sceneRef.current;
      if (!ctx) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ctx.raycaster.setFromCamera(ndc, ctx.camera);
      const meshes: THREE.Object3D[] = [];
      for (const group of ctx.groups.values()) {
        if (group.visible) meshes.push(...group.children);
      }
      const hits = ctx.raycaster.intersectObjects(meshes, false);
      const id = hits[0]?.object.userData.expressId as number | undefined;
      setSelectedId(id ?? null);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

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
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
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

  // Pažymėto elemento paryškinimas (emissive)
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    for (const [id, meshes] of ctx.meshesById) {
      for (const m of meshes) {
        const mat = m.material as THREE.MeshLambertMaterial;
        mat.emissive.setHex(id === selectedId ? 0x7c3aed : 0x000000);
        mat.emissiveIntensity = id === selectedId ? 0.85 : 0;
      }
    }
  }, [selectedId, geometries]);

  const presentCats = CATEGORY_ORDER.filter((c) => geometries.some((g) => g.category === c));

  return (
    <div className="space-y-2">
      <div className="relative h-[420px] w-full overflow-hidden rounded-xl border bg-slate-900">
        <div ref={mountRef} className="h-full w-full" />
        <p className="absolute bottom-2 left-2 text-[11px] text-slate-400">
          {t.ifc.dragHintA} <b>{t.ifc.clickElement}</b> {t.ifc.dragHintB}
        </p>
        {selectedId !== null && (
          <div className="absolute left-2 top-2 max-w-[320px] rounded-lg bg-background/95 p-3 text-xs shadow-lg backdrop-blur">
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="font-semibold leading-tight">
                {selectedItem?.name ?? `Elementas #${selectedId}`}
              </p>
              <button onClick={() => setSelectedId(null)} className="rounded p-0.5 hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {selectedItem ? (
              <div className="space-y-0.5 text-muted-foreground">
                <p>
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ backgroundColor: CATEGORY_INFO[selectedItem.category].color }}
                  />
                  {categoryLabel(selectedItem.category)}
                  {selectedItem.ifcClass ? ` · ${selectedItem.ifcClass}` : ''}
                </p>
                {selectedItem.material && <p>Medžiaga: {selectedItem.material}</p>}
                <p className="font-medium text-foreground">
                  {[
                    selectedItem.length_m !== undefined && `${t.ifc.lenWord} ${fmtQty(selectedItem.length_m, 'm', 2, units)} ${uLabel('m', units)}`,
                    selectedItem.height_m !== undefined && `${t.ifc.hWord} ${fmtQty(selectedItem.height_m, 'm', 2, units)} ${uLabel('m', units)}`,
                    selectedItem.area_m2 !== undefined && `${t.ifc.areaWord} ${fmtQty(selectedItem.area_m2, 'm²', 2, units)} ${uLabel('m²', units)}`,
                    selectedItem.volume_m3 !== undefined && `${t.ifc.volWord} ${fmtQty(selectedItem.volume_m3, 'm³', 2, units)} ${uLabel('m³', units)}`,
                  ].filter(Boolean).join(' · ') || `${selectedItem.count} ${selectedItem.unit}`}
                </p>
                {selectedItem.note && <p className="text-[11px]">{selectedItem.note}</p>}
              </div>
            ) : (
              <p className="text-muted-foreground">{t.ifc.notIncluded}</p>
            )}
          </div>
        )}
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
        {selectedId === null && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            <MousePointer2 className="h-3 w-3" /> {t.ifc.clickOn3D}
          </span>
        )}
      </div>
    </div>
  );
}
