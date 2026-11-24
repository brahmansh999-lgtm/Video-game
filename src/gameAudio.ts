/** Drives the synthesized vehicle, ambience and radio audio from game state. */
import { audio } from './audio/audioEngine';
import { Radio } from './audio/radio';
import { VehicleSound, type EngineVoice } from './audio/vehicleSound';
import { events } from './core/events';
import type { PlayerController } from './player/playerController';
import type { Weather } from './render/weather';
import { Aircraft } from './vehicles/aircraft';
import { Car } from './vehicles/car';
import { districtAt } from './world/layout';
import type { WorldData } from './world/worldData';

export class GameAudio {
  readonly radio = new Radio(audio);
  private readonly sound = new VehicleSound(audio);
  private readonly p = {
    rpm: 0,
    load: 0,
    speed: 0,
    horn: false,
    stall: false,
    rain: 0,
    cityLevel: 1,
    altitude: 0,
  };

  constructor(weather: Weather) {
    weather.onThunder = (d) => audio.thunder(d);
  }

  cycleRadio(): void {
    audio.unlock();
    events.emit('toast', { text: `♪ ${this.radio.cycle()}`, ms: 1600 });
  }

  update(dt: number, player: PlayerController, weather: Weather, world: WorldData, muted: boolean): void {
    const v = player.vehicle;
    const p = this.p;
    let voice: EngineVoice = 'none';
    p.horn = false;
    p.stall = false;
    if (v instanceof Car) {
      voice = v.def.engineVoice;
      const t = v.telemetry();
      p.rpm = t.rpm;
      p.load = t.throttle;
      p.horn = v.horn;
    } else if (v instanceof Aircraft) {
      voice = v.kind === 'jet' ? 'jet' : v.kind === 'vtol' ? 'rotor' : 'prop';
      p.load = v.data.throttle;
      p.stall = v.data.stall;
    }
    if (player.impact > 0) {
      audio.impact(player.impact);
      player.impact = 0;
    }
    this.sound.voice = muted ? 'none' : voice;
    p.speed = muted ? 0 : player.speed();
    const pos = player.pos;
    p.altitude = pos.y - world.terrain.heightAt(pos.x, pos.z);
    p.rain = weather.rain;
    const d = districtAt(pos.x, pos.z);
    p.cityLevel = d === 'hills' ? 0.15 : d === 'core' ? 1 : 0.6;
    this.sound.update(dt, p);
  }
}
