/** Rotating circular minimap sampled from the cached world map. */
import { DISTRICT_NAMES, districtAt } from '../world/layout';
import { MAP_PX, toMap } from './mapRender';

export interface MapMarker {
  x: number;
  z: number;
  color: string;
  shape: 'dot' | 'star' | 'diamond';
}

export class Minimap {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly label: HTMLDivElement;
  private lastDistrict = '';
  /** metres visible from centre to edge */
  range = 380;

  constructor(
    parent: HTMLElement,
    private readonly map: HTMLCanvasElement,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'minimap';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 220;
    this.canvas.height = 220;
    this.label = document.createElement('div');
    this.label.className = 'district';
    this.root.append(this.canvas, this.label);
    parent.appendChild(this.root);
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    this.g = g;
  }

  setVisible(on: boolean): void {
    this.root.style.visibility = on ? '' : 'hidden';
  }

  zoom(dir: number): void {
    this.range = Math.min(1400, Math.max(150, this.range * (dir > 0 ? 0.8 : 1.25)));
  }

  draw(x: number, z: number, yaw: number, markers: readonly MapMarker[]): void {
    const g = this.g;
    const S = 220;
    const R = S / 2;
    const scale = R / ((this.range / 4096) * MAP_PX);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0d2a3a';
    g.fillRect(0, 0, S, S);
    g.translate(R, R);
    g.rotate(yaw);
    g.scale(scale, scale);
    g.translate(-toMap(x), -toMap(z));
    g.drawImage(this.map, 0, 0);
    for (const m of markers) this.marker(m, scale, yaw);
    g.restore();
    // edge-clamped markers for things out of range
    for (const m of markers) {
      const dx = m.x - x;
      const dz = m.z - z;
      const d = Math.hypot(dx, dz);
      if (d < this.range * 0.92) continue;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const rx = dx * c - dz * s;
      const rz = dx * s + dz * c;
      const k = (R - 10) / Math.hypot(rx, rz);
      g.fillStyle = m.color;
      g.beginPath();
      g.arc(R + rx * k, R + rz * k, 5, 0, Math.PI * 2);
      g.fill();
    }
    // player arrow + north tick
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(R, R - 9);
    g.lineTo(R + 6, R + 7);
    g.lineTo(R, R + 3);
    g.lineTo(R - 6, R + 7);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffb347';
    g.font = 'bold 12px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', R + Math.sin(-yaw) * -(R - 12), R - Math.cos(-yaw) * (R - 12));
    g.strokeStyle = 'rgba(232,243,255,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.stroke();
    const name = DISTRICT_NAMES[districtAt(x, z)];
    if (name !== this.lastDistrict) {
      this.lastDistrict = name;
      this.label.textContent = name;
    }
  }

  private marker(m: MapMarker, scale: number, yaw: number): void {
    const g = this.g;
    const r = 6 / scale;
    g.save();
    g.translate(toMap(m.x), toMap(m.z));
    g.rotate(-yaw);
    g.fillStyle = m.color;
    g.beginPath();
    if (m.shape === 'diamond') {
      g.moveTo(0, -r * 1.3);
      g.lineTo(r, 0);
      g.lineTo(0, r * 1.3);
      g.lineTo(-r, 0);
    } else if (m.shape === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * 0.45 : r * 1.1;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
    } else g.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    g.closePath();
    g.fill();
    g.restore();
  }
}
