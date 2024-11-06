// src/dynamic-platform.ts

import {
  API,
  Logging,
  PlatformAccessory,
  Service,
  Characteristic,
} from "homebridge";
import { PioneerAvr } from './pioneer-avr/pioneerAvr'; // Import PioneerAvr
import PioneerAvrPlatform from './dynamic-pioneer-avr-platform';
import packageJson from "../package.json"; // Import package.json


// Exportiere die Hauptfunktion
export = (api: API) => {
  api.registerPlatform(packageJson.name, PioneerAvrPlatform);
};
