/** Free-flying camera (photo mode and debug fly-through). */
import * as THREE from 'three';
import { settings } from '../core/settings';
import type { InputManager } from '../input/InputManager';

export class FreeCam {
  yaw = 0;
  pitch = -0.2;
  readonly pos = new THREE.Vector3();
  speed = 40;
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');

  fromCamera(cam: THREE.Camera): void {
    this.pos.copy(cam.position);
    this.e.setFromQuaternion(cam.quaternion, 'YXZ');
    this.yaw = this.e.y;
    this.pitch = this.e.x;
  }

  update(
    dt: number,
    input: InputManager,
    cam: THREE.PerspectiveCamera,
    groundAt: (x: number, z: number) => number,
  ): void {
    const inv = settings.invertCameraY ? -1 : 1;
    this.yaw -=
      input.look.x * dt * 2.2 * settings.cameraSensitivity +
      input.mouse.x * 0.0022 * settings.mouseSensitivity;
    this.pitch -=
      (input.look.y * dt * 1.8 * settings.cameraSensitivity +
        input.mouse.y * 0.0022 * settings.mouseSensitivity) *
      inv;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    if (input.isDown('sprint')) this.speed = Math.min(600, this.speed * (1 + dt * 1.5));
    else this.speed += (40 - this.speed) * Math.min(1, dt * 2);
    this.e.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.quaternion.setFromEuler(this.e);
    this.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = input.value('throttleUp') - input.value('throttleDown');
    this.pos.addScaledVector(this.fwd, input.move.y * this.speed * dt);
    this.pos.addScaledVector(this.right, input.move.x * this.speed * dt);
    this.pos.y += up * this.speed * dt * 0.7;
    const g = groundAt(this.pos.x, this.pos.z) + 1.5;
    if (this.pos.y < g) this.pos.y = g;
    cam.position.copy(this.pos);
  }
}
