/** Rapier physics world wrapper and collision groups. */
import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

/** Collision membership bits. */
export const G_STATIC = 1 << 0;
export const G_PLAYER = 1 << 1;
export const G_VEHICLE = 1 << 2;
export const G_TRAFFIC = 1 << 3;
export const G_SENSOR = 1 << 4;

/** Rapier InteractionGroups: upper 16 bits = membership, lower 16 = filter. */
export function groups(member: number, filter: number): number {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

export const GROUP_STATIC = groups(G_STATIC, G_PLAYER | G_VEHICLE | G_TRAFFIC);
export const GROUP_PLAYER = groups(G_PLAYER, G_STATIC | G_VEHICLE | G_TRAFFIC);
export const GROUP_VEHICLE = groups(G_VEHICLE, G_STATIC | G_PLAYER | G_VEHICLE | G_TRAFFIC);
export const GROUP_TRAFFIC = groups(G_TRAFFIC, G_PLAYER | G_VEHICLE);

export class Physics {
  world!: RAPIER.World;
  readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  static async create(): Promise<Physics> {
    await RAPIER.init();
    const p = new Physics();
    p.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    p.world.timestep = 1 / 60;
    return p;
  }

  step(): void {
    this.world.step();
  }

  /** Downward ray against static geometry; returns hit height or null. */
  groundHeight(x: number, y: number, z: number, maxDist = 2000): number | null {
    this.ray.origin.x = x;
    this.ray.origin.y = y;
    this.ray.origin.z = z;
    this.ray.dir.x = 0;
    this.ray.dir.y = -1;
    this.ray.dir.z = 0;
    const hit = this.world.castRay(this.ray, maxDist, true, undefined, groups(0xffff, G_STATIC));
    return hit ? y - hit.timeOfImpact : null;
  }
}
