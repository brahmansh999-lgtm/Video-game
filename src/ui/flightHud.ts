/**
 * Head-up display for aircraft, drawn on a 2D canvas: artificial horizon + pitch ladder,
 * airspeed / altitude tapes, heading tape, vertical speed, throttle, flaps/gear, G, AoA,
 * stall warning and a projected waypoint marker. Modes: full / minimal / off.
 */
import * as THREE from 'three';
import { settings } from '../core/settings';
import type { FlightData } from '../vehicles/aircraft';

export type HudMode = 'full' | 'minimal' | 'off';
const MODES: HudMode[] = ['full', 'minimal', 'off'];
const KT = 1.94384;
const FT = 3.28084;

export class FlightHud {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  mode: HudMode = 'full';
  private w = 0;
  private h = 0;
  private blink = 0;
  private readonly proj = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'flight-hud hidden';
    parent.appendChild(this.canvas);
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    this.g = g;
  }

  cycle(): HudMode {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    return this.mode;
  }

  hide(): void {
    this.canvas.classList.add('hidden');
  }

  private color(): string {
    return settings.colorBlindHud ? '#ffd23f' : '#5dff9f';
  }

  draw(
    dt: number,
    d: FlightData,
    cam: THREE.PerspectiveCamera,
    waypoint: THREE.Vector3 | null,
    label: string,
    kind: string,
  ): void {
    if (this.mode === 'off') {
      this.hide();
      return;
    }
    this.canvas.classList.remove('hidden');
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (W !== this.w || H !== this.h) {
      this.w = W;
      this.h = H;
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.blink += dt;
    const g = this.g;
    const col = this.color();
    g.clearRect(0, 0, W, H);
    g.strokeStyle = col;
    g.fillStyle = col;
    g.lineWidth = 2;
    g.font = '600 14px ui-monospace, monospace';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.7)';
    g.shadowBlur = 3;
    const cx = W / 2;
    const cy = H / 2;
    const full = this.mode === 'full';

    // --- horizon & pitch ladder
    const ppd = Math.min(W, H) / 70;
    g.save();
    g.beginPath();
    g.rect(cx - W * 0.22, cy - H * 0.32, W * 0.44, H * 0.64);
    g.clip();
    g.translate(cx, cy);
    g.rotate((-d.roll * Math.PI) / 180);
    g.translate(0, d.pitch * ppd);
    g.beginPath();
    g.moveTo(-W, 0);
    g.lineTo(-60, 0);
    g.moveTo(60, 0);
    g.lineTo(W, 0);
    g.stroke();
    if (full) {
      g.textAlign = 'left';
      for (let p = -90; p <= 90; p += 5) {
        if (p === 0) continue;
        const y = -p * ppd;
        const len = p % 10 === 0 ? 70 : 36;
        g.setLineDash(p < 0 ? [8, 6] : []);
        g.beginPath();
        g.moveTo(-len - 40, y);
        g.lineTo(-40, y);
        g.moveTo(40, y);
        g.lineTo(len + 40, y);
        g.stroke();
        if (p % 10 === 0) {
          g.fillText(String(p), len + 46, y);
          g.fillText(String(p), -len - 70, y);
        }
      }
      g.setLineDash([]);
    }
    g.restore();
    // waterline (aircraft reference)
    g.beginPath();
    g.moveTo(cx - 40, cy);
    g.lineTo(cx - 14, cy);
    g.lineTo(cx, cy + 10);
    g.lineTo(cx + 14, cy);
    g.lineTo(cx + 40, cy);
    g.stroke();

    // --- tapes
    const tapeH = H * 0.5;
    this.tape(cx - W * 0.3, cy, tapeH, d.airspeed * KT, 10, 'left', 'KT');
    this.tape(cx + W * 0.3, cy, tapeH, d.altitude * FT, 100, 'right', 'FT');
    // heading tape
    g.textAlign = 'center';
    const hy = cy - H * 0.38;
    for (let k = -30; k <= 30; k += 5) {
      const hd = Math.round(d.heading / 5) * 5 + k;
      const x = cx + (hd - d.heading) * 8;
      const big = ((hd % 30) + 30) % 30 === 0;
      g.beginPath();
      g.moveTo(x, hy);
      g.lineTo(x, hy + (big ? 12 : 6));
      g.stroke();
      if (big) {
        const v = ((hd % 360) + 360) % 360;
        const name =
          v === 0
            ? 'N'
            : v === 90
              ? 'E'
              : v === 180
                ? 'S'
                : v === 270
                  ? 'W'
                  : String(v / 10).padStart(2, '0');
        g.fillText(name, x, hy - 10);
      }
    }
    g.strokeRect(cx - 24, hy + 16, 48, 20);
    g.fillText(String(Math.round(d.heading) % 360).padStart(3, '0'), cx, hy + 26);

    // --- readouts
    g.textAlign = 'left';
    const lx = cx - W * 0.36;
    const by = cy + H * 0.3;
    g.fillText(`THR ${Math.round(d.throttle * 100)}%`, lx, by);
    g.strokeRect(lx, by + 12, 90, 8);
    g.fillRect(lx, by + 12, 90 * d.throttle, 8);
    if (full) {
      g.fillText(`G ${d.g.toFixed(1)}`, lx, by + 40);
      g.fillText(`AOA ${d.alpha.toFixed(1)}°`, lx, by + 60);
      g.fillText(`FLAPS ${['UP', '1', 'FULL'][d.flaps]}`, lx, by + 80);
      g.fillText(`GEAR ${d.gearDown ? 'DOWN' : 'UP'}${d.brake && d.onGround ? '  BRK' : ''}`, lx, by + 100);
    }
    g.textAlign = 'right';
    const rx = cx + W * 0.36;
    g.fillText(`VS ${(d.vs * FT * 60).toFixed(0)} FPM`, rx, by);
    if (full) {
      g.fillText(`AGL ${Math.round(d.agl * FT)} FT`, rx, by + 20);
      if (kind === 'vtol')
        g.fillText(
          d.hover || d.tilt < 0.98 ? `HOVER · TILT ${Math.round(d.tilt * 90)}°` : 'CRUISE',
          rx,
          by + 40,
        );
    }

    // --- waypoint marker
    if (waypoint) {
      this.proj.copy(waypoint).project(cam);
      const behind = this.proj.z > 1;
      let px = (this.proj.x * 0.5 + 0.5) * W;
      let py = (-this.proj.y * 0.5 + 0.5) * H;
      if (behind) {
        px = W - px;
        py = H - py;
      }
      const m = 40;
      const clamped = behind || px < m || px > W - m || py < m || py > H - m;
      px = Math.min(W - m, Math.max(m, px));
      py = Math.min(H - m, Math.max(m, py));
      g.beginPath();
      if (clamped) {
        g.arc(px, py, 8, 0, Math.PI * 2);
      } else {
        g.moveTo(px, py - 12);
        g.lineTo(px + 12, py);
        g.lineTo(px, py + 12);
        g.lineTo(px - 12, py);
        g.closePath();
      }
      g.stroke();
      const dist = cam.position.distanceTo(waypoint);
      g.textAlign = 'center';
      g.fillText(`${label} ${(dist / 1852).toFixed(1)} NM`, px, py + 26);
    }

    // --- stall warning
    if (d.stall && this.blink % 0.5 < 0.3) {
      g.fillStyle = '#ff4d4d';
      g.font = '800 28px system-ui';
      g.textAlign = 'center';
      g.fillText('STALL', cx, cy + H * 0.18);
    }
  }

  private tape(
    x: number,
    cy: number,
    h: number,
    value: number,
    step: number,
    side: 'left' | 'right',
    unit: string,
  ): void {
    const g = this.g;
    const pxPer = 3.2 / (step / 10);
    const dir = side === 'left' ? -1 : 1;
    g.textAlign = side === 'left' ? 'right' : 'left';
    g.beginPath();
    g.moveTo(x, cy - h / 2);
    g.lineTo(x, cy + h / 2);
    g.stroke();
    const range = h / 2 / pxPer;
    const start = Math.ceil((value - range) / step) * step;
    for (let v = start; v <= value + range; v += step) {
      const y = cy - (v - value) * pxPer;
      const major = Math.round(v / step) % 5 === 0;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dir * (major ? 14 : 7), y);
      g.stroke();
      if (major && v >= 0) g.fillText(String(Math.round(v)), x + dir * 20, y);
    }
    const bw = 70;
    const bx = side === 'left' ? x - bw - 26 : x + 26;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(bx, cy - 13, bw, 26);
    g.fillStyle = this.color();
    g.strokeRect(bx, cy - 13, bw, 26);
    g.textAlign = 'center';
    g.fillText(String(Math.round(value)), bx + bw / 2, cy);
    g.fillText(unit, bx + bw / 2, cy - h / 2 - 14);
  }
}
