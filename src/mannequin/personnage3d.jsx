// Aperçu 3D du pantin : personnage modélisé (glTF) rendu en WebGL avec three. Chargé à la demande
// (React.lazy depuis index.jsx) : ni three ni les modèles ne pèsent sur le bundle principal, que
// les coachs ouvrent ou non cet écran.

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { detectRig, poseRig, captureSnapshot, applySnapshot, applyBlend } from "./retarget3d.js";
import { dressBody } from "./habillage3d.js";

// Les modèles vivent dans src/assets/models/ ; import.meta.glob ne plante pas le build si un
// fichier manque (le composant affiche alors le repli 2D au lieu de casser toute l'app).
const MODEL_URLS = import.meta.glob("../assets/models/*.glb", { query: "?url", import: "default", eager: true });
const modelUrl = (file) => MODEL_URLS[`../assets/models/${file}`] || null;

const CHARACTERS = {
  garcon: { body: "superhero-male.glb", hair: "hair-simpleparted.glb", hairColor: 0x3b2a1e },
  fille: { body: "superhero-female.glb", hair: "hair-long.glb", hairColor: 0x7a4a25 },
};
const ANIMATIONS_FILE = "animations.glb";

// Mouvements recalés en 3D à partir de leurs poses 2D (vue de face ou de profil, tourné vers la
// droite de l'écran), et mouvements couverts par une animation toute faite. Tout le reste montre
// le personnage au repos, avec un bandeau qui le dit : jamais une fausse animation.
const POSE_MOVEMENTS = {
  reference: { facing: "front" },
  squat: { facing: "right" },
  fente: { facing: "right" },
  frappe_but: { facing: "right" },
};
const CLIP_MOVEMENTS = { sprint: { clip: "Sprint_Loop", yaw: Math.PI / 2 } };
const POSE_PERIOD_MS = 800;
const POSE_BLEND_START = 0.55;

// Libère tout ce qu'une scène three a alloué côté GPU. Sans ça, chaque bascule de style laisserait
// un contexte WebGL ouvert — Safari/iOS en tolère très peu et coupe les plus anciens.
function disposeScene(scene) {
  scene.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => { if (value && value.isTexture) value.dispose(); });
      material.dispose();
    });
  });
}

const smooth = (t) => t * t * (3 - 2 * t);

export default function Personnage3DPreview({ gender = "garcon", movementKey, poses, onCanvasReady, fallback }) {
  const hostRef = useRef(null);
  const apiRef = useRef(null);
  const movementRef = useRef({ movementKey, poses });
  const [state, setState] = useState({ status: "loading", detail: "" });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const character = CHARACTERS[gender] || CHARACTERS.garcon;
    const urls = { body: modelUrl(character.body), hair: modelUrl(character.hair), animations: modelUrl(ANIMATIONS_FILE) };
    if (!urls.body || !urls.hair || !urls.animations) { setState({ status: "unavailable", detail: "Le modèle 3D n'est pas installé dans cette version." }); return undefined; }

    let cancelled = false;
    let cleanup = () => {};
    setState({ status: "loading", detail: "" });

    (async () => {
      try {
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none;";
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1.5, 0.1, 100);
        camera.position.set(0, 1.15, 3.9);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7fa0, 1.15));
        const sun = new THREE.DirectionalLight(0xffffff, 1.9);
        sun.position.set(2, 4, 3);
        scene.add(sun);
        const ground = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.MeshBasicMaterial({ color: 0xe3d5ef }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.005;
        scene.add(ground);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0.95, 0);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.minDistance = 1.8;
        controls.maxDistance = 7;
        controls.minPolarAngle = 0.2;
        controls.maxPolarAngle = Math.PI / 2 + 0.05;

        const resize = () => {
          const w = host.clientWidth || 400, h = host.clientHeight || Math.round(w * 2 / 3);
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        resize();

        let stopped = false;
        let mixer = null;
        const stop = () => {
          if (stopped) return;
          stopped = true;
          renderer.setAnimationLoop(null);
          resizeObserver.disconnect();
          controls.dispose();
          if (mixer) mixer.stopAllAction();
          disposeScene(scene);
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
          apiRef.current = null;
        };
        cleanup = stop;
        if (cancelled) { stop(); return; }

        const loader = new GLTFLoader();
        const [characterGltf, animationsGltf, hairGltf] = await Promise.all([loader.loadAsync(urls.body), loader.loadAsync(urls.animations), loader.loadAsync(urls.hair)]);
        if (cancelled) { stop(); return; }

        // Le personnage n'est ajouté à la scène qu'une fois entièrement habillé : le corps livré
        // porte des sous-vêtements, il ne doit jamais apparaître à l'écran dans cet état.
        const model = characterGltf.scene;
        model.updateMatrixWorld(true);
        const rig = detectRig(model);
        let body = null;
        model.traverse((object) => { if (object.isSkinnedMesh && /superhero/i.test(object.name)) body = object; });
        if (!body) throw new Error("corps introuvable dans le modèle");
        body.frustumCulled = false;
        model.traverse((object) => { if (object.isSkinnedMesh) object.frustumCulled = false; });
        const bounds = new THREE.Box3().setFromObject(model);
        const scale = (bounds.max.y - bounds.min.y) / 0.97;
        dressBody(body, rig.bones);
        // La texture des cheveux est en niveaux de gris (la couleur vient du moteur de jeu dans le pack
        // d'origine) : on la teinte, et les sourcils avec.
        const hairColor = new THREE.Color(character.hairColor);
        hairGltf.scene.traverse((object) => { if (object.isMesh) object.material.color.copy(hairColor); });
        model.traverse((object) => { if (object.isSkinnedMesh && /eyebrow/i.test(object.name)) object.material.color.copy(hairColor); });
        rig.head.attach(hairGltf.scene);
        model.updateMatrixWorld(true);
        scene.add(model);

        mixer = new THREE.AnimationMixer(model);
        const clips = Object.fromEntries(animationsGltf.animations.map((clip) => [clip.name, clip]));
        let mode = { type: "clip" };

        const playClip = (name, yaw) => {
          mixer.stopAllAction();
          body.skeleton.pose();
          rig.root.rotation.y = yaw;
          if (clips[name]) mixer.clipAction(clips[name]).reset().play();
          mode = { type: "clip" };
        };

        const setMovement = (key, movementPoses) => {
          const asPose = POSE_MOVEMENTS[key];
          const asClip = CLIP_MOVEMENTS[key];
          if (asPose && movementPoses && movementPoses.length) {
            mixer.stopAllAction();
            body.skeleton.pose();
            const snapshots = movementPoses.map((pose) => {
              poseRig(rig, pose, { facing: asPose.facing, scale });
              return captureSnapshot(rig);
            });
            mode = { type: "poses", snapshots, start: performance.now() };
            setNotice("");
          } else if (asClip) {
            playClip(asClip.clip, asClip.yaw);
            setNotice("");
          } else {
            playClip("Idle_Loop", 0);
            setNotice("Pas encore animé en 3D pour ce mouvement — le personnage reste au repos. Les mouvements déjà recalés : position de référence, squat, fente, frappe au but, sprint.");
          }
        };
        apiRef.current = { setMovement };
        setMovement(movementRef.current.movementKey, movementRef.current.poses);

        const clock = new THREE.Clock();
        renderer.setAnimationLoop(() => {
          try {
            const delta = clock.getDelta();
            if (mode.type === "clip") mixer.update(delta);
            else {
              const { snapshots, start } = mode;
              if (snapshots.length === 1) applySnapshot(rig, snapshots[0]);
              else {
                const elapsed = performance.now() - start;
                const index = Math.floor(elapsed / POSE_PERIOD_MS) % snapshots.length;
                const local = (elapsed % POSE_PERIOD_MS) / POSE_PERIOD_MS;
                const t = local < POSE_BLEND_START ? 0 : smooth((local - POSE_BLEND_START) / (1 - POSE_BLEND_START));
                applyBlend(rig, snapshots[index], snapshots[(index + 1) % snapshots.length], t);
              }
            }
            controls.update();
            renderer.render(scene, camera);
          } catch (error) {
            // Une erreur de rendu ne doit pas se répéter à chaque image : on arrête et on bascule sur le repli.
            console.error("Personnage 3D : " + (error && error.stack ? error.stack : String(error)));            stop();
            if (!cancelled) setState({ status: "error", detail: String(error && error.message ? error.message : error) });
          }
        });
        setState({ status: "ready", detail: "" });
      } catch (error) {
        cleanup();
        if (!cancelled) setState({ status: "error", detail: String(error && error.message ? error.message : error) });
      }
    })();

    return () => { cancelled = true; cleanup(); };
  }, [gender]);

  useEffect(() => {
    movementRef.current = { movementKey, poses };
    if (apiRef.current) apiRef.current.setMovement(movementKey, poses);
  }, [movementKey, poses]);

  useEffect(() => {
    if (onCanvasReady && state.status === "ready" && hostRef.current) {
      const canvas = hostRef.current.querySelector("canvas");
      if (canvas) onCanvasReady(canvas);
    }
  }, [onCanvasReady, state.status]);

  const showFallback = state.status === "unavailable" || state.status === "error";
  return (
    <div>
      <div ref={hostRef} style={{ display: showFallback ? "none" : "block", width: "100%", aspectRatio: "3 / 2", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--line)", position: "relative" }}>
        {state.status === "loading" && <div className="hint" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>Chargement du personnage 3D…</div>}
      </div>
      {state.status === "ready" && notice && <p className="hint" style={{ marginTop: 8 }}>{notice}</p>}
      {showFallback && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>Personnage 3D indisponible ici — {state.detail} Affichage du pantin 2D à la place.</p>
          {fallback}
        </>
      )}
    </div>
  );
}
