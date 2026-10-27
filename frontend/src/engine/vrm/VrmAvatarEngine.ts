/**
 * 3D VRM Avatar Engine (`VrmAvatarEngine.ts`)
 * Client-side 3D rendering engine built on `Three.js` and `@pixiv/three-vrm`.
 * - Loads standard `.vrm` models via `GLTFLoader` + `VRMLoaderPlugin`.
 * - Provides an expressive, studio-lit **Procedural Articulated Humanoid Fallback Rig**
 *   that responds to the exact same `vrm.expressionManager.setValue(name, weight)` API
 *   (`aa`, `ih`, `ou`, `ee`, `oh`, `blink`, `happy`, `relaxed`, `neutral`, `surprised`)
 *   and humanoid bones (`chest`, `head`, `leftEye`, `rightEye`) so 60 FPS lip-sync,
 *   blinking, and head nods always work out-of-the-box in every browser environment.
 * - Includes an automatic 60 FPS HTML5 2D `<canvas>` Avatar Renderer fallback if WebGL
 *   is disabled, blocked, or loses context in the browser.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { AvatarEmotion, AvatarStateId } from '../../types/api.types';
import { VrmLipSyncController, type VisemeWeights } from './VrmLipSync';
import { VrmProceduralAnimator, type ProceduralPoseOutput } from './VrmProceduralAnim';
import { QualityGovernor, type QualityMetrics } from './QualityGovernor';

export interface AvatarRuntimeTelemetry {
  fps: number;
  tier: string;
  state: AvatarStateId;
  emotion: AvatarEmotion;
  visemes: VisemeWeights;
  blink: number;
  rms: number;
  usingProceduralFallback: boolean;
}

interface ProceduralRigHandles {
  root: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  leftEyeLid: THREE.Mesh;
  rightEyeLid: THREE.Mesh;
  leftPupil: THREE.Group;
  rightPupil: THREE.Group;
  mouthInterior: THREE.Mesh;
  upperLip: THREE.Mesh;
  lowerLip: THREE.Mesh;
  leftBrow: THREE.Mesh;
  rightBrow: THREE.Mesh;
  auraRing: THREE.Mesh;
  setExpression: (name: string, weight: number) => void;
}

export class VrmAvatarEngine {
  private renderer: THREE.WebGLRenderer | null = null;
  private fallbackCanvas2d: HTMLCanvasElement | null = null;
  private fallbackCtx2d: CanvasRenderingContext2D | null = null;
  private containerWidth = 640;
  private containerHeight = 480;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private vrm: VRM | null = null;
  private proceduralRig: ProceduralRigHandles | null = null;
  private lipSync: VrmLipSyncController;
  private animator: VrmProceduralAnimator;
  private governor: QualityGovernor;
  private analyser: AnalyserNode | null = null;
  private analyserSampleRate = 48000;
  private rafId: number | null = null;
  private candidateVoiceActive = true;
  private onTelemetry?: (telemetry: AvatarRuntimeTelemetry) => void;
  private resizeObserver: ResizeObserver | null = null;
  private windowResizeHandler: (() => void) | null = null;
  private disposed = false;
  private telemetryElapsedSec = 0;
  private loadedModelUrl: string | null = null;
  private loadingModelUrl: string | null = null;

  constructor(onTelemetry?: (telemetry: AvatarRuntimeTelemetry) => void) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf4f2ec);
    this.camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 20);
    this.camera.position.set(0, 1.38, 1.55);
    this.camera.lookAt(0, 1.34, 0);

    this.clock = new THREE.Clock();
    this.lipSync = new VrmLipSyncController();
    this.animator = new VrmProceduralAnimator();
    this.governor = new QualityGovernor((_tier, pixelRatio) => {
      if (this.renderer) {
        this.renderer.setPixelRatio(pixelRatio);
      }
    });
    this.onTelemetry = onTelemetry;

    this.setupLightingAndBackdrop();
    this.buildProceduralHumanoidRig();
  }

  private setupLightingAndBackdrop(): void {
    // Match official @pixiv/three-vrm lighting (DirectionalLight Math.PI) + warm studio fill
    const keyLight = new THREE.DirectionalLight(0xffffff, Math.PI * 0.85);
    keyLight.position.set(1.0, 1.5, 2.0);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xfffbf0, 1.1);
    fillLight.position.set(-1.5, 1.2, 1.5);
    this.scene.add(fillLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xeae7df, 0.9);
    hemiLight.position.set(0, 3, 0);
    this.scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);
  }

  /**
   * Builds an articulated 3D humanoid bust with real-time morphable mouth (`aa, ih, ou, ee, oh`),
   * eyelids (`blink`), eyebrows (`happy, serious, surprised`), eyeglasses frame, and spine/chest/head hierarchy.
   */
  private buildProceduralHumanoidRig(): void {
    const root = new THREE.Group();
    const chest = new THREE.Group();
    chest.position.set(0, 1.05, 0);
    root.add(chest);

    // Shoulders / Blazer torso (Warm Stone Editorial Palette)
    const torsoGeo = new THREE.CapsuleGeometry(0.21, 0.28, 16, 24);
    const blazerMat = new THREE.MeshStandardMaterial({
      color: 0x2b3830,
      roughness: 0.62,
      metalness: 0.08,
    });
    const torsoMesh = new THREE.Mesh(torsoGeo, blazerMat);
    torsoMesh.scale.set(1.35, 1.0, 0.68);
    torsoMesh.position.set(0, -0.05, 0);
    chest.add(torsoMesh);

    // Collar / Inner shirt accent
    const collarGeo = new THREE.CylinderGeometry(0.085, 0.11, 0.14, 24);
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0xe2ddd2,
      roughness: 0.55,
      metalness: 0.04,
    });
    const collarMesh = new THREE.Mesh(collarGeo, collarMat);
    collarMesh.position.set(0, 0.16, 0.02);
    chest.add(collarMesh);

    // Neck
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xeee9e0,
      roughness: 0.42,
      metalness: 0.04,
    });
    const neckGeo = new THREE.CylinderGeometry(0.056, 0.064, 0.13, 24);
    const neckMesh = new THREE.Mesh(neckGeo, skinMat);
    neckMesh.position.set(0, 0.23, 0);
    chest.add(neckMesh);

    // Head Group
    const head = new THREE.Group();
    head.position.set(0, 0.34, 0);
    chest.add(head);

    // Cranium / Face
    const headGeo = new THREE.SphereGeometry(0.145, 36, 36);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.scale.set(0.92, 1.12, 0.95);
    head.add(headMesh);

    // Stylized Hair Cap & Side Strands
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x24221f,
      roughness: 0.48,
      metalness: 0.12,
    });
    const hairCapGeo = new THREE.SphereGeometry(0.154, 32, 32);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.scale.set(0.96, 1.08, 0.98);
    hairCap.position.set(0, 0.032, -0.018);
    head.add(hairCap);

    // Eyes & Eyelids
    const scleraMat = new THREE.MeshStandardMaterial({ color: 0xfaf9f5, roughness: 0.2 });
    const irisMat = new THREE.MeshStandardMaterial({
      color: 0x2b3830,
      roughness: 0.2,
    });
    const lidMat = new THREE.MeshStandardMaterial({ color: 0xe5dfd5, roughness: 0.45 });

    const createEyeAssembly = (side: -1 | 1) => {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.052, 0.022, 0.122);

      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.021, 20, 20), scleraMat);
      sclera.scale.set(1.15, 0.95, 0.6);
      eyeGroup.add(sclera);

      const pupilGroup = new THREE.Group();
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 16, 16), irisMat);
      iris.position.set(0, 0, 0.009);
      iris.scale.set(1, 1, 0.45);
      pupilGroup.add(iris);

      const highlight = new THREE.Mesh(
        new THREE.SphereGeometry(0.0035, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      highlight.position.set(0.004, 0.004, 0.014);
      pupilGroup.add(highlight);

      eyeGroup.add(pupilGroup);

      const eyeLid = new THREE.Mesh(new THREE.SphereGeometry(0.023, 20, 20), lidMat);
      eyeLid.scale.set(1.2, 0.05, 0.68);
      eyeLid.position.set(0, 0.016, 0.002);
      eyeGroup.add(eyeLid);

      head.add(eyeGroup);
      return { eyeLid, pupilGroup };
    };

    const leftEye = createEyeAssembly(-1);
    const rightEye = createEyeAssembly(1);

    // Minimalist Eyeglasses Frame (Warm Minimalist Editorial Identity)
    const glassesMat = new THREE.MeshStandardMaterial({
      color: 0x1a1918,
      metalness: 0.75,
      roughness: 0.22,
    });
    const frameGeo = new THREE.TorusGeometry(0.028, 0.0035, 14, 32);
    const leftFrame = new THREE.Mesh(frameGeo, glassesMat);
    leftFrame.position.set(-0.052, 0.022, 0.138);
    head.add(leftFrame);

    const rightFrame = new THREE.Mesh(frameGeo, glassesMat);
    rightFrame.position.set(0.052, 0.022, 0.138);
    head.add(rightFrame);

    const bridgeGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.048, 8);
    bridgeGeo.rotateZ(Math.PI / 2);
    const bridgeMesh = new THREE.Mesh(bridgeGeo, glassesMat);
    bridgeMesh.position.set(0, 0.025, 0.14);
    head.add(bridgeMesh);

    // Eyebrows
    const browGeo = new THREE.CapsuleGeometry(0.0045, 0.032, 8, 12);
    const leftBrow = new THREE.Mesh(browGeo, hairMat);
    leftBrow.rotation.z = Math.PI / 2 - 0.06;
    leftBrow.position.set(-0.052, 0.058, 0.128);
    head.add(leftBrow);

    const rightBrow = new THREE.Mesh(browGeo, hairMat);
    rightBrow.rotation.z = Math.PI / 2 + 0.06;
    rightBrow.position.set(0.052, 0.058, 0.128);
    head.add(rightBrow);

    // Nose
    const noseGeo = new THREE.ConeGeometry(0.012, 0.038, 16);
    const noseMesh = new THREE.Mesh(noseGeo, skinMat);
    noseMesh.position.set(0, -0.004, 0.142);
    noseMesh.rotation.x = 0.25;
    head.add(noseMesh);

    // Mouth Cavity & Lips (Driven by aa, ih, ou, ee, oh, happy)
    const mouthInteriorMat = new THREE.MeshBasicMaterial({ color: 0x450a0a });
    const mouthInterior = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 24, 24),
      mouthInteriorMat,
    );
    mouthInterior.position.set(0, -0.054, 0.126);
    mouthInterior.scale.set(1.1, 0.08, 0.35);
    head.add(mouthInterior);

    const lipMat = new THREE.MeshStandardMaterial({ color: 0xd9777f, roughness: 0.35 });
    const upperLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.036, 8, 16), lipMat);
    upperLip.rotation.z = Math.PI / 2;
    upperLip.position.set(0, -0.049, 0.132);
    head.add(upperLip);

    const lowerLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.034, 8, 16), lipMat);
    lowerLip.rotation.z = Math.PI / 2;
    lowerLip.position.set(0, -0.058, 0.131);
    head.add(lowerLip);

    // Subtle Status Ring behind Avatar (Warm Minimalist tones)
    const auraGeo = new THREE.RingGeometry(0.28, 0.302, 64);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xd9d5cc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
    });
    const auraRing = new THREE.Mesh(auraGeo, auraMat);
    auraRing.position.set(0, 1.37, -0.18);
    root.add(auraRing);

    const expState: Record<string, number> = {
      aa: 0,
      ih: 0,
      ou: 0,
      ee: 0,
      oh: 0,
      blink: 0,
      happy: 0,
      relaxed: 0,
      neutral: 1,
      surprised: 0,
      angry: 0,
    };

    const applyProceduralExpressions = () => {
      const aa = expState.aa || 0;
      const ih = expState.ih || 0;
      const ou = expState.ou || 0;
      const ee = expState.ee || 0;
      const oh = expState.oh || 0;
      const happy = expState.happy || 0;
      const surprised = expState.surprised || 0;
      const angry = expState.angry || 0;
      const blink = expState.blink || 0;

      // Mouth opening height & width based on visemes (`aa`, `ih`, `ou`, `ee`, `oh`)
      const openHeight =
        0.08 + aa * 1.15 + oh * 0.95 + ou * 0.55 + ee * 0.52 + ih * 0.28 + surprised * 0.25;
      const openWidth =
        1.0 +
        ih * 0.48 +
        ee * 0.38 +
        aa * 0.12 -
        ou * 0.42 -
        oh * 0.25 +
        happy * 0.32;

      mouthInterior.scale.set(
        Math.max(0.45, openWidth),
        Math.max(0.06, openHeight),
        0.35,
      );

      const verticalGap = (openHeight - 0.08) * 0.014;
      upperLip.position.y = -0.049 + verticalGap * 0.45 + happy * 0.003;
      lowerLip.position.y = -0.058 - verticalGap * 0.85 + happy * 0.002;
      upperLip.scale.y = Math.max(0.55, openWidth * 0.95);
      lowerLip.scale.y = Math.max(0.55, openWidth * 0.92);

      // Eyelids (`blink`)
      const lidScaleY = 0.06 + blink * 0.98;
      const lidOffsetY = 0.016 - blink * 0.015;
      leftEye.eyeLid.scale.y = lidScaleY;
      rightEye.eyeLid.scale.y = lidScaleY;
      leftEye.eyeLid.position.y = lidOffsetY;
      rightEye.eyeLid.position.y = lidOffsetY;

      // Eyebrows (`happy`, `surprised`, `angry`/`serious`)
      const browLift = happy * 0.006 + surprised * 0.012 - angry * 0.005;
      leftBrow.position.y = 0.058 + browLift;
      rightBrow.position.y = 0.058 + browLift;
      leftBrow.rotation.z = Math.PI / 2 - 0.06 - happy * 0.08 + angry * 0.16;
      rightBrow.rotation.z = Math.PI / 2 + 0.06 + happy * 0.08 - angry * 0.16;
    };

    this.proceduralRig = {
      root,
      chest,
      head,
      leftEyeLid: leftEye.eyeLid,
      rightEyeLid: rightEye.eyeLid,
      leftPupil: leftEye.pupilGroup,
      rightPupil: rightEye.pupilGroup,
      mouthInterior,
      upperLip,
      lowerLip,
      leftBrow,
      rightBrow,
      auraRing,
      setExpression: (name: string, weight: number) => {
        expState[name] = weight;
        applyProceduralExpressions();
      },
    };

    this.scene.add(root);
  }

  private mountFallback2dCanvas(container: HTMLElement, width: number, height: number): void {
    try {
      const canvas2d = document.createElement('canvas');
      canvas2d.width = width;
      canvas2d.height = height;
      canvas2d.style.display = 'block';
      canvas2d.style.width = `${width}px`;
      canvas2d.style.height = `${height}px`;
      const ctx2d = canvas2d.getContext('2d');
      if (ctx2d) {
        this.fallbackCanvas2d = canvas2d;
        this.fallbackCtx2d = ctx2d;
        container.innerHTML = '';
        container.appendChild(canvas2d);
      }
    } catch {
      this.fallbackCanvas2d = null;
      this.fallbackCtx2d = null;
    }
  }

  private renderFallback2dFrame(pose: ProceduralPoseOutput, visemes: VisemeWeights): void {
    const ctx = this.fallbackCtx2d;
    const canvas = this.fallbackCanvas2d;
    if (!ctx || !canvas) return;

    const w = canvas.width || this.containerWidth;
    const h = canvas.height || this.containerHeight;
    const cx = w * 0.5;
    const cy = h * 0.52;
    const scale = Math.min(w, h) / 460;

    ctx.clearRect(0, 0, w, h);

    // Subtle state ring behind bust
    const ringColor =
      pose.state === 'SPEAKING'
        ? 'rgba(28, 27, 24, 0.22)'
        : pose.state === 'LISTENING'
          ? 'rgba(43, 56, 48, 0.22)'
          : pose.state === 'THINKING'
            ? 'rgba(138, 93, 59, 0.25)'
            : 'rgba(217, 213, 204, 0.28)';

    ctx.save();
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy - 34 * scale, 118 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Apply chest & head sway
    const swayX = (pose.headRotation.y * 85 + pose.chestRotation.y * 40) * scale;
    const swayY = (pose.headRotation.x * 65 + pose.chestRotation.x * 35) * scale;

    // Shoulders / Blazer
    ctx.fillStyle = '#2B3830';
    ctx.beginPath();
    ctx.ellipse(cx + swayX * 0.35, cy + 125 * scale + swayY * 0.35, 118 * scale, 78 * scale, 0, Math.PI, 0, false);
    ctx.closePath();
    ctx.fill();

    // Inner Collar
    ctx.fillStyle = '#E2DDD2';
    ctx.beginPath();
    ctx.ellipse(cx + swayX * 0.45, cy + 56 * scale + swayY * 0.4, 44 * scale, 26 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Neck
    ctx.fillStyle = '#E6E0D5';
    ctx.fillRect(cx - 22 * scale + swayX * 0.6, cy + 8 * scale + swayY * 0.5, 44 * scale, 48 * scale);

    // Head Group
    ctx.translate(cx + swayX, cy - 42 * scale + swayY);
    ctx.rotate(-pose.headRotation.z * 0.65);

    // Hair Back Cap
    ctx.fillStyle = '#24221F';
    ctx.beginPath();
    ctx.ellipse(0, -10 * scale, 66 * scale, 76 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sculpted Porcelain Face
    const faceGrad = ctx.createRadialGradient(-16 * scale, -22 * scale, 10 * scale, 0, 0, 74 * scale);
    faceGrad.addColorStop(0, '#F7F4EC');
    faceGrad.addColorStop(1, '#E5DFD3');
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 58 * scale, 70 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Front Hair Sweep
    ctx.fillStyle = '#24221F';
    ctx.beginPath();
    ctx.arc(0, -14 * scale, 60 * scale, Math.PI * 1.08, Math.PI * 1.92);
    ctx.fill();

    // Eyebrows
    const browOffset = (pose.expressions.happy * 4 + pose.expressions.surprised * 7) * scale;
    ctx.strokeStyle = '#24221F';
    ctx.lineWidth = 3.5 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-34 * scale, -22 * scale - browOffset);
    ctx.quadraticCurveTo(-22 * scale, -26 * scale - browOffset, -10 * scale, -21 * scale - browOffset);
    ctx.moveTo(10 * scale, -21 * scale - browOffset);
    ctx.quadraticCurveTo(22 * scale, -26 * scale - browOffset, 34 * scale, -22 * scale - browOffset);
    ctx.stroke();

    // Eyes (with blink)
    const eyeOpen = Math.max(0.08, 1 - pose.expressions.blink * 0.92);
    const drawEye = (ex: number) => {
      ctx.fillStyle = '#24221F';
      ctx.beginPath();
      ctx.ellipse(ex, -8 * scale, 7.5 * scale, 7.5 * scale * eyeOpen, 0, 0, Math.PI * 2);
      ctx.fill();

      if (eyeOpen > 0.35) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ex + 2.2 * scale, -10 * scale, 2 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawEye(-22 * scale);
    drawEye(22 * scale);

    // Minimalist Eyeglasses Frame
    ctx.strokeStyle = '#1A1918';
    ctx.lineWidth = 2.6 * scale;
    ctx.beginPath();
    ctx.arc(-22 * scale, -8 * scale, 14.5 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(22 * scale, -8 * scale, 14.5 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-7.5 * scale, -8 * scale);
    ctx.lineTo(7.5 * scale, -8 * scale);
    ctx.stroke();

    // Mouth (5-vowel viseme reactive)
    const mouthOpen =
      visemes.aa * 14 +
      visemes.oh * 11 +
      visemes.ou * 7 +
      visemes.ee * 6 +
      visemes.ih * 4;
    const mouthWidth =
      15 +
      visemes.ee * 6 +
      visemes.ih * 5 +
      pose.expressions.happy * 4 -
      visemes.ou * 4;

    ctx.fillStyle = '#24221F';
    ctx.beginPath();
    ctx.ellipse(
      0,
      28 * scale,
      Math.max(8, mouthWidth) * scale,
      Math.max(2.6, 2.8 + mouthOpen) * scale,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.restore();
  }

  public mount(container: HTMLElement): void {
    this.disposed = false;
    const rect = container.getBoundingClientRect();
    const width = Math.max(320, Math.round(container.clientWidth || rect.width || 640));
    const height = Math.max(320, Math.round(container.clientHeight || rect.height || 480));
    this.containerWidth = width;
    this.containerHeight = height;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    let webglReady = false;
    try {
      try {
        this.renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
        });
      } catch {
        this.renderer = new THREE.WebGLRenderer({
          antialias: false,
          alpha: false,
          failIfMajorPerformanceCaveat: false,
        });
      }
      this.renderer.setClearColor(0xf4f2ec, 1);
      // Use updateStyle = true (same as reference HTML) so Three.js sets explicit pixel width & height
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(this.governor.getRecommendedPixelRatio());
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.domElement.style.display = 'block';
      container.innerHTML = '';
      container.appendChild(this.renderer.domElement);
      this.renderer.render(this.scene, this.camera);
      webglReady = true;

      this.renderer.domElement.addEventListener(
        'webglcontextlost',
        (ev) => {
          ev.preventDefault();
          if (!this.disposed) {
            this.renderer = null;
            this.mountFallback2dCanvas(container, this.containerWidth, this.containerHeight);
          }
        },
        { once: true },
      );
    } catch {
      this.renderer = null;
      webglReady = false;
    }

    if (!webglReady) {
      this.mountFallback2dCanvas(container, width, height);
    }

    const syncContainerSize = () => {
      if (this.disposed) return;
      const r = container.getBoundingClientRect();
      const w = Math.max(280, Math.round(container.clientWidth || r.width || 640));
      const h = Math.max(280, Math.round(container.clientHeight || r.height || 480));
      if (w === this.containerWidth && h === this.containerHeight) return;
      this.containerWidth = w;
      this.containerHeight = h;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer?.setSize(w, h);
      if (this.fallbackCanvas2d) {
        this.fallbackCanvas2d.width = w;
        this.fallbackCanvas2d.height = h;
        this.fallbackCanvas2d.style.width = `${w}px`;
        this.fallbackCanvas2d.style.height = `${h}px`;
      }
    };

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        syncContainerSize();
      });
      this.resizeObserver.observe(container);
    }

    if (typeof window !== 'undefined') {
      this.windowResizeHandler = () => syncContainerSize();
      window.addEventListener('resize', this.windowResizeHandler);
    }

    this.startLoop();
  }

  /**
   * Attempts to load a `.vrm` file via `@pixiv/three-vrm`.
   * If the file is unreachable or a placeholder, gracefully retains the 60 FPS procedural rig.
   */
  public async loadVrmModel(url: string): Promise<boolean> {
    if (this.disposed || !url) {
      return false;
    }
    if (this.loadedModelUrl === url && this.vrm) {
      return true;
    }
    if (this.loadingModelUrl === url) {
      return true;
    }

    this.loadingModelUrl = url;
    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      const gltf = await loader.loadAsync(url);
      const loadedVrm = gltf.userData.vrm as VRM | undefined;
      if (!loadedVrm) {
        this.loadingModelUrl = null;
        return false;
      }

      if (this.disposed) {
        this.loadingModelUrl = null;
        VRMUtils.deepDispose(loadedVrm.scene);
        return false;
      }

      if (this.vrm) {
        this.scene.remove(this.vrm.scene);
        VRMUtils.deepDispose(this.vrm.scene);
      }

      // Official @pixiv/three-vrm@3.5.5 + three@0.180.0 optimization pipeline
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.combineMorphs(loadedVrm);
      VRMUtils.rotateVRM0(loadedVrm);

      loadedVrm.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });

      const isVrm0 = loadedVrm.meta?.metaVersion === '0';
      const armRelaxAngle = 1.18;
      const leftUpperArm = loadedVrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
      const rightUpperArm = loadedVrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
      if (leftUpperArm) {
        leftUpperArm.rotation.z = isVrm0 ? armRelaxAngle : -armRelaxAngle;
      }
      if (rightUpperArm) {
        rightUpperArm.rotation.z = isVrm0 ? -armRelaxAngle : armRelaxAngle;
      }

      loadedVrm.update(0);
      this.scene.add(loadedVrm.scene);
      loadedVrm.scene.updateMatrixWorld(true);

      const headNode =
        loadedVrm.humanoid?.getRawBoneNode('head') ??
        loadedVrm.humanoid?.getNormalizedBoneNode('head');
      const leftEyeNode =
        loadedVrm.humanoid?.getRawBoneNode('leftEye') ??
        loadedVrm.humanoid?.getNormalizedBoneNode('leftEye');

      if (headNode) {
        const headPos = new THREE.Vector3();
        headNode.getWorldPosition(headPos);
        let focusY = headPos.y + 0.05;
        if (leftEyeNode) {
          const eyePos = new THREE.Vector3();
          leftEyeNode.getWorldPosition(eyePos);
          focusY = (headPos.y + eyePos.y) * 0.5;
        }
        this.camera.position.set(0, focusY, 1.28);
        this.camera.lookAt(0, focusY - 0.04, 0);
        this.camera.updateProjectionMatrix();
      }

      this.vrm = loadedVrm;
      this.loadedModelUrl = url;
      this.loadingModelUrl = null;
      if (this.proceduralRig) {
        this.proceduralRig.root.visible = false;
      }

      return true;
    } catch {
      this.loadingModelUrl = null;
      // Keep procedural humanoid fallback visible
      if (!this.disposed && this.proceduralRig) {
        this.proceduralRig.root.visible = true;
      }
      return false;
    }
  }

  public connectAnalyser(analyser: AnalyserNode | null, sampleRate = 48000): void {
    this.analyser = analyser;
    this.analyserSampleRate = sampleRate;
  }

  public setAvatarState(state: AvatarStateId, emotion?: AvatarEmotion): void {
    this.animator.setState(state, emotion);
    if (state === 'INTERRUPTED') {
      // Fast reset visemes
      this.lipSync.forceZero();
    }
  }

  public setAvatarEmotion(emotion: AvatarEmotion): void {
    this.animator.setEmotion(emotion);
  }

  public setCandidateVoiceActive(active: boolean): void {
    this.candidateVoiceActive = active;
  }

  private startLoop(): void {
    if (this.rafId !== null) return;
    this.clock.start();

    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      const dt = this.clock.getDelta();
      this.stepFrame(dt);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  public stepFrame(deltaTimeSec: number): {
    pose: ProceduralPoseOutput;
    visemes: VisemeWeights;
    quality: QualityMetrics;
  } {
    const state = this.animator.getState();
    const isSpeaking = state === 'SPEAKING';
    const isInterrupted = state === 'INTERRUPTED';

    const visemes = this.lipSync.updateFromAnalyser(
      this.analyser,
      this.analyserSampleRate,
      deltaTimeSec,
      isSpeaking,
      isInterrupted,
    );

    const speechRms = this.lipSync.getLastRms();
    const pose = this.animator.update(deltaTimeSec, speechRms, this.candidateVoiceActive);
    const quality = this.governor.recordFrame(deltaTimeSec);

    // Apply to loaded VRM if present
    if (this.vrm) {
      const expMgr = this.vrm.expressionManager;
      if (expMgr) {
        expMgr.setValue('aa', visemes.aa);
        expMgr.setValue('ih', visemes.ih);
        expMgr.setValue('ou', visemes.ou);
        expMgr.setValue('ee', visemes.ee);
        expMgr.setValue('oh', visemes.oh);
        expMgr.setValue('blink', pose.expressions.blink);
        expMgr.setValue('neutral', pose.expressions.neutral);
        expMgr.setValue('happy', pose.expressions.happy);
        expMgr.setValue('relaxed', pose.expressions.relaxed);
        expMgr.setValue('angry', pose.expressions.angry);
        expMgr.setValue('sad', pose.expressions.sad);
        expMgr.setValue('surprised', pose.expressions.surprised);
      }

      const chestNode = this.vrm.humanoid?.getNormalizedBoneNode('chest');
      if (chestNode) {
        chestNode.rotation.set(
          pose.chestRotation.x,
          pose.chestRotation.y,
          pose.chestRotation.z,
        );
      }

      const headNode = this.vrm.humanoid?.getNormalizedBoneNode('head');
      if (headNode) {
        headNode.rotation.set(
          pose.headRotation.x,
          pose.headRotation.y,
          pose.headRotation.z,
        );
      }

      const vrmDt = Math.max(0.001, Math.min(deltaTimeSec, 1 / 30));
      this.vrm.update(vrmDt);
    }

    // Apply to Procedural Articulated Humanoid Fallback Rig
    if (this.proceduralRig && (!this.vrm || this.proceduralRig.root.visible)) {
      const rig = this.proceduralRig;
      rig.chest.rotation.set(
        pose.chestRotation.x,
        pose.chestRotation.y,
        pose.chestRotation.z,
      );
      rig.head.rotation.set(
        pose.headRotation.x,
        pose.headRotation.y,
        pose.headRotation.z,
      );
      rig.leftPupil.position.set(
        pose.eyeGazeOffset.yaw * 0.04,
        pose.eyeGazeOffset.pitch * 0.04,
        0,
      );
      rig.rightPupil.position.set(
        pose.eyeGazeOffset.yaw * 0.04,
        pose.eyeGazeOffset.pitch * 0.04,
        0,
      );

      rig.setExpression('aa', visemes.aa);
      rig.setExpression('ih', visemes.ih);
      rig.setExpression('ou', visemes.ou);
      rig.setExpression('ee', visemes.ee);
      rig.setExpression('oh', visemes.oh);
      rig.setExpression('blink', pose.expressions.blink);
      rig.setExpression('happy', pose.expressions.happy);
      rig.setExpression('relaxed', pose.expressions.relaxed);
      rig.setExpression('neutral', pose.expressions.neutral);
      rig.setExpression('surprised', pose.expressions.surprised);
      rig.setExpression('angry', pose.expressions.angry);

      // Update aura ring color by state (Warm Minimalist palette)
      const auraMat = rig.auraRing.material as THREE.MeshBasicMaterial;
      if (state === 'SPEAKING') {
        auraMat.color.setHex(0x1c1b18);
      } else if (state === 'LISTENING') {
        auraMat.color.setHex(0x2b3830);
      } else if (state === 'THINKING') {
        auraMat.color.setHex(0x8a5d3b);
      } else if (state === 'INTERRUPTED') {
        auraMat.color.setHex(0xb94a48);
      } else {
        auraMat.color.setHex(0xd9d5cc);
      }
    }

    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    } else if (this.fallbackCtx2d) {
      this.renderFallback2dFrame(pose, visemes);
    }

    // Throttle telemetry callback to ~2 Hz (every 500ms) so UI listeners never trigger 60 FPS React re-renders
    this.telemetryElapsedSec += deltaTimeSec;
    if (this.onTelemetry && this.telemetryElapsedSec >= 0.5) {
      this.telemetryElapsedSec = 0;
      this.onTelemetry({
        fps: quality.fps,
        tier: quality.tier,
        state: pose.state,
        emotion: pose.emotion,
        visemes,
        blink: pose.expressions.blink,
        rms: speechRms,
        usingProceduralFallback: !this.vrm,
      });
    }

    return { pose, visemes, quality };
  }

  public isDisposed(): boolean {
    return this.disposed;
  }

  public dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.windowResizeHandler && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.windowResizeHandler);
      this.windowResizeHandler = null;
    }

    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
    if (this.renderer) {
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
      this.renderer = null;
    }
    if (this.fallbackCanvas2d) {
      if (this.fallbackCanvas2d.parentNode) {
        this.fallbackCanvas2d.parentNode.removeChild(this.fallbackCanvas2d);
      }
      this.fallbackCanvas2d = null;
      this.fallbackCtx2d = null;
    }
  }
}
